// Which export rows are sold in the supplements store, and in which category / subcategory.
// Ported 1:1 from the research prototype classify_proto.py (rule data in classify-rules.ts):
//   exclusions  → ordered block lists (first hit = reason): adult, electronics, medicines, homeopathy, medical devices, pets …
//   stage A     → product-type rules, ordered, first hit wins (accessories, hormonal, healthy food, protein, creatine …)
//   stage B     → ingredient / claim rules: the EARLIEST match position in the name wins (ties → list order)
//   fallback    → "Други добавки" only for rows coming from a supplement source category
import * as R from "./classify-rules";
import { SUB_PARENT } from "../../src/lib/taxonomy";
import { earliestHit, firstHit, normText, ure } from "../../src/lib/text-match";
import { encodeImageUrl } from "../../src/lib/catalog-sync";

// ---------------------------------------------------------------------------
// Source categories of the export

export type SourceTier = "supp" | "food" | "sport" | "loose";

const SUPP_LIKE = /suppl|supl|добавк/iu;
const NOT_SUPP_LIKE = /school|office|art|print|party|pet|stationery|clean/iu;

export function sourceTier(cat: string): SourceTier | null {
  const c = cat.trim();
  if (R.SUPP_SOURCES.has(c) || c.startsWith("Аптека и хранителни добавки")) return "supp";
  if (SUPP_LIKE.test(c) && !NOT_SUPP_LIKE.test(c)) return "supp";
  if (R.FOOD_SOURCES.has(c)) return "food";
  if (R.SPORT_SOURCES.has(c)) return "sport";
  if (R.LOOSE_SOURCES.has(c)) return "loose"; // uncategorised rows: accepted only with a STRONG supplement signal
  return null;
}

// ---------------------------------------------------------------------------
// Data-derived block lists, built from the whole export (like /web's adult-brand pass)

export type Ctx = { adultBrands: Set<string>; drugTokens: Set<string> };

/** The classifier's brand key (keeps Cyrillic; different from brands.ts brandKey on purpose). */
export function ruleBrandKey(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9Ѐ-ӿ]+/g, "");
}

const RX_FIRST_WORD = /^([а-яё][а-яё-]{3,})/u;
const NO_BRAND_KEYS = new Set(["", "na", "none", "nobrand", "other", "generic"]);

/** Collects the counts makeCtx needs while the importer streams the whole export. */
export class CtxCollector {
  private tot = new Map<string, number>();
  private sex = new Map<string, number>();
  private rx = new Set<string>();

  add(row: { Category?: string; Brand?: string; Name?: string }) {
    const c = (row.Category ?? "").trim();
    const k = ruleBrandKey(row.Brand);
    this.tot.set(k, (this.tot.get(k) ?? 0) + 1);
    if (/sexual wellness|секс|еротик/iu.test(c)) this.sex.set(k, (this.sex.get(k) ?? 0) + 1);
    if (c === "Prescription Drug" || c === "Pack - Prescription Drug") {
      const m = RX_FIRST_WORD.exec(normText(row.Name).toLowerCase());
      if (m) this.rx.add(m[1]);
    }
  }

  /** Brands with >= 5 % of their rows in "Sexual Wellness", and first words of prescription-drug names. */
  build(): Ctx {
    const adultBrands = new Set<string>();
    for (const [k, v] of this.sex) {
      if (NO_BRAND_KEYS.has(k)) continue;
      if (v >= 1 && v / Math.max(1, this.tot.get(k) ?? 0) >= 0.05 && !R.ADULT_BRAND_ALLOW.has(k)) adultBrands.add(k);
    }
    const drugTokens = new Set([...this.rx].filter((w) => !R.DRUG_TOKEN_STOP.has(w)));
    return { adultBrands, drugTokens };
  }
}

// ---------------------------------------------------------------------------
// Exclusions: rows that must never be sold in the supplements store

const MEDICINE_VAT = new Set(["A_PRESCRIPTION_DRUG", "A_OTC_DRUG"]);
const MEDICAL_VAT = new Set([
  "A_MEDICAL_SUPPLIES", "A_MEDICAL_DEVICES", "A_HPC_THERMOMETER", "A_DIAPERS", "A_HPC_CONTRACEPTIVE", "A_HPC_SANITARYPRODUCTS",
  "A_HPC_INCONTINENCE", "A_HPC_WHEELCHAIR", "A_HPC_PPEMASKS",
]);
const SUPPLEMENT_VAT = new Set(["A_HPC_DIETARYSUPPL", "A_HLTH_VITAMINS", "A_HLTH_PILLCAPSULETABLET", "A_FOOD_SUPPLEMENTS"]);
const RX_NAME = /^(?:pack \d+x\s*|\d+x\s*)?([а-яё][а-яё-]{3,})/u;
const SPORT_SUPPORTS = /наколенки за (?:клякане|вдигане)|knee sleeves|боксови бинтове/u;
const CATS_CLAW = /cat'?s claw|котешки нокът/u;

