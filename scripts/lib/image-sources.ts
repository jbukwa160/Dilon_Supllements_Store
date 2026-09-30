// Official manufacturer catalogues for scripts/fetch-images.ts. Every source lists one brand's own products (from the
// brand's own domain only — never other retailers) as SourceItems: product name, variant text, GTINs when the site
// exposes them, image URLs (best first) and the product page (kept as provenance).
import { getJson, getText } from "./polite-fetch";
import { decodeEntities } from "../../src/lib/text-match";

export type SourceItem = {
  /** Product (family) title on the brand site. */
  product: string;
  /** Stable id of the product on the source (handle / page URL): variants of one product share it. */
  productKey: string;
  /** Variant text (flavour / size) when the item is one variant. */
  variant?: string;
  gtins: string[];
  images: string[];
  page: string;
  /** The image is the product's main packshot, shared by all its variants (the brand has no per-variant pictures). */
  familyImage?: boolean;
  /** One picture for a page that sells several pack sizes: which size it shows is unknown. */
  mixedSizes?: boolean;
  /** Extra text that may help name matching (subtitle, category). */
  extra?: string;
};

export type Source = {
  /** Brand names as in catalog.db products.brand. */
  brands: string[];
  /** Official site (for the report). */
  site: string;
  /** How the site's products are listed (for the report). */
  method: string;
  load: () => Promise<SourceItem[]>;
  /** Optional URL rewrite applied before downloading (e.g. ask the CDN for a bounded size). */
  sized?: (url: string) => string[];
  /** Items whose product title must match this (e.g. multi-brand shops: only the brand's own products). */
  productFilter?: (it: SourceItem) => boolean;
};

// ---------------------------------------------------------------------------
// Helpers

export function gtinNorm(v: unknown): string | null {
  const d = String(v ?? "").replace(/\D/g, "");
  if (d.length < 8 || d.length > 14) return null;
  const s = d.replace(/^0+/, "");
  return s.length >= 7 ? s : null;
}

export function absUrl(u: string, base: string): string {
  try {
    return new URL(decodeEntities(u.trim()).replace(/^\/\//, "https://"), base).href;
  } catch {
    return u;
  }
}

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  return v == null ? [] : Array.isArray(v) ? v : [v];
}

function imageUrls(v: unknown, base: string): string[] {
  const out: string[] = [];
  for (const x of asArray(v as unknown)) {
    if (typeof x === "string") out.push(absUrl(x, base));
    else if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      const u = o.contentUrl ?? o.url ?? o["@id"];
      if (typeof u === "string") out.push(absUrl(u, base));
    }
  }
  return out.filter((u) => /^https?:/.test(u));
}

// ---------------------------------------------------------------------------
// Sitemaps

/** All <loc> URLs of a sitemap (following sitemap indexes), filtered by `keep` for leaf URLs. */
export async function sitemapUrls(url: string, keep: (u: string) => boolean, subKeep: (u: string) => boolean = () => true, depth = 0): Promise<string[]> {
  const xml = await getText(url, { ttlDays: 7 });
  if (!xml) return [];
  const locs = [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)\s*(?:\]\]>)?\s*<\/loc>/g)].map((m) => decodeEntities(m[1]));
  if (/<sitemapindex/i.test(xml) && depth < 3) {
    const out: string[] = [];
    for (const s of locs.filter(subKeep)) out.push(...(await sitemapUrls(s, keep, subKeep, depth + 1)));
    return uniq(out);
  }
  return uniq(locs.filter(keep));
}

// ---------------------------------------------------------------------------
// JSON-LD / meta on product pages

type Json = Record<string, unknown>;

function ldBlocks(html: string): Json[] {
  const out: Json[] = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const v: unknown = JSON.parse(m[1].trim().replace(/[\u0000-\u001f]+/g, " "));
      const walk = (x: unknown) => {
        if (Array.isArray(x)) x.forEach(walk);
        else if (x && typeof x === "object") {
          const o = x as Json;
          out.push(o);
          if (o["@graph"]) walk(o["@graph"]);
        }
      };
      walk(v);
    } catch {
      /* broken JSON-LD */
    }
  }
  return out;
}

function isType(o: Json, t: string): boolean {
  return asArray(o["@type"] as string | string[]).some((x) => String(x).toLowerCase() === t.toLowerCase());
}

function gtinsOf(o: Json): string[] {
  const vals = ["gtin13", "gtin", "gtin12", "gtin14", "gtin8", "ean", "isbn"].map((k) => o[k]);
  for (const off of asArray(o.offers as Json | Json[])) if (off && typeof off === "object") vals.push(off.gtin13, off.gtin, off.gtin12, off.gtin14, off.gtin8);
  return uniq(vals.flatMap((v) => asArray(v as unknown)).map(gtinNorm).filter((x): x is string => !!x));
}

