import "server-only";
import type { ManufacturerInfo } from "./catalog-types";
import { catalogDb, storeDb } from "./db";

// Food business operator per brand (Reg. (EU) 1169/2011 Art. 8 and 9(1)(h): name and address of the operator under
// whose name the food is marketed, or of the importer into the EU). Entered once in Admin → Производители and shown
// on every product page of the brand ("Информация за производителя"). Stored in store.db `manufacturers`
// (brand_slug PK, data JSON = ManufacturerInfo), so it survives catalogue re-imports.

export type { ManufacturerInfo } from "./catalog-types";

export const EMPTY_MANUFACTURER: ManufacturerInfo = { name: "", address: "", country: "", email: "", website: "", importer: "" };

/** Field limits (characters). */
export const MANUFACTURER_LIMITS: Record<keyof ManufacturerInfo, number> = {
  name: 160,
  address: 300,
  country: 80,
  email: 120,
  website: 200,
  importer: 400,
};

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Saved or submitted data, cleaned up: one-line texts, clipped, website with https://. Never throws. */
export function normalizeManufacturer(raw: unknown): ManufacturerInfo {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const L = MANUFACTURER_LIMITS;
  const website = clean(r.website, L.website);
  return {
    name: clean(r.name, L.name),
    address: clean(r.address, L.address),
    country: clean(r.country, L.country),
    email: clean(r.email, L.email),
    website: website && !/^https?:\/\//i.test(website) ? `https://${website}`.slice(0, L.website) : website,
    importer: clean(r.importer, L.importer),
  };
}

/** Complete enough for the label: the operator's name and postal address (Reg. 1169/2011 Art. 9(1)(h)). */
export function isManufacturerComplete(m: ManufacturerInfo | null | undefined): boolean {
  return !!m && !!m.name && !!m.address;
}

/** Anything worth showing on a product page besides the brand name. */
function hasDetails(m: ManufacturerInfo): boolean {
  return !!(m.address || m.country || m.email || m.website || m.importer);
}

function readRow(brandSlug: string): ManufacturerInfo | null {
  const row = storeDb().prepare("SELECT data FROM manufacturers WHERE brand_slug = ?").get(brandSlug) as { data: string } | undefined;
  if (!row) return null;
  try {
    return normalizeManufacturer(JSON.parse(row.data));
  } catch {
    return null;
  }
}

/**
 * Food business operator of a brand for the product page, or null when nothing was entered for it.
 * An empty name falls back to `brandName` (or the brand's name in the catalogue).
 */
export function getManufacturer(brandSlug: string | null | undefined, brandName?: string | null): ManufacturerInfo | null {
  if (!brandSlug) return null;
  const m = readRow(brandSlug);
  if (!m || !hasDetails(m)) return null;
  if (!m.name) {
    const fallback =
      brandName ?? (catalogDb().prepare("SELECT name FROM brands WHERE slug = ?").get(brandSlug) as { name: string } | undefined)?.name ?? "";
    return { ...m, name: fallback };
  }
  return m;
}

/** Save (or, when every field is empty, delete) the operator data of a brand. */
export function saveManufacturer(brandSlug: string, data: unknown): ManufacturerInfo {
  const m = normalizeManufacturer(data);
  const db = storeDb();
  if (!Object.values(m).some(Boolean)) {
    db.prepare("DELETE FROM manufacturers WHERE brand_slug = ?").run(brandSlug);
    return m;
  }
  db.prepare(
    "INSERT INTO manufacturers (brand_slug, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(brand_slug) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
  ).run(brandSlug, JSON.stringify(m), new Date().toISOString());
  return m;
}

export type BrandManufacturerRow = {
  slug: string;
  name: string;
  /** Listing cards of the brand (one per family). */
  count: number;
  data: ManufacturerInfo | null;
  updatedAt: string | null;
};

/** Every brand of the catalogue (most products first) with its operator data — Admin → Производители. */
export function listBrandManufacturers(): BrandManufacturerRow[] {
  const brands = catalogDb().prepare("SELECT slug, name, count FROM brands ORDER BY count DESC, name COLLATE NOCASE").all() as {
    slug: string;
    name: string;
    count: number;
  }[];
  const saved = new Map<string, { data: ManufacturerInfo | null; updatedAt: string }>();
  for (const r of storeDb().prepare("SELECT brand_slug, data, updated_at FROM manufacturers").all() as { brand_slug: string; data: string; updated_at: string }[]) {
    let data: ManufacturerInfo | null = null;
    try {
      data = normalizeManufacturer(JSON.parse(r.data));
    } catch {
      data = null;
    }
    saved.set(r.brand_slug, { data, updatedAt: r.updated_at });
  }
  return brands.map((b) => ({ ...b, data: saved.get(b.slug)?.data ?? null, updatedAt: saved.get(b.slug)?.updatedAt ?? null }));
}