export type ExclusionReason =
  | "adult/alcohol/tobacco" | "electronics" | "non-food" | "household" | "medicine(vat)" | "medicine(rx-name)" | "medicine" | "homeopathy"
  | "flower-essence" | "essential-oil" | "medical(vat)" | "medical-device" | "pets" | "laxative" | "topical" | "stationery";

/** A reason when the row must never be sold here (name and brand already cleaned with normText). */
export function exclusionReason(name: string, brand: string, imageRaw: string, vat: string, ctx: Ctx): ExclusionReason | null {
  const t = `${name} ${brand}`.toLowerCase();
  const n = name.toLowerCase();
  if (ctx.adultBrands.has(ruleBrandKey(brand)) || R.ADULT_IMAGE_HOSTS.test(imageRaw) || R.ADULT.test(t)) return "adult/alcohol/tobacco";
  if (R.ELECTRONICS.test(n)) return "electronics";
  if (R.STATIONERY.test(t)) return "stationery"; // review round 1
  if (R.MISC_NONFOOD.test(n)) return "non-food"; // audit addition
  if (R.HOUSEHOLD.test(t)) return "household"; // audit addition
  if (MEDICINE_VAT.has(vat)) return "medicine(vat)";
  const m = RX_NAME.exec(n);
  if (m && ctx.drugTokens.has(m[1])) return "medicine(rx-name)";
  if (R.DRUG_NAMES.test(n) || R.DRUG_FORMS.test(n) || R.DRUG_DOSE.test(n) || R.PHARMA_COMPANIES.test(n) || R.INN.test(n)) return "medicine";
  if (R.HOMEOPATHY.test(t)) return "homeopathy";
  if (R.FLOWER_ESSENCES.test(t)) return "flower-essence";
  if (R.ESSENTIAL_OIL.test(n) && !R.ORAL_FORM.test(n)) return "essential-oil";
  if (MEDICAL_VAT.has(vat)) return "medical(vat)";
  if (R.MEDICAL.test(t) && !SPORT_SUPPORTS.test(n)) return "medical-device";
  if (R.PETS.test(n) && !CATS_CLAW.test(n)) return "pets";
  // review round 1: laxatives (fibre supplements stay) and products for the skin
  if (R.LAXATIVE.test(n) && !(R.FIBRE.test(n) && !R.LAXATIVE_STRONG.test(n))) return "laxative";
  if (R.TOPICAL.test(n)) return "topical";
  return null;
}

// ---------------------------------------------------------------------------
// Classification

export type Classified = { category: string; sub: string };
export type Unclassified = { category: null; reason: string };

const cls = (sub: string): Classified => ({ category: SUB_PARENT[sub], sub });
const MUSCLE_MASS = /мускулна маса/u;
const NOT_JOINT_COLLAGEN = /хиалурон|hyaluron|beauty|красота|кожа|skin/u;