export function metaContent(html: string, prop: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${prop}["'][^>]*>`, "i");
  const tag = re.exec(html)?.[0];
  if (!tag) return null;
  const c = /content=["']([^"']*)["']/i.exec(tag)?.[1];
  return c ? decodeEntities(c) : null;
}

/** Products described on a page: JSON-LD Product / ProductGroup (+ variants), falling back to og: meta. */
export function productsFromPage(html: string, page: string, opts: { ogFallback?: boolean } = {}): SourceItem[] {
  const items: SourceItem[] = [];
  const blocks = ldBlocks(html);
  for (const o of blocks) {
    if (isType(o, "ProductGroup")) {
      const name = decodeEntities(String(o.name ?? ""));
      const base = imageUrls(o.image, page);
      for (const v of asArray(o.hasVariant as Json | Json[])) {
        if (!v || typeof v !== "object") continue;
        const vname = decodeEntities(String(v.name ?? ""));
        const imgs = imageUrls(v.image, page);
        items.push({
          product: name || vname,
          productKey: page,
          variant: vname && vname !== name ? vname : undefined,
          gtins: gtinsOf(v),
          images: imgs.length ? imgs : base,
          page: typeof v.url === "string" ? absUrl(v.url, page) : page,
          familyImage: !imgs.length,
        });
      }
      if (!asArray(o.hasVariant as Json[]).length && base.length) items.push({ product: name, productKey: page, gtins: gtinsOf(o), images: base, page });
    } else if (isType(o, "Product") && !o.isVariantOf) {
      const name = decodeEntities(String(o.name ?? ""));
      const imgs = imageUrls(o.image, page);
      if (!name) continue;
      items.push({ product: name, productKey: page, gtins: gtinsOf(o), images: imgs, page });
    }
  }
  if (!items.length && opts.ogFallback) {
    const img = metaContent(html, "og:image");
    const title = metaContent(html, "og:title");
    if (img && title) items.push({ product: title, productKey: page, gtins: [], images: [absUrl(img, page)], page });
  }
  // og:image as an extra (often larger) candidate.
  const og = metaContent(html, "og:image");
  if (og) for (const it of items) if (!it.images.length) it.images.push(absUrl(og, page));
  return items;
}

/** Crawl product pages listed in a sitemap (cached; polite queue) and read their JSON-LD. */
export async function crawlPages(urls: string[], parse: (html: string, url: string) => SourceItem[] = (h, u) => productsFromPage(h, u, { ogFallback: true })): Promise<SourceItem[]> {
  const out: SourceItem[] = [];
  let done = 0;
  await Promise.all(
    urls.map(async (u) => {
      const html = await getText(u, { ttlDays: 30, accept: "text/html" });
      done++;
      if (done % 100 === 0) console.log(`    … ${done}/${urls.length} pages`);
      if (html) out.push(...parse(html, u));
    }),
  );
  return out;
}

// ---------------------------------------------------------------------------
// Shopify (public /products.json; variant barcodes from /products/<handle>.json when asked)

type ShopifyImage = { id: number; src: string; variant_ids?: number[]; position?: number };
type ShopifyVariant = { id: number; title: string; sku?: string; barcode?: string | null; featured_image?: { src: string } | null; image_id?: number | null; option1?: string | null };
type ShopifyProduct = { id: number; title: string; handle: string; vendor?: string; product_type?: string; images: ShopifyImage[]; variants: ShopifyVariant[] };

export async function shopifyProducts(origin: string, opts: { barcodes?: boolean; pathPrefix?: string; relevant?: (title: string) => boolean } = {}): Promise<SourceItem[]> {
  const all: ShopifyProduct[] = [];
  for (let page = 1; page < 60; page++) {
    const j = await getJson<{ products: ShopifyProduct[] }>(`${origin}${opts.pathPrefix ?? ""}/products.json?limit=250&page=${page}`, { ttlDays: 7 });
    if (!j?.products?.length) break;
    all.push(...j.products);
    if (j.products.length < 250) break;
  }
  const items: SourceItem[] = [];
  for (const p of all) {
    let variants = p.variants;
    if (opts.barcodes && (!opts.relevant || opts.relevant(`${p.title} ${p.handle}`))) {
      const full = await getJson<{ product: ShopifyProduct }>(`${origin}${opts.pathPrefix ?? ""}/products/${encodeURIComponent(p.handle)}.json`, { ttlDays: 14 });
      if (full?.product?.variants?.length) variants = full.product.variants;
    }
    const page = `${origin}${opts.pathPrefix ?? ""}/products/${p.handle}`;
    const main = [...p.images].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((i) => i.src);
    for (const v of variants) {
      const own = v.featured_image?.src ?? p.images.find((i) => (v.image_id && i.id === v.image_id) || i.variant_ids?.includes(v.id))?.src;
      const multi = variants.length > 1;
      items.push({
        product: p.title,
        productKey: page,
        variant: v.title && v.title !== "Default Title" ? v.title : undefined,
        gtins: uniq([gtinNorm(v.barcode), gtinNorm(v.sku)].filter((x): x is string => !!x)),
        images: uniq([...(own ? [own] : []), ...main]).map((u) => absUrl(u, origin)),
        page: multi ? `${page}?variant=${v.id}` : page,
        familyImage: !own,
        extra: p.product_type,
      });
    }
  }
  return items;
}

/** Shopify CDN: a bounded rendition first (originals can be 10+ MB PNGs), then the original. */
export function shopifySized(url: string): string[] {
  const u = url.replace(/([?&])width=\d+&?/, "$1").replace(/[?&]$/, "");
  return [`${u}${u.includes("?") ? "&" : "?"}width=1500`, u];
}

// ---------------------------------------------------------------------------
// WooCommerce Store API

type WooProduct = {
  id: number;
  name: string;
  permalink: string;
  sku?: string;
  type?: string;
  variation?: string;
  parent?: number;
  images: { src: string }[];
  variations?: { id: number }[];
};

/**
 * Products (and optionally their variations) of a WooCommerce shop. `variations`: "type" = list them with
 * ?type=variation, "each" = fetch each variation by id (shops where the type filter returns nothing).
 */
export async function wooProducts(origin: string, opts: { variations?: "type" | "each"; relevant?: (name: string) => boolean; gallery?: boolean } = {}): Promise<SourceItem[]> {
  const list = async (extra: string) => {
    const out: WooProduct[] = [];
    for (let page = 1; page < 80; page++) {
      const j = await getJson<WooProduct[]>(`${origin}/wp-json/wc/store/v1/products?per_page=100&page=${page}${extra}`, { ttlDays: 7 });
      if (!Array.isArray(j) || !j.length) break;
      out.push(...j);
      if (j.length < 100) break;
    }
    return out;
  };
  const parents = await list("");
  const byId = new Map(parents.map((p) => [p.id, p]));
  let vars: WooProduct[] = [];
  if (opts.variations === "type") vars = await list("&type=variation");
  else if (opts.variations === "each") {
    const ids = parents.filter((p) => !opts.relevant || opts.relevant(decodeEntities(p.name))).flatMap((p) => (p.variations ?? []).map((v) => ({ id: v.id, parent: p.id })));
    const got = await Promise.all(ids.map(async (v) => {
      const j = await getJson<WooProduct>(`${origin}/wp-json/wc/store/v1/products/${v.id}`, { ttlDays: 14 });
      return j ? ({ ...j, parent: j.parent || v.parent } as WooProduct) : null;
    }));
    vars = got.filter((x): x is WooProduct => !!x);
  }
  const items: SourceItem[] = [];
  const withVars = new Set(vars.map((v) => v.parent));
  for (const v of vars) {
    const parent = byId.get(v.parent ?? 0);
    const own = v.images?.[0]?.src;
    const pimg = parent?.images?.[0]?.src;
    items.push({
      product: decodeEntities(parent?.name ?? v.name),
      productKey: parent?.permalink ?? v.permalink,
      variant: decodeEntities(v.variation ?? v.name),
      gtins: [gtinNorm(v.sku)].filter((x): x is string => !!x),
      images: [own ?? pimg].filter((x): x is string => !!x),
      page: v.permalink,
      familyImage: !own || own === pimg,
    });
  }
  for (const p of parents) {
    if (withVars.has(p.id) || !p.images?.length) continue;
    if (opts.gallery && p.images.length > 1) {
      // One product, one picture per flavour in its gallery: the file name says which.
      for (const img of p.images) {
        const file = decodeURIComponent(img.src.split("/").pop() ?? "").replace(/\.\w+$/, "").replace(/-\d+x\d+$/, "").replace(/[-_]+/g, " ");
        items.push({ product: decodeEntities(p.name), productKey: p.permalink, variant: file, gtins: [], images: [img.src], page: p.permalink });
      }
      continue;
    }
    items.push({
      product: decodeEntities(p.name),
      productKey: p.permalink,
      gtins: [gtinNorm(p.sku)].filter((x): x is string => !!x),
      images: p.images.map((i) => i.src),
      page: p.permalink,
      familyImage: (p.variations?.length ?? 0) > 1,
    });
  }
  return items;
}

// ---------------------------------------------------------------------------
// PrestaShop 1.7 product pages: data-product JSON (name, combination attributes with ean13, images)

export function prestashopProduct(html: string, page: string): SourceItem[] {
  const raw = /data-product="([^"]+)"/.exec(html)?.[1];
  if (!raw) return [];
  let d: { name?: string; attributes?: Record<string, { name?: string; group?: string; ean13?: string }>; images?: { large?: { url: string }; bySize?: Record<string, { url: string }> }[]; ean13?: string };
  try {
    d = JSON.parse(decodeEntities(raw));
  } catch {
    return [];
  }
  const attrs = Object.values(d.attributes ?? {});
  const img = d.images?.[0];
  const url = img?.bySize?.zoom_default?.url ?? img?.large?.url ?? img?.bySize?.large_default?.url;
  if (!d.name || !url) return [];
  const gt = [...attrs.map((a) => a.ean13), d.ean13].map(gtinNorm).filter((x): x is string => !!x);
  return [{ product: decodeEntities(d.name), productKey: page.replace(/#.*$/, ""), variant: attrs.map((a) => a.name).filter(Boolean).join(" / ") || undefined, gtins: [...new Set(gt)], images: [url], page, familyImage: true }];
}
