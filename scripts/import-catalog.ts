/**
 * Builds data/catalog.db from the Dilon product export (supplements store).
 *
 *   npm run import -- [--csv "<path>"] [--out data/catalog.db] [--prices data/prices.csv] [--vacuum]
 *
 * --vacuum compacts the live file after the swap (reclaims the pages of the old catalogue; it locks the file for a few
 * seconds, so use it while the site is stopped or quiet).
 *
 * Only the shop's scope is imported: sports nutrition, healthy sports food and sports accessories (IMPORTED_CATEGORIES
 * in src/lib/taxonomy.ts; scripts/lib/classify.ts sorts every row into the taxonomy and drops medicines, adult items,
 * electronics, cosmetics, pets, clothing and junk food). Rows are grouped into families (flavours / sizes of one
 * product, src/lib/variants.ts). The export has no prices, so prices come from a prices file (see scripts/lib/price-file.ts)
 * or — as a last resort — deterministic placeholder prices, flagged in the DB so the storefront shows the "Демо версия"
 * notice. Admin edits (store.db product_edits) are re-applied on top — except stock: the export is the stock authority —
 * then prices are recomputed (promotions, Omnibus).
 *
 * Safe to run while the site is up: the catalogue is built in a temp file and copied into the live file (WAL mode, so
 * readers are never blocked) in ONE transaction, which also re-applies admin edits saved while the import was running.
 * If the swap fails the live catalogue is left untouched. At the end the running site is asked to refresh its cached
 * pages (SITE_INTERNAL_URL, default http://localhost:3000; non-fatal when the site is not running).
 */
import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse";
import Database from "better-sqlite3";
import { CtxCollector, classify, demoPrice, exclusionReason, gtinKey, hash01, nameKey, parseImages, sourceTier, stockOf } from "./lib/classify";
import { loadPriceFile, pricesOf, type FilePrice } from "./lib/price-file";
import { CATALOG_SCHEMA, CATALOG_SCHEMA_REV } from "../src/lib/catalog-schema";
import {
  affectedCards,
  brandIndex,
  deleteProductRow,
  insertCustomProduct,
  applyProductEdit,
  refreshAggregates,
  refreshFamilies,
  refreshListing,
  refreshTags,
  reindexFts,
  imageBoost,
  sampleSizes,
  snapshotProduct,
  stockBoost,
  type EditContext,
  type FamilyNameEdit,
  type ProductEditData,
  type ProductSnapshot,
} from "../src/lib/catalog-sync";
import { findCategoryIn, mergeCategories, mergeGoals } from "../src/lib/categories";
import { computePrices } from "../src/lib/price-engine";
import { brandDisplayName, brandKey, buildBrandTable, isNonSupplementBrand, knownBrands } from "../src/lib/brands";
import { analyseVariants, buildFamilies, cleanProductName, detectForm, sizeLabel, sizeSortKey, snapSizeLabels, type Size } from "../src/lib/variants";
import { flavourKey, flavourNames, isTranslatedFlavour, type FlavourNames } from "../src/lib/flavours";
import { IMPORTED_CATEGORIES, SUB_PARENT, detectDiets, detectGoals, inShopScope, isAdultOnly, productKindFor } from "../src/lib/taxonomy";
import { cleanText, normText } from "../src/lib/text-match";
import { slugify } from "../src/lib/slug";
import { STORE_SCHEMA } from "../src/lib/store-schema";
import type { ProductForm, ProductKind } from "../src/lib/catalog-types";

// ---------------------------------------------------------------------------
// CLI
const argv = process.argv.slice(2);
function arg(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}
const ROOT = path.resolve(__dirname, "..");
const CSV_PATH = path.resolve(arg("csv") ?? path.join(ROOT, "..", "entire products_export (9).csv"));
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, "data");
const OUT_PATH = path.resolve(arg("out") ?? path.join(DATA_DIR, "catalog.db"));
const STORE_PATH = path.join(DATA_DIR, "store.db");
const PRICES_PATH = arg("prices") ? path.resolve(arg("prices")!) : path.join(DATA_DIR, "prices.csv");
/** Settings row (store.db) with the highest product id ever given out — shared with lib/catalog-write.ts. */
const LAST_ID_KEY = "_last_product_id";

// Columns kept from the export (the file is 145 MB; only candidate rows are held in memory).
const KEEP = ["SKU", "Name", "EAN", "Brand", "Category", "Inventory", "Reserved", "Status", "Weight", "VAT Code", "Image URL", "Created", "Updated"] as const;
type Row = Record<(typeof KEEP)[number], string>;

// Well-known sports-nutrition / supplement brands get a small ranking bonus (brands.ts keys).
const TOP_BRANDS = new Set([
  "optimum", "myprotein", "biotech", "scitec", "now", "olimp", "gymbeam", "amix", "applied", "esn", "dymatize", "muscletech", "bsn",
  "solgar", "swanson", "ostrovit", "nutrend", "kevinlevrone", "allnutrition", "trec", "universal", "cellucor", "ghost", "thorne",
  "naturesway", "jarrowformulas", "doctorsbest", "lifeextension", "gardenoflife", "nordicnaturals", "6pak", "kfd", "everbuild",
  "weider", "grenade", "barebells", "rule1", "musclepharm", "mutant", "nutrex", "haya", "naturalfactors", "doppelherz", "walmark",
]);
const BESTSELLERS_PER_SUB = 6;

type Draft = {
  row: Row;
  sku: string;
  name: string;
  category: string;
  sub: string;
  stock: number;
  images: string[];
  ean: string | null;
};

type Product = Draft & {
  brand: string | null;
  brandSlug: string | null;
  groupKey: string;
  size: Size | null;
  sizeLabel: string | null;
  servings: number | null;
  flavour: FlavourNames | null;
  form: ProductForm | null;
  kind: ProductKind;
  adultOnly: boolean;
  goals: string[];
  diets: string[];
  basePrice: number;
  salePrice: number | null;
  demo: boolean;
  popularity: number;
};