/** → { category, sub } or { category: null, reason }. `name` / `brand` are raw export values. */
export function classify(rawName: string, rawBrand: string, sourceCat: string, vat = ""): Classified | Unclassified {
  const name = normText(rawName);
  const brand = normText(rawBrand);
  const tier = sourceTier(sourceCat);
  if (tier === null) return { category: null, reason: "not-a-candidate-source" };
  const t = `${name} ${brand}`.toLowerCase();
  const n = name.toLowerCase();

  // --- accessories (before clothing / cosmetics: gloves, belts, shakers) ---
  const acc = firstHit(n, R.ACCESSORY_RULES);
  if (acc && !R.ACCESSORY_GUARD.test(n)) {
    // Audit: shakers and bottles are unambiguous; belts, gloves and gear need a fitness context (see ACCESSORY_SPECIFIC).
    if (acc === "sheykari-i-butilki" || R.ACCESSORY_SPECIFIC.test(n) || R.FITNESS_CONTEXT.test(n) || R.SPORT_BRANDS.test(t)) return cls(acc);
    return { category: null, reason: "non-fitness-accessory" };
  }
  if (tier === "sport") return { category: null, reason: "sport-non-accessory" }; // the rest of Sports & Fitness is toys/bikes/cases

  if (R.CLOTHING.test(n)) return { category: null, reason: "clothing" };
  if (R.COSMETICS_STRONG.test(n)) return { category: null, reason: "cosmetics" }; // audit: vitamin creams, shampoos, body oils …
  if ((R.COSMETICS.test(n) || R.COSMETIC_VOLUME.test(n)) && !R.COSMETIC_SAFE.test(n)) return { category: null, reason: "cosmetics" };
  const healthy = R.HEALTHY_OVERRIDE.test(t);
  if (R.JUNK_FOOD.test(n) && !healthy) return { category: null, reason: "grocery" };
  if (R.PLANT_DRINK.test(n)) return { category: null, reason: "grocery" }; // review round 1

  if (tier === "loose" && !R.LOOSE_STRONG.test(n)) return { category: null, reason: "loose-weak-signal" };

  // --- STAGE A: product types ---
  if (R.ZMA.test(n)) return cls("magnezii");
  const h = firstHit(n, R.HORMONAL_STRONG);
  if (h) return cls(h);
  if (R.MEAL_REPLACEMENT.test(n)) return cls("zamestiteli-na-hrana");
  if (R.GAINER.test(n) && !MUSCLE_MASS.test(n)) return cls("geyneri");
  const hf = firstHit(n, R.HEALTHY_FOOD_RULES);
  if (hf) return cls(hf);
  if (R.COLLAGEN.test(n)) {
    if (R.JOINT_MARK.test(n) && !NOT_JOINT_COLLAGEN.test(n)) return cls("kolagen");
    if (R.BEAUTY_MARK.test(n)) return cls("kolagen-i-hialuron");
    return cls("kolagen");
  }
  if (R.CREATINE.test(n)) {
    const other = R.CREATINE_OTHER.test(n) && !R.CREATINE_MONO.test(n);
    return cls(other ? "kreatinovi-kompleksi" : "kreatin-monohidrat");
  }
  if (R.PRE_WORKOUT.test(n)) return cls("predtrenirovachni");
  const p = firstHit(n, R.PROTEIN_RULES);
  if (p && (!R.PROTEIN_GUARD.test(n) || R.PROTEIN_POWDER.test(n))) return cls(p);
  if (R.CARNITINE.test(n)) return cls("l-karnitin");
  const a = firstHit(n, R.AMINO_RULES);
  if (a) return cls(a);
  const w = firstHit(n, R.WEIGHT_RULES);
  if (w) return cls(w);
  const e = firstHit(n, R.ENERGY_RULES);
  if (e) return cls(e);
  const o = firstHit(n, R.OMEGA_RULES);
  if (o) {
    if (R.KIDS.test(n) && o === "omega-3") return cls("za-detsa");
    return cls(o);
  }

  // --- STAGE B: earliest ingredient / claim ---
  const b = earliestHit(n, R.STAGE_B);
  if (b) {
    const parent = SUB_PARENT[b];
    if (parent === "vitamini-i-minerali" && R.KIDS.test(n)) return cls("za-detsa");
    if (b === "kolagen-i-hialuron" && R.JOINT_MARK.test(n)) return cls("kompleksi-za-stavi");
    return cls(b);
  }
  if (R.JOINT_COMPLEX.test(n)) return cls("kompleksi-za-stavi");
  const hw = earliestHit(n, R.HORMONAL_WEAK);
  if (hw) return cls(hw);
  if (R.KIDS.test(n) && R.SUPP_FORM.test(n)) return cls("za-detsa");

  // --- fallback ---
  if (tier === "supp" && (R.SUPP_FORM.test(n) || SUPPLEMENT_VAT.has(vat))) {
    // Audit: a pharmacy-feed medicine ("ЛАПОЗАН табл 10мг х 30бр") that no ingredient rule recognised — precision first.
    if (R.PHARMACY_FORMAT.test(name)) return { category: null, reason: "medicine(pharmacy-format)" };
    return cls("drugi-dobavki");
  }
  return { category: null, reason: "unclassified" };
}

// ---------------------------------------------------------------------------
// Pack size (for the placeholder price model) and placeholder prices

export type PackSize = { grams: number | null; ml: number | null; count: number | null; servings: number | null; multi: number };

