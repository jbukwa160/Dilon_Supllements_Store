/**
 * Image collector: finds OFFICIAL MANUFACTURER packshots for products that have no picture and applies them.
 *
 *   npm run images -- [--brand "Olimp Sport Nutrition,OstroVit"] [--limit 50] [--dry-run] [--all-stock]
 *                     [--min-score 0.8] [--work-dir <dir>] [--refresh] [--no-revalidate]
 *
 * (= tsx --conditions=react-server scripts/fetch-images.ts …; the condition lets the script import the site's
 * "server-only" modules.)
 *
 * - Targets: visible products (hidden = 0) without an image; by default only in-stock ones plus the out-of-stock
 *   variants of the same families (--all-stock: every product without an image).
 * - Sources: scripts/lib/brand-sources.ts — only the brands' own sites (Shopify /products.json, sitemaps + JSON-LD,
 *   the brand's own shop). Never other retailers. Responses are cached in <work-dir>/cache, so reruns are cheap.
 * - Matching (scripts/lib/image-match.ts): EAN/GTIN first, then name + flavour + size. Only confident matches are
 *   applied; the rest is listed for review (<work-dir>/review.csv, candidate pictures in <work-dir>/review/).
 * - Applying: the picture is checked by content (src/lib/uploads.ts sniff, ≥ 250 px, ≤ 5 MB), saved in data/uploads
 *   under a random name like an admin upload, and set with saveProductEdits so it survives CSV re-imports.
 *   Provenance (SKU → official page + image URL) is merged into data/image-sources.csv.
 * - --dry-run downloads the pictures into <work-dir>/preview/ and changes nothing.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { catalogDb, DATA_DIR } from "../src/lib/db";
import { UPLOAD_DIR, sniff } from "../src/lib/uploads";
import { saveProductEdits } from "../src/lib/catalog-write";
import { requestSiteRevalidate } from "../src/lib/revalidate";
import { fetchStats, getBinary, initFetch } from "./lib/polite-fetch";
import { imageFlavourConflict, matchTarget, prepare, type Match, type Target } from "./lib/image-match";
import { BRAND_SOURCES, brandWordsOf } from "./lib/brand-sources";
import type { SourceItem } from "./lib/image-sources";


// ---------------------------------------------------------------------------
// Options

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : "true";
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const DRY = flag("dry-run");
const ALL_STOCK = flag("all-stock") || arg("in-stock-only") === "false";
const LIMIT = Number(arg("limit") ?? 0) || 0;
const MIN_SCORE = Number(arg("min-score") ?? 0.8);
const BRANDS = (arg("brand") ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const WORK = path.resolve(arg("work-dir") ?? process.env.IMG_WORK_DIR ?? path.join(os.tmpdir(), "dilon-image-collector"));
const MAX_BYTES = 5 * 1024 * 1024;
const MIN_SIDE = 250;

initFetch(path.join(WORK, "cache"), { refresh: flag("refresh") });

// ---------------------------------------------------------------------------
// CSV

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeCsv(file: string, header: string[], rows: unknown[][]) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "\uFEFF" + [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n");
}

function readCsv(file: string): string[][] {
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ";") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.slice(1).filter((r) => r.length > 1);
}

// ---------------------------------------------------------------------------
// Images

function dimensions(buf: Buffer, ext: string): { w: number; h: number } | null {
  try {
    if (ext === "png") return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    if (ext === "gif") return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
    if (ext === "webp") {
      const kind = buf.subarray(12, 16).toString("ascii");
      if (kind === "VP8X") return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
      if (kind === "VP8L") {
        const b = buf.readUInt32LE(21);
        return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
      }
      if (kind === "VP8 ") return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    }
    if (ext === "jpg") {
      let i = 2;
      while (i < buf.length) {
        if (buf[i] !== 0xff) return null;
        const m = buf[i + 1];
        const len = buf.readUInt16BE(i + 2);
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
        i += 2 + len;
      }
    }
    if (ext === "avif") return { w: 1000, h: 1000 }; // not parsed; AVIF packshots are rare
  } catch {
    /* truncated header */
  }
  return null;
}