function num(v: string | undefined): number | null {
  if (v == null) return null;
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** A setting saved in the admin panel (store.db → settings), or undefined. */
function readSetting(store: Database.Database | null, key: string): unknown {
  if (!store) return undefined;
  try {
    const row = store.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
    return row ? JSON.parse(row.value) : undefined;
  } catch {
    return undefined;
  }
}

type Previous = {
  products: Map<string, { id: number; slug: string; discountSince: string | null }>;
  /** Every SKU the catalogue ever had (sku_registry + current products): its id and slug. */
  registry: Map<string, { id: number; slug: string }>;
  groups: Map<string, number>;
  nextId: number;
};

/** Ids and slugs of the previous catalogue, so carts, wishlists, links and Omnibus dates survive a re-import. */
function readPrevious(file: string): Previous {
  const out: Previous = { products: new Map(), registry: new Map(), groups: new Map(), nextId: 1 };
  if (!fs.existsSync(file)) return out;
  try {
    const old = new Database(file, { readonly: true, fileMustExist: true });
    const has = (t: string) => !!old.prepare("SELECT 1 FROM sqlite_master WHERE name = ?").get(t);
    if (has("sku_registry")) {
      for (const r of old.prepare("SELECT sku, id, slug FROM sku_registry").all() as { sku: string; id: number; slug: string }[]) {
        out.registry.set(r.sku, { id: r.id, slug: r.slug });
        out.nextId = Math.max(out.nextId, r.id + 1);
      }
    }
    const cols = new Set((old.prepare("PRAGMA table_info(products)").all() as { name: string }[]).map((c) => c.name));
    const since = cols.has("discount_since") ? "discount_since" : "NULL AS discount_since";
    for (const r of old.prepare(`SELECT id, sku, slug, ${since} FROM products`).all() as { id: number; sku: string; slug: string; discount_since: string | null }[]) {
      out.products.set(r.sku, { id: r.id, slug: r.slug, discountSince: r.discount_since });
      out.registry.set(r.sku, { id: r.id, slug: r.slug });
      out.nextId = Math.max(out.nextId, r.id + 1);
    }
    if (has("product_groups")) {
      for (const g of old.prepare("SELECT id, key FROM product_groups").all() as { id: number; key: string }[]) out.groups.set(g.key, g.id);
    }
    old.close();
  } catch {
    out.products.clear(); // unreadable old file: fall back to fresh ids
    out.registry.clear();
    out.groups.clear();
  }
  return out;
}

/** "Портокал Natural Factors" → "Портокал": a brand written after the flavour is not part of it. */
function stripBrandTail(flavour: string, key: string | null): string | null {
  if (!key) return flavour;
  if (brandKey(flavour) === key) return null;
  const toks = flavour.split(/\s+/);
  for (let n = Math.min(4, toks.length - 1); n > 0; n--) if (brandKey(toks.slice(-n).join(" ")) === key) return toks.slice(0, -n).join(" ");
  return flavour;
}

type LateEdits = { reapplied: number; restored: number; deleted: number; added: number };

/**
 * Copy the freshly built catalogue into the live file in ONE transaction (the site reads it in WAL mode, so readers keep
 * the old catalogue until the commit and are never blocked). `inTransaction` runs inside that transaction on the live
 * connection after the copy (admin edits saved while the import was running); it gets the ids the live catalogue gave
 * to products created in the admin (read just before the old tables go). Throws on failure — the live file is then
 * unchanged.
 */
function replaceInPlace(
  tmp: string,
  out: string,
  inTransaction: (live: Database.Database, customIds: Map<string, number>) => void,
  opts: { vacuum?: boolean } = {},
) {
  const live = new Database(out);
  try {
    live.pragma("busy_timeout = 60000");
    live.pragma("journal_mode = WAL");
    live.prepare("ATTACH DATABASE ? AS fresh").run(tmp);
    type Obj = { type: string; name: string; sql: string };
    const fresh = live.prepare("SELECT type, name, sql FROM fresh.sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'").all() as Obj[];
    const isVirtual = (o: Obj) => /^CREATE VIRTUAL TABLE/i.test(o.sql);
    const virtualNames = fresh.filter(isVirtual).map((o) => o.name);
    const isShadow = (name: string) => virtualNames.some((v) => name.startsWith(`${v}_`));
    const inMain = (sql: string) => sql.replace(/^(CREATE (?:VIRTUAL |UNIQUE )?(?:TABLE|INDEX) (?:IF NOT EXISTS )?)("?)(\w+)\2/i, '$1main."$3"');
    live
      .transaction(() => {
        const old = live.prepare("SELECT type, name, sql FROM main.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as Obj[];
        const customIds = new Map<string, number>();
        if (old.some((o) => o.name === "products")) {
          for (const r of live.prepare("SELECT sku, id FROM main.products WHERE custom = 1").all() as { sku: string; id: number }[]) customIds.set(r.sku, r.id);
        }
        for (const o of old.filter(isVirtual)) live.exec(`DROP TABLE IF EXISTS main."${o.name}"`);
        for (const o of old.filter((x) => !isVirtual(x))) live.exec(`DROP TABLE IF EXISTS main."${o.name}"`);
        for (const o of fresh.filter((x) => x.type === "table" && !isShadow(x.name))) {
          live.exec(inMain(o.sql));
          if (isVirtual(o)) {
            const cols = (live.prepare(`PRAGMA fresh.table_info("${o.name}")`).all() as { name: string }[]).map((c) => `"${c.name}"`).join(", ");
            live.exec(`INSERT INTO main."${o.name}" (rowid, ${cols}) SELECT rowid, ${cols} FROM fresh."${o.name}"`);
          } else {
            live.exec(`INSERT INTO main."${o.name}" SELECT * FROM fresh."${o.name}"`);
          }
        }
        for (const o of fresh.filter((x) => x.type === "index")) live.exec(inMain(o.sql));
        inTransaction(live, customIds);
      })
      .immediate();
    live.exec("DETACH DATABASE fresh");
    // Planner statistics for the new tables (no VACUUM: it would lock out the running site; freed pages are reused).
    try {
      live.exec("ANALYZE");
      if (opts.vacuum) live.exec("VACUUM");
      live.pragma("wal_checkpoint(TRUNCATE)");
    } catch (e) {
      console.warn(`(maintenance after the swap skipped: ${(e as Error).message})`);
    }
  } finally {
    live.close();
  }
}

function pick<T>(list: T[], n: number, seed: number): T[] {
  return [...list].sort((a, b) => hash01(JSON.stringify(a), seed) - hash01(JSON.stringify(b), seed)).slice(0, n);
}

// ---------------------------------------------------------------------------
async function main() {
  const t0 = Date.now();
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV not found: ${CSV_PATH}\nPass it with --csv "<path>"`);
    process.exit(1);
  }
  console.log(`Reading ${CSV_PATH}`);
  const priceFile = loadPriceFile(PRICES_PATH);
  if (priceFile.error) {
    // A broken prices file would silently turn real prices into placeholders: stop, the live catalogue stays as it is.
    console.error(`Prices file ${PRICES_PATH}: ${priceFile.error}\nFix the file (or move it away to import placeholder prices).`);
    process.exit(1);
  }
  if (priceFile.rows) {
    console.log(`Loaded ${priceFile.rows} prices from ${PRICES_PATH} (separator ${JSON.stringify(priceFile.delimiter)})`);
  }
  if (priceFile.skipped.length) {
    console.warn(`  ${priceFile.skipped.length} line(s) of the prices file skipped:`);
    for (const s of priceFile.skipped.slice(0, 10)) console.warn(`    line ${s.line}: ${s.reason}  [${s.text}]`);
  }

  // ---- 1. Stream the export: collect the data-derived block lists and the rows of candidate source categories.
  const collector = new CtxCollector();
  const candidates: Row[] = [];
  const stats = {
    rows: 0, candidates: 0, inactive: 0, multipack: 0, noName: 0, kept: 0, gtinDuplicates: 0, nameDuplicates: 0, nonSupplementBrand: 0,
    outOfScope: 0,
  };
  const tiers = new Map<string, number>();
  const parser = fs.createReadStream(CSV_PATH).pipe(
    parse({ columns: true, bom: true, relax_column_count: true, relax_quotes: true, skip_empty_lines: true }),
  );
  for await (const raw of parser as AsyncIterable<Record<string, string>>) {
    stats.rows++;
    collector.add(raw);
    const tier = sourceTier(raw.Category ?? "");
    if (tier === null) continue;
    tiers.set(tier, (tiers.get(tier) ?? 0) + 1);
    const row = {} as Row;
    for (const k of KEEP) row[k] = raw[k] ?? "";
    candidates.push(row);
  }
  stats.candidates = candidates.length;
  const ctx = collector.build();
  console.log(`${stats.rows} rows, ${candidates.length} in candidate categories (${Date.now() - t0} ms)`);

  // ---- 2. Select and classify. Inactive rows and multi-pack SKUs ("2xDilon-…") are never sold.
  const reasons = new Map<string, number>();
  const excludedSamples = new Map<string, string[]>();
  const exclude = (reason: string, row: Row) => {
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    const list = excludedSamples.get(reason) ?? [];
    list.push(`${cleanText(row.Name)}  [${cleanText(row.Brand) || "-"} · ${row.Category || "-"}]`);
    excludedSamples.set(reason, list);
  };
  const kept: Draft[] = [];
  for (const row of candidates) {
    if (row.Status.trim() !== "Active") {
      stats.inactive++;
      continue;
    }
    if (/^\d+x/i.test(row.SKU.trim())) {
      stats.multipack++;
      continue;
    }
    const name = normText(row.Name);
    if (!name) {
      stats.noName++;
      continue;
    }
    const reason = exclusionReason(name, normText(row.Brand), row["Image URL"], row["VAT Code"], ctx);
    if (reason) {
      exclude(reason, row);
      continue;
    }
    const c = classify(row.Name, row.Brand, row.Category, row["VAT Code"]);
    if (c.category === null) {
      exclude(c.reason, row);
      continue;
    }
    const ean = row.EAN.trim().replace(/\.0$/, "");
    kept.push({
      row,
      sku: row.SKU.trim(),
      name: cleanText(row.Name),
      category: c.category,
      sub: c.sub,
      stock: stockOf(row.Inventory, row.Reserved),
      images: parseImages(row["Image URL"]),
      ean: /^\d{8,14}$/.test(ean) ? ean : null,
    });
  }
  stats.kept = kept.length;

  // ---- 3. Dedupe: one row per GTIN, then per normalised name. Preference: in stock > has image > not a pack > newest.
  type Score = [number, number, number, string];
  const better = (a: Score, b: Score) => {
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
    return a[3] > b[3];
  };
  const pass = (items: Draft[], keyOf: (d: Draft) => string, withPack: boolean): [Draft[], number] => {
    const best = new Map<string, { item: Draft; score: Score }>();
    let dups = 0;
    for (const d of items) {
      const score: Score = [d.stock > 0 ? 1 : 0, d.images.length ? 1 : 0, withPack ? (d.row.Category.startsWith("Pack") ? 0 : 1) : 0, d.row.Updated];
      const k = keyOf(d);
      const prev = best.get(k);
      if (prev) {
        dups++;
        if (better(score, prev.score)) best.set(k, { item: d, score });
      } else best.set(k, { item: d, score });
    }
    return [[...best.values()].map((v) => v.item), dups];
  };
  let drafts: Draft[];
  [drafts, stats.gtinDuplicates] = pass(kept, (d) => gtinKey(d.row.EAN) ?? `n:${nameKey(d.row.Name)}`, true);
  [drafts, stats.nameDuplicates] = pass(drafts, (d) => nameKey(d.row.Name), false);

  // ---- 4. Brands, variants (size / flavour), shop scope and families.
  const brandTable = buildBrandTable(candidates.filter((r) => !/^\d+x/i.test(r.SKU)).map((r) => r.Brand));
  const known = knownBrands(brandTable);
  const variants = analyseVariants(
    drafts.map((d) => ({ sku: d.sku, name: d.row.Name, brandRaw: d.row.Brand, inStock: d.stock > 0, draft: d })),
    brandTable,
    known,
  );
  const scopeDropped = new Map<string, number>();
  const selected = variants.filter((v) => {
    // Only the shop's categories (taxonomy.ts IMPORTED_CATEGORIES); vitamins etc. only when clearly sports products.
    if (!inShopScope(v.draft.category, v.draft.sub, v.draft.name, v.brandKey)) {
      stats.outOfScope++;
      scopeDropped.set(v.draft.category, (scopeDropped.get(v.draft.category) ?? 0) + 1);
      exclude(`out-of-scope: ${v.draft.category}`, v.draft.row);
      return false;
    }
    // Brands that are clearly not supplement makers (cosmetics, groceries, electronics) — accessories excepted.
    if (isNonSupplementBrand(v.brandKey) && v.draft.category !== "sportni-aksesoari") {
      stats.nonSupplementBrand++;
      exclude("non-supplement-brand", v.draft.row);
      return false;
    }
    return true;
  });
  const familyOf = new Map<string, string>();
  const families = buildFamilies(selected);
  for (const f of families) for (const m of f.members) familyOf.set(m.sku, f.key);
  const multiKeys = new Set(families.filter((f) => f.members.length > 1).map((f) => f.key));

  let fromPriceFile = 0;
  const products: Product[] = selected.map((v) => {
    const d = v.draft;
    const brand = v.brandKey ? brandDisplayName(v.brandKey, brandTable, known) : null;
    let form = detectForm(d.row.Name, v.size);
    const kind = productKindFor(d.name, d.category, d.sub);
    if (d.category === "sportni-aksesoari") form = "accessory";
    else if (!form && kind === "food") form = "food";
    const gtin = gtinKey(d.ean);
    const fromFile: FilePrice | undefined = priceFile.bySku.get(d.sku.toLowerCase()) ?? (gtin ? priceFile.byEan.get(gtin) : undefined);
    let basePrice: number;
    let salePrice: number | null = null;
    let demo = false;
    if (fromFile) {
      const p = pricesOf(fromFile);
      basePrice = p.base;
      salePrice = p.sale;
      fromPriceFile++;
    } else {
      const p = demoPrice(d.sku, d.sub, normText(d.row.Name), d.stock);
      demo = true;
      // The placeholder model yields the current price plus (for ~18 %) a higher earlier price: that is a sale.
      basePrice = p.old ?? p.price;
      salePrice = p.old ? p.price : null;
    }
    // In stock first, then with a picture; well-known brands and products sold in several flavours / sizes rank higher.
    const popularity = Math.round(
      stockBoost(d.stock) +
        imageBoost(d.images[0]) +
        (v.brandKey && TOP_BRANDS.has(v.brandKey) ? 600 : 0) +
        (multiKeys.has(familyOf.get(d.sku) ?? "") ? 200 : 0) +
        (d.images.length > 1 ? 40 : 0) +
        Math.min(d.stock, 20) * 3 +
        hash01(d.sku, 3) * 400,
    );
    // A "flavour" that is really the brand ("… 250 дози Natural Factors") is dropped; a brand after it is cut off.
    const flavourRaw = v.flavour ? stripBrandTail(v.flavour, v.brandKey) : null;
    return {
      ...d,
      // Shown name: the Kaufland feed's " / 0.454g." as a real size, the brand in its display spelling.
      name: cleanProductName(d.name, brand),
      brand,
      brandSlug: brand ? slugify(brand) || null : null,
      groupKey: familyOf.get(d.sku) ?? `single#${d.sku}`,
      size: v.size,
      sizeLabel: v.size ? sizeLabel(v.size) : null,
      servings: v.servings,
      flavour: flavourNames(flavourRaw),
      form,
      kind,
      adultOnly: isAdultOnly(d.name, d.category, d.sub),
      goals: detectGoals(d.name, d.category, d.sub),
      diets: detectDiets(d.name, d.sub),
      basePrice,
      salePrice,
      demo,
      popularity,
    };
  });

  // One spelling per flavour across the catalogue ("Бисквити с крем" / "Cookies & Cream" / "Бисквита с Крем" → the
  // most common Bulgarian form; its English form likewise), so filters and variant chips never show one flavour twice.
  const flavourGroups = new Map<string, Product[]>();
  for (const p of products) {
    if (!p.flavour) continue;
    const k = flavourKey(p.flavour);
    const list = flavourGroups.get(k);
    if (list) list.push(p);
    else flavourGroups.set(k, [p]);
  }
  const mostCommon = (xs: (string | null)[]) => {
    const n = new Map<string, number>();
    for (const x of xs) if (x) n.set(x, (n.get(x) ?? 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
  };
  for (const list of flavourGroups.values()) {
    // Prefer a Bulgarian spelling for the Bulgarian shop when the group has one.
    const bg = mostCommon(list.map((p) => (/[а-я]/i.test(p.flavour!.bg) ? p.flavour!.bg : null))) ?? mostCommon(list.map((p) => p.flavour!.bg))!;
    const en = mostCommon(list.map((p) => p.flavour!.en));
    for (const p of list) p.flavour = { bg, en };
  }

  // Near-equal pack sizes of a family share one selector label ("2,04 кг" / "2,084 кг"); net quantity stays exact.
  const byFamily = new Map<string, Product[]>();
  for (const p of products) if (multiKeys.has(p.groupKey)) byFamily.set(p.groupKey, [...(byFamily.get(p.groupKey) ?? []), p]);
  let snapped = 0;
  for (const members of byFamily.values()) {
    const labels = snapSizeLabels(members.map((p) => ({ value: p.size ? sizeSortKey(p.size) : null, unit: p.size?.unit ?? null, label: p.sizeLabel })));
    members.forEach((p, i) => {
      if (labels[i] !== p.sizeLabel) snapped++;
      p.sizeLabel = labels[i];
    });
  }

  // ---- 5. Write a fresh catalogue into a temp file.
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const store = new Database(STORE_PATH);
  store.pragma("journal_mode = WAL");
  store.pragma("busy_timeout = 10000");
  store.exec(STORE_SCHEMA);
  const previous = readPrevious(OUT_PATH);
  const lastId = Number(readSetting(store, LAST_ID_KEY) ?? 0);
  const tmp = `${OUT_PATH}.tmp`;
  for (const f of [tmp, `${tmp}-journal`, `${tmp}-wal`, `${tmp}-shm`]) if (fs.existsSync(f)) fs.rmSync(f);
  const db = new Database(tmp);
  db.pragma("journal_mode = OFF");
  db.pragma("synchronous = OFF");
  db.exec(CATALOG_SCHEMA);

  // Ids are never reused (carts, wishlists and links refer to them): a SKU keeps the id it ever had, a new one gets an
  // id above every id handed out so far (also by the admin, settings "_last_product_id").
  let nextId = Math.max(previous.nextId, (Number.isInteger(lastId) ? lastId : 0) + 1);
  const idFor = (sku: string) => previous.registry.get(sku)?.id ?? nextId++;
  // Families keep their ids too (the cart remembers a line's family).
  const insGroupStub = db.prepare("INSERT INTO product_groups (id, key, name) VALUES (?, ?, '')");
  for (const [key, id] of previous.groups) if (multiKeys.has(key)) insGroupStub.run(id, key);

  const insert = db.prepare(`
    INSERT INTO products (id, sku, slug, name, brand, brand_slug, ean, category, subcategory, image, images, base_price, sale_price, price,
      discount_since, demo_price, stock, hidden, custom, group_key, auto_group_key, is_primary, flavour, flavour_en, size_label, size_value,
      size_unit, servings, form, net_quantity, is_supplement, product_kind, adult_only, goals, diets, weight, vat_code, popularity,
      source_category, created_at, updated_at)
    VALUES (@id, @sku, @slug, @name, @brand, @brand_slug, @ean, @category, @subcategory, @image, @images, @base_price, @sale_price, @price,
      @discount_since, @demo_price, @stock, 0, 0, @group_key, @group_key, 1, @flavour, @flavour_en, @size_label, @size_value,
      @size_unit, @servings, @form, @net_quantity, @is_supplement, @product_kind, @adult_only, @goals, @diets, @weight, @vat_code,
      @popularity, @source_category, @created_at, @updated_at)
  `);
  const usedSlugs = new Set<string>();
  // A slug that belonged to another SKU is never handed out again (an old link must not open a different product).
  const takenSlugs = new Map<string, string>();
  for (const [sku, r] of previous.registry) takenSlugs.set(r.slug, sku);
  db.transaction(() => {
    for (const p of products) {
      const prev = previous.registry.get(p.sku);
      const skuPart = slugify(p.sku.replace(/^dilon-/i, "")) || slugify(p.sku);
      let slug = prev?.slug ?? `${slugify(p.name, 70)}-${skuPart}`.replace(/^-+/, "");
      while (usedSlugs.has(slug) || (takenSlugs.has(slug) && takenSlugs.get(slug) !== p.sku)) slug += "-x";
      usedSlugs.add(slug);
      insert.run({
        id: idFor(p.sku),
        sku: p.sku,
        slug,
        name: p.name,
        brand: p.brand,
        brand_slug: p.brandSlug,
        ean: p.ean,
        category: p.category,
        subcategory: p.sub,
        image: p.images[0] ?? null,
        images: JSON.stringify(p.images),
        base_price: p.basePrice,
        sale_price: p.salePrice,
        price: p.basePrice,
        discount_since: previous.products.get(p.sku)?.discountSince ?? null,
        demo_price: p.demo ? 1 : 0,
        stock: p.stock,
        group_key: p.groupKey,
        flavour: p.flavour?.bg ?? null,
        flavour_en: p.flavour?.en ?? null,
        size_label: p.sizeLabel,
        size_value: p.size ? sizeSortKey(p.size) : null,
        size_unit: p.size?.unit ?? null,
        servings: p.servings,
        form: p.form,
        net_quantity: p.size ? sizeLabel(p.size) : null,
        is_supplement: p.kind === "supplement" ? 1 : 0,
        product_kind: p.kind,
        adult_only: p.adultOnly ? 1 : 0,
        goals: JSON.stringify(p.goals),
        diets: JSON.stringify(p.diets),
        weight: num(p.row.Weight),
        vat_code: p.row["VAT Code"] || null,
        popularity: p.popularity,
        source_category: p.row.Category,
        created_at: p.row.Created || null,
        updated_at: p.row.Updated || null,
      });
    }
  })();

  // ---- 6. Changes made in the admin panel live in data/store.db and win over the CSV — except stock (the export is
  // the stock authority; an admin stock change lasts until the next import).
  const categories = mergeCategories(readSetting(store, "categories"));
  const goals = mergeGoals(readSetting(store, "goals"));
  const makeCtx = (target: Database.Database): EditContext => ({
    resolveCategory: (slug) => {
      const f = findCategoryIn(categories, slug);
      return f ? { category: f.category.slug, sub: f.sub?.slug ?? null } : null;
    },
    brands: brandIndex(target),
    now: new Date().toISOString(),
  });
  const editCtx = makeCtx(db);
  const edits = { applied: 0, custom: 0, missing: 0, stockIgnored: 0 };
  type EditRow = { sku: string; custom: number; deleted: number; data: string; updated_at: string };
  // Edits saved from now on are picked up again inside the swap (a 2 s margin for clocks of other processes).
  const editsReadAt = new Date(Date.now() - 2000).toISOString();
  const editRows = store.prepare("SELECT sku, custom, deleted, data, updated_at FROM product_edits").all() as EditRow[];
  type EditData = ProductEditData & FamilyNameEdit & { name?: string; price?: number; category?: string; created?: string };
  const parseEdit = (r: EditRow): EditData | null => {
    try {
      return JSON.parse(r.data) as EditData;
    } catch {
      return null;
    }
  };
  /** The edit as re-applied at import: without stock for CSV products. */
  const withoutStock = (data: EditData): EditData => {
    const rest = { ...data };
    if ("stock" in rest) {
      delete rest.stock;
      edits.stockIgnored++;
    }
    return rest;
  };
  // The CSV values of every edited product, for an admin "restore" that happens while the import runs.
  const csvState = new Map<string, ProductSnapshot>();
  db.transaction(() => {
    for (const r of editRows) {
      if (r.deleted) continue;
      const data = parseEdit(r);
      if (!data) continue;
      if (r.custom) {
        if (db.prepare("SELECT 1 FROM products WHERE sku = ?").get(r.sku) || !data.name || !data.price || !data.category) continue;
        insertCustomProduct(db, r.sku, { ...data, name: data.name, price: data.price, category: data.category }, {
          ctx: editCtx,
          id: previous.registry.get(r.sku)?.id ?? nextId++,
          created: data.created,
        });
        edits.custom++;
        continue;
      }
      const snap = snapshotProduct(db, r.sku);
      if (snap) csvState.set(r.sku, snap);
      if (applyProductEdit(db, r.sku, withoutStock(data), editCtx)) edits.applied++;
      else edits.missing++;
    }
  })();
  if (edits.applied || edits.custom || edits.missing) {
    console.log(
      `Admin edits re-applied: ${edits.applied} changed, ${edits.custom} added in admin, ${edits.missing} no longer in the shop` +
        (edits.stockIgnored ? ` (stock taken from the export for ${edits.stockIgnored})` : ""),
    );
  }

  // ---- 7. Derived data: families, placeholder bestsellers, facet tags, search index, prices, aggregates.
  db.transaction(() => {
    refreshFamilies(db);
    // Placeholder "bestsellers" until there are real sales: the most popular in-stock cards with a picture per subcategory.
    db.exec(`
      UPDATE products SET bestseller = 1 WHERE id IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY category, subcategory ORDER BY popularity DESC) AS rn FROM products
          WHERE is_primary = 1 AND hidden = 0 AND stock > 0 AND image IS NOT NULL AND category <> 'sportni-aksesoari'
        ) WHERE rn <= ${BESTSELLERS_PER_SUB}
      )
    `);
    refreshTags(db);
    reindexFts(db);
  })();
  const priced = computePrices(db, store);
  refreshListing(db);
  refreshAggregates(db, categories, goals);

  // Every SKU ever imported keeps its id and slug for a later import (sku_registry).
  const maxId = db.transaction(() => {
    const reg = db.prepare("INSERT OR REPLACE INTO sku_registry (sku, id, slug) VALUES (?, ?, ?)");
    for (const [sku, r] of previous.registry) reg.run(sku, r.id, r.slug);
    for (const r of db.prepare("SELECT sku, id, slug FROM products").all() as { sku: string; id: number; slug: string }[]) reg.run(r.sku, r.id, r.slug);
    return (db.prepare("SELECT MAX(id) AS m FROM sku_registry").get() as { m: number | null }).m ?? 0;
  })();

  const meta = db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)");
  const demoCount = (db.prepare("SELECT COUNT(*) AS n FROM products WHERE demo_price = 1").get() as { n: number }).n;
  meta.run("imported_at", new Date().toISOString());
  meta.run("schema_rev", String(CATALOG_SCHEMA_REV));
  meta.run("source_file", path.basename(CSV_PATH));
  meta.run("product_count", String(products.length));
  meta.run("demo_prices", demoCount > 0 ? "1" : "0");
  meta.run("demo_price_count", String(demoCount));
  db.exec("ANALYZE; VACUUM;");
  db.close();

  // ---- 8. Swap the new catalogue in; admin edits saved during the import are re-applied in the same transaction.
  const late: LateEdits = { reapplied: 0, restored: 0, deleted: 0, added: 0 };
  const reapplyLate = (live: Database.Database, customIds: Map<string, number>) => {
    const rows = store.prepare("SELECT sku, custom, deleted, data, updated_at FROM product_edits WHERE updated_at >= ?").all(editsReadAt) as EditRow[];
    const now = new Set((store.prepare("SELECT sku FROM product_edits").all() as { sku: string }[]).map((r) => r.sku));
    const gone = editRows.filter((r) => !r.custom && !now.has(r.sku)).map((r) => r.sku); // "restore original" meanwhile
    if (!rows.length && !gone.length) return;
    const ctxLive = makeCtx(live);
    const touched: { id: number; sku: string; oldCard: number | null; keys: string[] }[] = [];
    const keyOfSku = (sku: string) => {
      const r = live.prepare("SELECT id, card_id, group_key FROM products WHERE sku = ?").get(sku) as { id: number; card_id: number | null; group_key: string | null } | undefined;
      return r ? { id: r.id, card: r.card_id, key: r.group_key || `single#${sku}` } : null;
    };
    for (const r of rows) {
      const data = parseEdit(r);
      const before = keyOfSku(r.sku);
      if (r.deleted) {
        if (r.custom && before) {
          deleteProductRow(live, r.sku);
          touched.push({ id: before.id, sku: r.sku, oldCard: before.card, keys: [before.key] });
          late.deleted++;
        }
        continue;
      }
      if (!data) continue;
      if (r.custom && !before) {
        if (!data.name || !data.price || !data.category) continue;
        // The id the admin gave it (unless the new catalogue already uses that id for a new CSV product).
        const liveId = customIds.get(r.sku);
        const free = (id: number | undefined) => id !== undefined && !live.prepare("SELECT 1 FROM products WHERE id = ?").get(id);
        const maxNow = (live.prepare("SELECT COALESCE(MAX(id), 0) AS m FROM products").get() as { m: number }).m;
        const id = insertCustomProduct(live, r.sku, { ...data, name: data.name, price: data.price, category: data.category }, {
          ctx: ctxLive,
          id: free(liveId) ? liveId : Math.max(maxNow, Number(readSetting(store, LAST_ID_KEY) ?? 0), nextId) + 1,
          created: data.created,
        });
        touched.push({ id, sku: r.sku, oldCard: null, keys: [`single#${r.sku}`] });
        late.added++;
        continue;
      }
      const fx = applyProductEdit(live, r.sku, r.custom ? data : withoutStock(data), ctxLive);
      if (fx && before) {
        touched.push({ id: fx.id, sku: r.sku, oldCard: before.card, keys: [before.key, ...fx.familyKeys] });
        late.reapplied++;
      }
    }
    for (const sku of gone) {
      const snap = csvState.get(sku);
      const before = keyOfSku(sku);
      if (!snap || !before) continue;
      const { demoPrice: demo, ...data } = snap;
      const fx = applyProductEdit(live, sku, data, ctxLive);
      live.prepare("UPDATE products SET admin_edited = 0, demo_price = ? WHERE sku = ?").run(demo ? 1 : 0, sku);
      if (fx) touched.push({ id: fx.id, sku, oldCard: before.card, keys: [before.key, ...fx.familyKeys] });
      late.restored++;
    }
    if (!touched.length) return;
    const ids = touched.map((t) => t.id);
    reindexFts(live, ids.filter((id) => live.prepare("SELECT 1 FROM products WHERE id = ?").get(id)));
    const keys = touched.flatMap((t) => t.keys);
    for (const t of touched) {
      const k = keyOfSku(t.sku);
      if (k) keys.push(k.key);
    }
    refreshFamilies(live, keys);
    const cards = affectedCards(live, [...ids, ...touched.map((t) => t.oldCard).filter((c): c is number => c !== null)]);
    refreshTags(live, cards);
    refreshListing(live, cards);
    computePrices(live, store, { skus: touched.map((t) => t.sku) });
    refreshAggregates(live, categories, goals);
  };
  if (!fs.existsSync(OUT_PATH)) {
    // First import: nobody reads the file yet. WAL is set now so the site never runs in rollback-journal mode.
    const first = new Database(tmp);
    first.pragma("journal_mode = WAL");
    first.close();
    fs.renameSync(tmp, OUT_PATH);
  } else {
    try {
      replaceInPlace(tmp, OUT_PATH, reapplyLate, { vacuum: argv.includes("--vacuum") });
      fs.rmSync(tmp);
    } catch (e) {
      // Never delete or overwrite the live catalogue here: the shop keeps working with the previous one.
      console.error(
        `Could not update ${OUT_PATH} (${(e as Error).message}).\nThe live catalogue is unchanged. The new catalogue was kept in ${tmp}:` +
          ` run the import again, or stop the site and replace catalog.db with it.`,
      );
      store.close();
      process.exit(1);
    }
  }
  if (late.reapplied || late.restored || late.deleted || late.added) {
    console.log(`Admin changes saved during the import applied too: ${late.reapplied} edited, ${late.added} added, ${late.deleted} deleted, ${late.restored} restored`);
  }

  // A stock value typed in the admin expires with this import (the export is the stock authority).
  const stockExpired = store
    .prepare("UPDATE product_edits SET data = json_remove(data, '$.stock') WHERE custom = 0 AND json_valid(data) AND json_type(data, '$.stock') IS NOT NULL")
    .run().changes;
  // Ids handed out, so the admin never reuses one (lib/catalog-write.ts reads the same setting).
  if (maxId > (Number.isInteger(lastId) ? lastId : 0)) {
    store
      .prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
      .run(LAST_ID_KEY, JSON.stringify(maxId), new Date().toISOString());
  }

  // ---- 9. Human-readable report for checking the classifier.
  writeReport({
    stats,
    tiers,
    reasons,
    excludedSamples,
    edits: { ...edits, stockExpired },
    late,
    priced: priced.changed,
    elapsed: Date.now() - t0,
    prices: { file: fs.existsSync(PRICES_PATH) ? PRICES_PATH : null, rows: priceFile.rows, used: fromPriceFile, skipped: priceFile.skipped },
    scopeDropped,
    snapped,
  });
  store.close();

  // ---- 10. Refresh the running site's cached pages (home, brands …). Non-fatal.
  try {
    const { requestSiteRevalidate } = await import("../src/lib/revalidate");
    const ok = await requestSiteRevalidate({ timeoutMs: 15000 });
    console.log(ok ? "Asked the running site to refresh its cached pages." : "Site pages were not refreshed now (they refresh on their own interval).");
  } catch (e) {
    console.warn(`Could not ask the site to refresh its pages: ${(e as Error).message}`);
  }
}

type ReportInput = {
  stats: Record<string, number>;
  tiers: Map<string, number>;
  reasons: Map<string, number>;
  excludedSamples: Map<string, string[]>;
  edits: { applied: number; custom: number; missing: number; stockIgnored: number; stockExpired: number };
  late: LateEdits;
  priced: number;
  elapsed: number;
  prices: { file: string | null; rows: number; used: number; skipped: { line: number; reason: string; text: string }[] };
  scopeDropped: Map<string, number>;
  snapped: number;
};

function writeReport(r: ReportInput) {
  const db = new Database(OUT_PATH, { readonly: true });
  const one = <T>(sql: string, ...params: unknown[]) => db.prepare(sql).get(...params) as T;
  const lines: string[] = [];
  const n = (sql: string) => one<{ n: number }>(sql).n;
  const total = n("SELECT COUNT(*) AS n FROM products");
  const cards = n("SELECT COUNT(*) AS n FROM products WHERE is_primary = 1 AND hidden = 0");
  const s = r.stats;
  const flav = db.prepare("SELECT flavour, flavour_en FROM products WHERE flavour IS NOT NULL AND hidden = 0").all() as { flavour: string; flavour_en: string | null }[];
  const untranslated = flav.filter((f) => !isTranslatedFlavour(f.flavour, f.flavour_en)).length;
  const famRows = db
    .prepare("SELECT p.group_id AS g, p.id, p.size_value, p.size_unit, p.size_label FROM products p WHERE p.group_id IS NOT NULL AND p.hidden = 0")
    .all() as { g: number; id: number; size_value: number | null; size_unit: string | null; size_label: string | null }[];
  const byG = new Map<number, typeof famRows>();
  for (const x of famRows) byG.set(x.g, [...(byG.get(x.g) ?? []), x]);
  let samples = 0;
  for (const m of byG.values()) samples += sampleSizes(m).size;
  lines.push(
    `Import ${new Date().toISOString()} (${(r.elapsed / 1000).toFixed(1)} s) from ${path.basename(CSV_PATH)}`,
    "",
    `Shop scope (taxonomy.ts IMPORTED_CATEGORIES): ${IMPORTED_CATEGORIES.map((c) => c.category + (c.subs ? `[${c.subs.length} subs]` : "") + (c.sportsOnly ? "*" : "")).join(", ")}  (* = sports products only)`,
    "",
    `Rows read:                    ${s.rows}`,
    `Rows in candidate categories: ${s.candidates}  (${[...r.tiers].map(([k, v]) => `${k} ${v}`).join(", ")})`,
    `Inactive (skipped):           ${s.inactive}`,
    `Multi-pack SKUs (skipped):    ${s.multipack}`,
    `Excluded:                     ${[...r.reasons.values()].reduce((a, b) => a + b, 0)}`,
    ...[...r.reasons].sort((a, b) => b[1] - a[1]).map(([k, v]) => `    ${k.padEnd(40)} ${v}`),
    `Classified and kept:          ${s.kept}  (before the shop scope)`,
    `Outside the shop scope:       ${s.outOfScope}`,
    `Duplicates merged:            ${s.gtinDuplicates} (GTIN / name) + ${s.nameDuplicates} (same name, other EAN)`,
    `Imported products:            ${total}`,
    `Listing cards (families):     ${cards}`,
    `Families (>= 2 variants):     ${n("SELECT COUNT(*) AS n FROM product_groups")} covering ${n("SELECT COUNT(*) AS n FROM products WHERE group_id IS NOT NULL")} products`,
    `  sample packs kept out of "от" prices: ${samples}; near-equal size labels merged: ${r.snapped}`,
    `In stock:                     ${n("SELECT COUNT(*) AS n FROM products WHERE stock > 0")}`,
    `With image:                   ${n("SELECT COUNT(*) AS n FROM products WHERE image IS NOT NULL")} products, ${n("SELECT COUNT(*) AS n FROM products WHERE is_primary = 1 AND image IS NOT NULL")} cards`,
    `With pack size / flavour:     ${n("SELECT COUNT(*) AS n FROM products WHERE size_label IS NOT NULL")} / ${flav.length}  (flavours without English: ${untranslated})`,
    `Brands:                       ${n("SELECT COUNT(*) AS n FROM brands")} (${n("SELECT COUNT(*) AS n FROM brands WHERE count >= 2")} with >= 2 cards — the brand index)`,
    `Prices file:                  ${r.prices.file ? `${r.prices.rows} rows, used for ${r.prices.used} products, ${r.prices.skipped.length} lines skipped` : "none (placeholder prices)"}`,
    ...r.prices.skipped.slice(0, 20).map((x) => `    line ${x.line}: ${x.reason}  [${x.text}]`),
    `Placeholder prices:           ${n("SELECT COUNT(*) AS n FROM products WHERE demo_price = 1")} (on sale: ${n("SELECT COUNT(*) AS n FROM products WHERE old_price IS NOT NULL")})`,
    `18+ (caffeine / pre-workout): ${n("SELECT COUNT(*) AS n FROM products WHERE adult_only = 1")}`,
    `Kinds:                        ${(db.prepare("SELECT product_kind AS k, COUNT(*) AS n FROM products GROUP BY product_kind ORDER BY n DESC").all() as { k: string; n: number }[]).map((x) => `${x.k} ${x.n}`).join(", ")}`,
    `Admin edits re-applied:       ${r.edits.applied} (+${r.edits.custom} custom, ${r.edits.missing} no longer in the shop; stock taken from the export for ${r.edits.stockIgnored}, ${r.edits.stockExpired} stored stock values expired)`,
    `Admin edits during import:    ${r.late.reapplied} edited, ${r.late.added} added, ${r.late.deleted} deleted, ${r.late.restored} restored`,
    `Prices recomputed:            ${r.priced}`,
    "",
    "Dropped by the shop scope (per classified top category):",
    ...[...r.scopeDropped].sort((a, b) => b[1] - a[1]).map(([k, v]) => `    ${k.padEnd(32)} ${v}`),
    "",
    "Categories (products / cards / in stock / with image):",
  );
  const cats = db.prepare("SELECT slug, parent, name, count FROM categories ORDER BY COALESCE(parent, slug), parent IS NOT NULL, position").all() as {
    slug: string;
    parent: string | null;
    name: string;
    count: number;
  }[];
  const catOrder = db.prepare("SELECT slug FROM categories WHERE parent IS NULL ORDER BY position").all() as { slug: string }[];
  const stat = db.prepare(
    `SELECT COUNT(*) AS n, SUM(is_primary) AS c, SUM(stock > 0) AS s, SUM(image IS NOT NULL) AS i FROM products WHERE category = ? AND (? IS NULL OR subcategory = ?)`,
  );
  for (const top of catOrder) {
    for (const c of cats.filter((x) => x.slug === top.slug || x.parent === top.slug)) {
      const x = stat.get(c.parent ?? c.slug, c.parent ? c.slug : null, c.parent ? c.slug : null) as { n: number; c: number; s: number; i: number };
      if (!x.n) continue;
      lines.push(`${c.parent ? "    " : ""}${c.name} (${c.slug}): ${x.n} / ${x.c ?? 0} / ${x.s ?? 0} / ${x.i ?? 0}`);
    }
  }
  lines.push("", "Goals (cards):");
  for (const g of db.prepare("SELECT slug, name, count FROM goals ORDER BY position").all() as { slug: string; name: string; count: number }[]) {
    lines.push(`    ${g.name} (${g.slug}): ${g.count}`);
  }
  lines.push("", "Samples per subcategory:");
  const sample = db.prepare(
    `SELECT name, brand, price, flavour, size_label, adult_only FROM products WHERE subcategory = ? ORDER BY (hash) LIMIT 8`.replace(
      "(hash)",
      "(id * 2654435761) % 1000003",
    ),
  );
  for (const sub of Object.keys(SUB_PARENT)) {
    const rows = sample.all(sub) as { name: string; brand: string | null; price: number; flavour: string | null; size_label: string | null; adult_only: number }[];
    if (!rows.length) continue;
    lines.push(`--- ${SUB_PARENT[sub]} / ${sub}`);
    for (const p of rows) {
      lines.push(`  ${p.price.toFixed(2).padStart(7)}  ${p.name}  [${p.brand ?? "-"}]${p.adult_only ? " 18+" : ""}${p.flavour || p.size_label ? ` {${[p.flavour, p.size_label].filter(Boolean).join(" · ")}}` : ""}`);
    }
  }
  lines.push("", "Excluded samples per reason:");
  for (const [reason, list] of [...r.excludedSamples].sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`--- ${reason} (${list.length})`);
    for (const x of pick(list, 10, 5)) lines.push(`  ${x}`);
  }
  db.close();
  const reportPath = path.join(path.dirname(OUT_PATH), "import-report.txt");
  fs.writeFileSync(reportPath, lines.join("\n"), "utf8");
  console.log(lines.slice(0, 48).join("\n"));
  console.log(`\nWrote ${OUT_PATH}\nReport: ${reportPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