const END = "(?![^\\W_])";
const SZ_MULTI = ure(`(\\d{1,3})\\s?[xх×]\\s?(\\d+(?:\\.\\d+)?)\\s?(g|г|гр|грама|ml|мл)${END}`, "u");
const SZ_KG = ure(`(\\d+(?:\\.\\d+)?)\\s?(kg|кг)${END}`, "u");
const SZ_LB = ure(`(\\d+(?:\\.\\d+)?)\\s?(lb|lbs)${END}`, "u");
const SZ_G = ure(`(\\d{2,5}(?:\\.\\d+)?)\\s?(g|г|гр|грама|gr)${END}`, "u");
const SZ_KG_AS_G = /\/\s?(\d+\.\d+)\s?g\.?$/u; // "/ 0.52g." = kilograms written as grams (EVERBUILD/AMIX/SCITEC export)
const SZ_ML = ure(`(\\d+(?:\\.\\d+)?)\\s?(ml|мл|l|л)${END}`, "u");
const SZ_COUNT = ure(
  "(\\d{1,4})\\s?(?:\\+\\s?\\d+\\s?)?(?:бр\\.?\\s?)?(?:вег[еа]н?\\s|веге\\s|растителни\\s|меки\\s|твърди\\s|гел\\s|желирани\\s|дъвчащи\\s|ефервесцентни\\s|разтворими\\s)?" +
    "(капсули|капс\\.?|caps\\.?|capsules|vcaps|v-caps|vegcaps|softgels?|sgels|софтгел капсули|софтгел|таблетки|табл\\.?|tabs\\.?|tablets|" +
    `дражета|каплети|caplets|gummies|желирани таблетки|сашета|sachets|ампули|стика|броя|бр\\.?|chewables|lozenges|пастили|перли)${END}`,
  "u",
);
const SZ_X_COUNT = /[xх]\s?(\d{2,4})\s?(?:капсули|таблетки|бр|caps|tabs)?/u;
const SZ_SERVINGS = ure(`(\\d{1,4})\\s?(дози|servings|serv\\.?|порции)${END}`, "u");

/** Grams, ml, capsule count and servings parsed from the name (null when absent). */
export function parseSize(name: string): PackSize {
  const n = name.toLowerCase().replace(/,/g, ".");
  const out: PackSize = { grams: null, ml: null, count: null, servings: null, multi: 1 };
  let m = SZ_MULTI.exec(n);
  if (m) {
    out.multi = parseInt(m[1], 10);
    const q = Number(m[2]);
    if (m[3] === "ml" || m[3] === "мл") out.ml = q * out.multi;
    else out.grams = q * out.multi;
  }
  if (out.grams === null && (m = SZ_KG.exec(n))) out.grams = Number(m[1]) * 1000;
  if (out.grams === null && (m = SZ_LB.exec(n))) out.grams = Number(m[1]) * 453.6;
  if (out.grams === null && (m = SZ_G.exec(n))) out.grams = Number(m[1]);
  if (out.grams === null && (m = SZ_KG_AS_G.exec(n)) && Number(m[1]) < 10) out.grams = Number(m[1]) * 1000;
  if (out.ml === null && (m = SZ_ML.exec(n))) {
    const q = Number(m[1]);
    out.ml = (m[2] === "l" || m[2] === "л") && q < 10 ? q * 1000 : q;
  }
  if ((m = SZ_COUNT.exec(n))) out.count = parseInt(m[1], 10);
  m = SZ_X_COUNT.exec(n);
  if (out.count === null && m && !out.grams) out.count = parseInt(m[1], 10);
  if ((m = SZ_SERVINGS.exec(n))) out.servings = parseInt(m[1], 10);
  return out;
}