type Fetched = { buf: Buffer; ext: string; url: string; w: number; h: number };
const imageCache = new Map<string, Promise<Fetched | { error: string }>>();

function fetchImage(urls: string[]): Promise<Fetched | { error: string }> {
  const key = urls[0];
  let p = imageCache.get(key);
  if (!p) {
    p = (async () => {
      let lastErr = "no image URL";
      for (const url of urls) {
        const r = await getBinary(url, MAX_BYTES);
        if ("error" in r) {
          lastErr = r.error;
          continue;
        }
        const ext = sniff(r.buf);
        if (!ext) {
          lastErr = "not an image (content check)";
          continue;
        }
        const d = dimensions(r.buf, ext);
        if (!d || Math.min(d.w, d.h) < MIN_SIDE) {
          lastErr = `too small (${d ? `${d.w}×${d.h}` : "unknown size"})`;
          continue;
        }
        return { buf: r.buf, ext, url, w: d.w, h: d.h };
      }
      return { error: lastErr };
    })();
    imageCache.set(key, p);
  }
  return p;
}

// Uploaded files by source image URL: family members share one file, and reruns do not upload twice.
const MAP_FILE = path.join(WORK, "uploads-map.json");
const uploadMap: Record<string, string> = fs.existsSync(MAP_FILE) ? JSON.parse(fs.readFileSync(MAP_FILE, "utf8")) : {};

function storeUpload(f: Fetched, sourceUrl: string): string {
  const known = uploadMap[sourceUrl];
  if (known && fs.existsSync(path.join(UPLOAD_DIR, known.replace(/^\/uploads\//, "")))) return known;
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const name = `${randomBytes(12).toString("hex")}.${f.ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), f.buf);
  uploadMap[sourceUrl] = `/uploads/${name}`;
  return uploadMap[sourceUrl];
}

// ---------------------------------------------------------------------------
// Targets

function loadTargets(): Target[] {
  const db = catalogDb();
  const cols = "id, sku, ean, brand, name, flavour, flavour_en, size_label, group_id, stock";
  const base = `SELECT ${cols} FROM products WHERE hidden = 0 AND image IS NULL AND brand IS NOT NULL AND brand <> ''`;
  let rows: Target[];
  if (ALL_STOCK) rows = db.prepare(`${base} ORDER BY stock > 0 DESC, brand, name`).all() as Target[];
  else {
    // In-stock products, plus the out-of-stock variants of the same families (one packshot serves the family).
    rows = db
      .prepare(
        `${base} AND (stock > 0 OR group_id IN (SELECT group_id FROM products WHERE hidden = 0 AND image IS NULL AND stock > 0 AND group_id IS NOT NULL))
         ORDER BY stock > 0 DESC, brand, name`,
      )
      .all() as Target[];
  }
  if (BRANDS.length) rows = rows.filter((r) => BRANDS.some((b) => r.brand.toLowerCase() === b || r.brand.toLowerCase().includes(b)));
  return rows;
}

// ---------------------------------------------------------------------------

type Row = { t: Target; m: Match; image?: string; file?: string; w?: number; h?: number; source?: string };

async function main() {
  fs.mkdirSync(WORK, { recursive: true });
  const targets = loadTargets();
  const byBrand = new Map<string, Target[]>();
  for (const t of targets) byBrand.set(t.brand, [...(byBrand.get(t.brand) ?? []), t]);
  const brandOrder = [...byBrand.entries()].sort((a, b) => b[1].filter((t) => t.stock > 0).length - a[1].filter((t) => t.stock > 0).length);
  console.log(`${targets.length} products without a picture in ${byBrand.size} brands${DRY ? " (dry run)" : ""}; work dir ${WORK}`);

  const rows: Row[] = [];
  let processed = 0;
  const jobs: { brand: string; list: Target[] }[] = [];
  for (const [brand, list0] of brandOrder) {
    if (LIMIT && processed >= LIMIT) break;
    const list = LIMIT ? list0.slice(0, LIMIT - processed) : list0;
    processed += list.length;
    jobs.push({ brand, list });
  }
  // Brands run a few at a time (different hosts); each host keeps its own polite queue.
  const queue = [...jobs];
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) await runBrand(job.brand, job.list);
  }));

  async function runBrand(brand: string, list: Target[]) {
    const src = BRAND_SOURCES.find((s) => s.brands.includes(brand));
    if (!src) {
      for (const t of list) rows.push({ t, m: { status: "not-found", score: 0, how: "", note: "no official source configured" } });
      return;
    }
    console.log(`\n== ${brand}: ${list.length} products — ${src.site} (${src.method})`);
    const words = brandWordsOf(brand, src);
    let items: SourceItem[] = [];
    try {
      items = await src.load({ targets: list, brandWords: words });
    } catch (e) {
      console.warn(`   ${brand}: source failed: ${(e as Error).message}`);
    }
    if (src.productFilter) items = items.filter(src.productFilter);
    // Free gifts, bundles and gift cards are not the product itself.
    items = items.filter((it) => !/🎁|100% off|\bbundles?\b|gift ?card|free gift|\bmystery\b/i.test(`${it.product} ${it.variant ?? ""}`));
    // An image URL shared by several different products is a placeholder or logo, not a packshot.
    const users = new Map<string, Set<string>>();
    for (const it of items) for (const u of it.images) users.set(u, (users.get(u) ?? new Set()).add(it.productKey));
    for (const it of items) it.images = it.images.filter((u) => (users.get(u)?.size ?? 0) <= 2 && !/placeholder|no[-_]?image|noimage|default[-_]?product/i.test(u));
    console.log(`   ${brand}: ${items.length} official items (${new Set(items.map((i) => i.productKey)).size} products, ${items.filter((i) => i.gtins.length).length} with GTIN)`);
    const P = prepare(items, words);
    const brandRows: Row[] = list.map((t) => ({ t, m: items.length ? matchTarget(t, P, words, MIN_SCORE) : { status: "not-found", score: 0, how: "", note: "source returned no products" } }));

    if (src.eanOnly)
      for (const r of brandRows)
        if (r.m.status === "matched" && !r.m.how.startsWith("ean")) r.m = { ...r.m, status: "review", note: "name match only (this brand publishes EANs; ours is not among them)" };
    // Family propagation: a variant not matched on its own takes a sibling's product-level packshot (the brand has
    // one picture for all flavours of that product) when its own best candidate is that same product.
    const firstImages = new Map<string, Set<string>>();
    for (const it of items) if (it.images[0]) firstImages.set(it.productKey, (firstImages.get(it.productKey) ?? new Set()).add(it.images[0]));
    const singlePackshot = (key: string) => firstImages.get(key)?.size === 1;
    const byGroup = new Map<number, Row[]>();
    for (const r of brandRows) if (r.t.group_id) byGroup.set(r.t.group_id, [...(byGroup.get(r.t.group_id) ?? []), r]);
    for (const r of brandRows) {
      if (r.m.status === "matched" || !r.t.group_id || !r.m.item || src.eanOnly) continue;
      if (!singlePackshot(r.m.item.productKey)) continue;
      // Only when the variant itself was uncertain about its flavour — never across sizes, forms or names.
      if (r.m.note && !/flavour|picture per variant/.test(r.m.note)) continue;
      if (r.m.score < MIN_SCORE * 0.75) continue;
      const donor = byGroup.get(r.t.group_id)!.find((s) => s.m.status === "matched" && s.m.item?.productKey === r.m.item!.productKey);
      if (donor) r.m = { status: "matched", score: Math.min(donor.m.score, 0.9), how: "family packshot (sibling match)", item: donor.m.item, note: `via ${donor.t.sku}` };
    }

    // A shared picture must not show another flavour than ours on its label.
    for (const r of brandRows) {
      const it = r.m.item;
      if (r.m.status !== "matched" || !it || !(it.familyImage || /packshot/.test(r.m.how))) continue;
      const other = imageFlavourConflict(r.t, it.images[0] ?? "");
      if (other) r.m = { ...r.m, status: "review", note: `shared picture shows another flavour (${other})` };
    }

    // Download + verify.
    await Promise.all(
      brandRows.map(async (r) => {
        if (!r.m.item || r.m.status === "not-found") return;
        const it = r.m.item;
        r.image = it.images[0];
        r.source = it.page;
        const urls = it.images.slice(0, 3).flatMap((u) => (src.sized ? src.sized(u) : [u]));
        const f = await fetchImage(urls);
        if ("error" in f) {
          if (r.m.status === "matched") r.m = { ...r.m, status: "review", note: `image rejected: ${f.error}` };
          else r.m.note = `${r.m.note ?? ""}; image rejected: ${f.error}`;
          return;
        }
        r.image = f.url;
        r.w = f.w;
        r.h = f.h;
        if (r.m.status === "matched" && !DRY) r.file = storeUpload(f, f.url);
        else {
          const dir = path.join(WORK, r.m.status === "matched" ? "preview" : "review");
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, `${r.t.sku}.${f.ext}`), f.buf);
          if (r.m.status === "matched") r.file = `preview/${r.t.sku}.${f.ext}`;
        }
      }),
    );
    const c = (s: string) => brandRows.filter((r) => r.m.status === s).length;
    console.log(`   ${brand}: matched ${c("matched")}, review ${c("review")}, not found ${c("not-found")}`);
    rows.push(...brandRows);
  }

  // Apply.
  const applied = rows.filter((r) => r.m.status === "matched" && r.file?.startsWith("/uploads/"));
  if (!DRY && applied.length) {
    fs.writeFileSync(MAP_FILE, JSON.stringify(uploadMap, null, 1));
    let changed = 0;
    for (let i = 0; i < applied.length; i += 200) {
      changed += saveProductEdits(applied.slice(i, i + 200).map((r) => ({ sku: r.t.sku, data: { images: [r.file!] } }))).changed;
    }
    console.log(`\nApplied pictures to ${changed} products.`);
    // Provenance for the owner, merged by SKU.
    const provFile = path.join(DATA_DIR, "image-sources.csv");
    const prov = new Map(readCsv(provFile).map((r) => [r[0], r]));
    const now = new Date().toISOString().slice(0, 10);
    for (const r of applied) prov.set(r.t.sku, [r.t.sku, r.source ?? "", r.image ?? "", r.file ?? "", r.t.brand, now]);
    writeCsv(provFile, ["sku", "source_page", "image_url", "file", "brand", "applied_at"], [...prov.values()]);
  }

  // Reports (merged with earlier runs by SKU).
  const reportFile = path.join(WORK, "report.csv");
  const report = new Map(readCsv(reportFile).map((r) => [r[0], r]));
  for (const r of rows) {
    report.set(r.t.sku, [
      r.t.sku, r.t.ean ?? "", r.t.brand, r.t.name, r.t.flavour ?? "", r.t.size_label ?? "", r.t.stock > 0 ? "yes" : "no",
      DRY && r.m.status === "matched" ? "matched (dry-run)" : r.m.status, r.m.score.toFixed(2), r.m.how,
      r.m.item ? `${r.m.item.product}${r.m.item.variant ? ` / ${r.m.item.variant}` : ""}` : "", r.source ?? "", r.image ?? "",
      r.w ? `${r.w}x${r.h}` : "", r.file ?? "", r.m.note ?? "",
    ]);
  }
  const header = ["sku", "ean", "brand", "name", "flavour", "size", "in_stock", "status", "score", "how", "official_product", "source_page", "image_url", "image_size", "file", "note"];
  const all = [...report.values()];
  writeCsv(reportFile, header, all);
  writeCsv(path.join(WORK, "review.csv"), header, all.filter((r) => r[7] === "review"));

  const n = (s: string) => rows.filter((r) => r.m.status === s).length;
  console.log(`\nThis run: matched ${n("matched")}, review ${n("review")}, not found ${n("not-found")}. Report: ${reportFile}`);
  console.log(`HTTP: ${JSON.stringify(fetchStats())}`);
  if (!DRY && applied.length && !flag("no-revalidate")) {
    const ok = await requestSiteRevalidate({ quiet: true });
    console.log(ok ? "Asked the running site to refresh its pages." : "Site not reachable: pages refresh on their own interval.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