/** Deterministic 0..1 hash (FNV-1a) so placeholder prices are stable between imports. */
export function hash01(s: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/** 4.49 / 4.99 below 10 €, x.99 above. */
export function roundPrice(p: number): number {
  const r = p < 10 ? Math.floor(p) + (p % 1 < 0.5 ? 0.49 : 0.99) : Math.floor(p) + 0.99;
  return Math.round(r * 100) / 100;
}

/**
 * Placeholder price (EUR) from the subcategory's price profile and the pack size: powders scale with kg^0.85,
 * liquids with litres, capsules with count^0.9, ±12 % spread per SKU. About 18 % of in-stock products get a demo sale
 * (`old` = the regular price before the sale).
 */
export function demoPrice(sku: string, sub: string, name: string, stock: number): { price: number; old: number | null } {
  const prof = R.PRICE_PROFILES[sub] ?? R.PRICE_PROFILES._capsules;
  const s = parseSize(name);
  const h = hash01(sku);
  let p: number | null = null;
  const kg = (s.grams ?? 0) / 1000;
  if (prof.perKg && kg >= 0.02) p = prof.perKg * kg ** 0.85 + 1.5;
  else if (prof.perL && s.ml) p = prof.perL * (s.ml / 1000) ** 0.85 + 1.5;
  else if (s.count && (prof.perUnit || !(sub in R.PRICE_PROFILES))) {
    const pu = prof.perUnit ?? R.PRICE_PROFILES._capsules.perUnit!;
    p = 4 + pu * Math.min(s.count, 1000) ** 0.9;
  } else if (s.servings) p = 0.9 * s.servings ** 0.85 + 3;
  if (p === null) p = prof.default * (0.8 + h * 0.5);
  p *= 0.88 + h * 0.24; // ±12 % brand/SKU spread
  p = Math.min(prof.max, Math.max(prof.min, p));
  const price = roundPrice(p);
  const onSale = stock > 0 && hash01(sku, 7) < 0.18;
  return { price, old: onSale ? roundPrice(price * (1.12 + hash01(sku, 13) * 0.28)) : null };
}

// ---------------------------------------------------------------------------
// Dedupe keys and images

/** GTIN without leading zeros (UPC-A "087614025278" == EAN-13 "0087614025278"), or null. */
export function gtinKey(ean: string | null | undefined): string | null {
  const d = (ean ?? "").split(".0").join("").replace(/\D/g, "");
  if (d.length < 8 || d.length > 14 || /^0+$/.test(d)) return null;
  return d.replace(/^0+/, "");
}

export function nameKey(name: string): string {
  let n = normText(name).toLowerCase();
  n = n.replace(/^(?:pack\s*)?\d+\s?x\s/u, "");
  n = n.replace(/[[\]()|/~—–\-,.:;!®™*"']+/gu, " ");
  return n.replace(/\s+/g, " ").trim();
}

/**
 * Image URLs of a row ("", "0", "#N/A" → none); http → https; electronics-shop pictures dropped.
 * Several pictures are separated by "; ", " | " or "$$$" (or a new URL after a comma / space). A URL itself may
 * contain spaces ("…/data/-GYM BEAM/GB5049.png" → encoded as %20) and commas (Amazon "…_PIbundle-12,TopRight,0,0_…jpg",
 * CDN "f_auto,q_auto"), so the value is split at separators only — never at every space or comma.
 */
export function parseImages(raw: string | null | undefined): string[] {
  const urls = (raw ?? "")
    .split(/\s*(?:;|\s\|\s|\$\$\$|[\r\n]+|,(?=\s*https?:\/\/)|\s(?=https?:\/\/))\s*/i)
    .map((s) => s.trim().replace(/^["'[]+|["'\]]+$/g, ""))
    .filter((s) => /^https?:\/\/[^/\s]+\.[^/\s]+\//i.test(s))
    // A value cut off by the export ("…/LIQUID-AMINO-1000-ml-3D (2") is no picture.
    .filter((s) => (s.split("/").pop()!.match(/\(/g) ?? []).length <= (s.split("/").pop()!.match(/\)/g) ?? []).length)
    // Spaces and non-ASCII characters ("©", "ö", Cyrillic file names) percent-encoded: the URL goes into HTML and the
    // preload Link header, which must be ASCII.
    .map((s) => encodeImageUrl(s.replace(/\s/g, "%20")));
  const out: string[] = [];
  for (let u of urls) {
    u = u.replace(/^http:\/\//, "https://");
    if (/encrypted-tbn\d\.gstatic\.com/.test(u) && urls.length > 1) continue;
    if (R.ELECTRONICS_IMAGE_HOSTS.test(u)) continue; // wrong picture (electronics shop) on a supplement row
    if (!out.includes(u)) out.push(u);
  }
  return out;
}

/** Available stock: Inventory − Reserved, never negative. */
export function stockOf(inventory: string | undefined, reserved: string | undefined): number {
  const f = (v: string | undefined) => {
    const x = Number((v || "0").replace(",", "."));
    return Number.isFinite(x) ? Math.trunc(x) : 0;
  };
  return Math.max(0, f(inventory) - f(reserved));
}
