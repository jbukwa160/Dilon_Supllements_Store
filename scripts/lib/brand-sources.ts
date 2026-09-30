// Official sources per brand for scripts/fetch-images.ts. ONLY the manufacturer's own domain (its shop, product
// pages, catalogue site) — never other retailers. Each entry says how the brand's products are listed; sites that
// also sell other brands are filtered to the brand's own products.
import { decodeEntities } from "../../src/lib/text-match";
import { getJson, getText } from "./polite-fetch";
import { tokens, type Target } from "./image-match";
import {
  absUrl,
  crawlPages,
  gtinNorm,
  metaContent,
  prestashopProduct,
  productsFromPage,
  shopifyProducts,
  shopifySized,
  sitemapUrls,
  wooProducts,
  type SourceItem,
} from "./image-sources";

export type LoadCtx = { targets: Target[]; brandWords: string[] };
export type BrandSource = {
  brands: string[];
  site: string;
  method: string;
  load: (ctx: LoadCtx) => Promise<SourceItem[]>;
  sized?: (url: string) => string[];
  productFilter?: (it: SourceItem) => boolean;
  /** The brand publishes GTINs for its whole range: accept EAN matches only (a name match is then an old or other item). */
  eanOnly?: boolean;
  /** Extra words of the brand name to ignore when comparing names. */
  words?: string[];
};

// ---------------------------------------------------------------------------
// Helpers

const strip = (s: string) => decodeEntities(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

/** Keep only URLs whose slug shares words with one of our target products (big sites: fetch what can match). */
function relevantUrls(urls: string[], ctx: LoadCtx, minShared = 2): string[] {
  const targetSets = ctx.targets.map((t) => new Set(tokens(t.name, ctx.brandWords).filter((w) => !/\p{Script=Cyrillic}/u.test(w))));
  return urls.filter((u) => {
    const slug = new Set(tokens(decodeURIComponent(new URL(u).pathname).replace(/[-_/.]+/g, " "), ctx.brandWords));
    return targetSets.some((s) => {
      let n = 0;
      for (const w of s) if (slug.has(w)) n++;
      return n >= Math.min(minShared, s.size);
    });
  });
}

/** True when a product title shares words with one of our target products (skip fetching details of the rest). */
function relevantText(ctx: LoadCtx, minShared = 1): (text: string) => boolean {
  const targetSets = ctx.targets.map((t) => new Set(tokens(t.name, ctx.brandWords).filter((w) => !/\p{Script=Cyrillic}/u.test(w))));
  return (text: string) => {
    const words = new Set(tokens(text.replace(/[-_]+/g, " "), ctx.brandWords));
    return targetSets.some((s) => {
      let n = 0;
      for (const w of s) if (words.has(w)) n++;
      return n >= Math.min(minShared, s.size);
    });
  };
}

/** IdoSell "trait" rows: <strong>Label:</strong></div><div class="--list"><span>value</span>. */
function idoTrait(html: string, label: string): string | null {
  const m = new RegExp(`${label}:?</strong></div><div class="--list">(.*?)</div>`, "i").exec(html);
  return m ? strip(m[1]) : null;
}

function uniq<T>(xs: T[]) {
  return [...new Set(xs)];
}

// ---------------------------------------------------------------------------
// Site-specific loaders

async function ostrovit(ctx: LoadCtx): Promise<SourceItem[]> {
  const urls = await sitemapUrls("https://ostrovit.com/sitemap.xml.gz", (u) => /\/en\/products\//.test(u));
  return crawlPages(relevantUrls(urls, ctx, 1), (html, page) => {
    if (!/Manufacturer\s*(?:<[^>]*>\s*)*OstroVit/i.test(html.replace(/<!--.*?-->/g, ""))) return [];
    const base = productsFromPage(html, page).filter((i) => i.images.length);
    const ean = gtinNorm(idoTrait(html, "EAN code"));
    const flavour = idoTrait(html, "Flavor") ?? idoTrait(html, "Flavour");
    const weight = idoTrait(html, "Net weight");
    return base.slice(0, 1).map((i) => ({
      ...i,
      productKey: i.product, // flavours are separate pages of one product
      variant: [flavour, weight].filter(Boolean).join(" / ") || undefined,
      gtins: ean ? [ean] : i.gtins,
    }));
  });
}

async function allnutrition(ctx: LoadCtx): Promise<SourceItem[]> {
  const urls = await sitemapUrls("https://allnutrition.com/sitemap.xml", (u) => /\/(ALLNUTRITION|LOCO|FITKING|SFD)_[^/]*-opis\d+\.html$/i.test(u));
  return crawlPages(relevantUrls(urls, ctx, 1), (html, page) => {
    const brand = /itemprop="brand"[\s\S]{0,300}?itemprop="name" content="([^"]*)"/.exec(html)?.[1] ?? "";
    if (!/allnutrition|loco|fitking|^sfd/i.test(brand)) return [];
    const name = strip(/product-name__name[^>]*>([\s\S]*?)<\/span>/.exec(html)?.[1] ?? "");
    const pack = strip(/product-name__package[^>]*>([\s\S]*?)<\/span>/.exec(html)?.[1] ?? "");
    const img = /<img[^>]+itemprop="image"[^>]+src="([^"]+)"/.exec(html)?.[1] ?? /<img[^>]+src="([^"]+)"[^>]+itemprop="image"/.exec(html)?.[1];
    const gtin = gtinNorm(/itemprop="gtin" content="([^"]*)"/.exec(html)?.[1]);
    if (!name || !img) return [];
    return [{ product: `${name} ${pack}`.trim(), productKey: page, gtins: gtin ? [gtin] : [], images: [absUrl(img, page)], page, familyImage: true }];
  });
}

async function trec(ctx: LoadCtx): Promise<SourceItem[]> {
  const urls = await sitemapUrls("https://www.trec.pl/sitemap.xml", (u) => /\.html$/.test(u));
  return crawlPages(relevantUrls(urls, ctx, 1), (html, page) => {
    const items = productsFromPage(html, page).filter((i) => i.images.length);
    const brand = /"brand"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/.exec(html)?.[1] ?? "";
    if (brand && !/trec/i.test(brand)) return [];
    const opts = uniq([...html.matchAll(/<option value="\d+" title="([^"]+)"/g)].map((m) => decodeEntities(m[1])));
    // Options are "<flavour> - <size>": several sizes under one picture = unknown pack on the picture.
    const sizes = uniq(opts.map((o) => /(\d+(?:[.,]\d+)?\s*(?:g|kg|ml|l|caps|kaps|tabl?)[^|]*)$/i.exec(o)?.[1]?.trim()).filter(Boolean));
    return items.slice(0, 1).map((i) => ({ ...i, familyImage: true, extra: opts.join(" | "), variant: sizes.length === 1 ? sizes[0] : undefined, mixedSizes: sizes.length > 1 }));
  });
}

type ScitecVariant = { label?: string; gtinId?: string; sku?: string; imageSrc?: string; isVariantImage?: boolean };
type ScitecProduct = { name?: string; brandName?: string; paramVariantList?: ScitecVariant[]; imageList?: ({ src?: string; imageSrc?: string } | string)[] };

async function scitec(): Promise<SourceItem[]> {
  const urls = await sitemapUrls("https://scitecnutrition.com/sitemap.xml", (u) => /-p\d+$/.test(u), (s) => /product/.test(s));
  const out: SourceItem[] = [];
  await Promise.all(
    urls.map(async (page) => {
      const id = /-p(\d+)$/.exec(page)![1];
      const j = await getJson<ScitecProduct>(`https://scitecnutrition.com/Product/api/getProductData?id=${id}`, { ttlDays: 30 });
      if (!j?.name) return;
      const main = (j.imageList ?? []).map((x) => (typeof x === "string" ? x : x.imageSrc ?? x.src ?? "")).filter(Boolean);
      const variants = j.paramVariantList?.length ? j.paramVariantList : [{} as ScitecVariant];
      for (const v of variants) {
        const img = v.imageSrc || main[0];
        if (!img) continue;
        const g = gtinNorm(v.gtinId);
        out.push({
          product: j.name,
          productKey: page,
          variant: v.label,
          gtins: g ? [g] : [],
          images: uniq([img, ...main]).map((u) => absUrl(u, "https://scitecnutrition.com/")),
          page,
          familyImage: !v.isVariantImage,
        });
      }
    }),
  );
  return out;
}
/** Scitec serves the same picture as lossless PNG. */
const scitecSized = (u: string) => [u.replace(/\.webp$/, ".png"), u];

async function hayaLabs(): Promise<SourceItem[]> {
  const pages: string[] = [];
  for (let p = 1; p <= 15; p++) {
    const html = await getText(`https://www.hayalabs.com/en/list?page=${p}`, { ttlDays: 14 });
    if (!html) break;
    const found = [...html.matchAll(/href="((?:https:\/\/www\.hayalabs\.com)?\/en\/\d+-HAYA-LABS-[^"]+\.html)"/gi)].map((m) => absUrl(m[1], "https://www.hayalabs.com/"));
    const fresh = found.filter((u) => !pages.includes(u));
    if (!fresh.length) break;
    pages.push(...fresh);
  }
  return crawlPages(uniq(pages), (html, page) => {
    const img = /\/uf\/product\/[^"']+_pm_[^"']+\.(?:jpe?g|png|webp)/i.exec(html)?.[0];
    if (!img) return [];
    const upc = gtinNorm(/UPC:<\/span>\s*([0-9 ]+)/.exec(html)?.[1]);
    const name = decodeURIComponent(/\/en\/\d+-HAYA-LABS-(.+)\.html$/i.exec(page)?.[1] ?? "").replace(/-/g, " ").trim();
    return [{ product: name, productKey: page, gtins: upc ? [upc] : [], images: [absUrl(img, page)], page, familyImage: true }];
  });
}

async function vplab(ctx: LoadCtx): Promise<SourceItem[]> {
  const urls = await sitemapUrls("https://vplab.com/sitemap.xml", (u) => /^https:\/\/vplab\.com\/products\/[^/]+$/.test(u));
  return crawlPages(relevantUrls(urls, ctx, 1), (html, page) => {
    const ld = productsFromPage(html, page);
    const name = ld[0]?.product ?? metaContent(html, "og:title") ?? "";
    const i = html.indexOf("variants:$R");
    let seg = i >= 0 ? html.slice(i, i + 60000) : "";
    const r = seg.indexOf("related:$R");
    if (r > 0) seg = seg.slice(0, r);
    const out: SourceItem[] = [];
    for (const m of seg.matchAll(/title:"([^"]*)",sku:"([^"]*)"[\s\S]*?image:\$R\[\d+\]=\{url:"([^"]*)"/g)) {
      const img = m[3].replace(/\\u002F/g, "/");
      const ean = /(\d{13})/.exec(img)?.[1];
      out.push({ product: name, productKey: page, variant: m[1], gtins: ean ? [gtinNorm(ean)!] : [], images: [img], page });
    }
    if (!out.length && ld[0]?.images.length) out.push({ ...ld[0], familyImage: true });
    return out;
  });
}

async function nutrend(ctx: LoadCtx): Promise<SourceItem[]> {
  const urls = await sitemapUrls("https://www.nutrend.eu/media/sitemap/products.xml", () => true);
  return crawlPages(relevantUrls(urls, ctx, 1), (html, page) =>
    productsFromPage(html, page).map((i) => ({ ...i, productKey: page.replace(/\/[^/]*$/, ""), variant: decodeURIComponent(page.split("/").pop() ?? "").replace(/-/g, " ") })),
  );
}

/** Myprotein (THG): JSON-LD ProductGroup with per-variant gtin13; images come wrapped in a resizer URL. */
async function myprotein(ctx: LoadCtx): Promise<SourceItem[]> {
  const out: SourceItem[] = [];
  for (const host of ["https://www.myprotein.bg", "https://www.myprotein.com"]) {
    const urls = await sitemapUrls(`${host}/sitemapindex-product.xml.gz`, (u) => /\/p\//.test(u));
    out.push(...(await crawlPages(relevantUrls(urls, ctx, 2), (html, page) => productsFromPage(html, page))));
  }
  return out;
}
function thgUnwrap(u: string): string[] {
  const inner = /[?&]url=([^&]+)/.exec(u)?.[1];
  const real = inner ? decodeURIComponent(inner) : u;
  return uniq([real.replace(/\/productimg\/[^/]+\//, "/productimg/original/"), real]);
}

async function nowFoods(ctx: LoadCtx): Promise<SourceItem[]> {
  const urls = await sitemapUrls("https://www.nowfoods.com/sitemap.xml", (u) => /\/products\//.test(u));
  return crawlPages(relevantUrls(urls, ctx, 2), (html, page) => {
    const name = strip(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? "") || (metaContent(html, "og:title") ?? "");
    const rows = [...html.matchAll(/product-sizes--size">([\s\S]*?)<\/td>\s*<td class="product-sizes--sku">([\s\S]*?)<\/td>\s*<td class="product-sizes--upc">([\s\S]*?)<\/td>/g)].map((m) => ({
      size: strip(m[1]),
      sku: strip(m[2]),
      upc: gtinNorm(strip(m[3])),
    }));
    // JSON-LD offers carry the picture per NOW SKU.
    const imgBySku = new Map<string, string>();
    for (const m of html.matchAll(/"sku"\s*:\s*"(\d{3,5})"[\s\S]{0,400}?"image"\s*:\s*"([^"]+)"/g)) imgBySku.set(m[1], m[2].replace(/\\\//g, "/"));
    const og = metaContent(html, "og:image");
    const out: SourceItem[] = [];
    for (const r of rows) {
      const img = imgBySku.get(r.sku);
      if (!img) continue;
      out.push({ product: name, productKey: page, variant: r.size, gtins: r.upc ? [r.upc] : [], images: [absUrl(img, page)], page: `${page}?SKU=${r.sku}` });
    }
    if (!out.length && og) out.push({ product: name, productKey: page, gtins: rows.map((r) => r.upc!).filter(Boolean), images: [absUrl(og, page)], page, familyImage: true });
    return out;
  });
}

async function nutriversum(ctx: LoadCtx): Promise<SourceItem[]> {
  const urls = await sitemapUrls("https://www.nutriversum.org/sitemap.xml", (u) => /nutriversum\.org\/[^/]+\/[^/]+\/?$/.test(u));
  return crawlPages(relevantUrls(urls, ctx, 1), (html, page) => {
    const name = strip(/product-page-product-name[^>]*>([\s\S]*?)<\/span>/.exec(html)?.[1] ?? "");
    const imgs = uniq([...html.matchAll(/documents\/product\/(?!l_|m_|s_)([^"'\s]+\.(?:png|jpe?g|webp))/g)].map((m) => m[0]));
    if (!name || !imgs.length) return [];
    const main = imgs.find((i) => !i.includes("/_extra/"));
    const items: SourceItem[] = [];
    if (main) items.push({ product: name, productKey: page, gtins: [], images: [absUrl(`/sites/new_nutriversum_org/${main}`, "https://www.nutriversum.org/")], page, familyImage: true });
    for (const x of imgs.filter((i) => i.includes("/_extra/"))) {
      const flav = x.split("/").pop()!.replace(/-webshop.*$/, "").replace(/_/g, " ");
      items.push({ product: name, productKey: page, variant: flav, gtins: [], images: [absUrl(`/sites/new_nutriversum_org/${x}`, "https://www.nutriversum.org/")], page });
    }
    return items;
  });
}

async function faNutrition(): Promise<SourceItem[]> {
  const list = await getText("https://fasklep.pl/en/marka/3-fitness-authority", { ttlDays: 14 });
  if (!list) return [];
  const urls = uniq([...list.matchAll(/href="(https:\/\/fasklep\.pl\/en\/[^"#?]+\/\d+-[^"#?]+\.html)"/g)].map((m) => m[1]));
  return crawlPages(urls, (html, page) => {
    const ld = productsFromPage(html, page, { ogFallback: true });
    const name = strip(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? "") || ld[0]?.product;
    const img = /https:\/\/fasklep\.pl\/\d+-large_default\/[^"']+\.jpg/.exec(html)?.[0] ?? ld[0]?.images[0];
    if (!name || !img) return [];
    const gt = uniq([
      ...[...html.matchAll(/itemprop="gtin13" content="(\d+)"/g)].map((m) => m[1]),
      ...[...decodeEntities(html).matchAll(/"ean13":"(\d{8,14})"/g)].map((m) => m[1]),
      /-(\d{13})\.html$/.exec(page)?.[1] ?? "",
    ].map(gtinNorm).filter((x): x is string => !!x));
    return [{ product: name, productKey: page, gtins: gt, images: [img], page, familyImage: true }];
  });
}

/** Optimum Nutrition: each locale store lists a different catalogue — merge them. */
async function optimum(): Promise<SourceItem[]> {
  const out: SourceItem[] = [];
  for (const loc of ["", "/en-gb", "/de-de", "/fr-fr", "/nl-nl", "/en-us"]) out.push(...(await shopifyProducts("https://www.optimumnutrition.com", { barcodes: true, pathPrefix: loc })));
  return out;
}

async function levrone(ctx: LoadCtx): Promise<SourceItem[]> {
  const urls = await sitemapUrls("https://levrosupplements.com/sitemap.xml", (u) =>
    /levrosupplements\.com\/gb\/[^/]+\/\d+(?:-\d+)?-[^/]+\.html$/.test(u) && !/middle-east|outside-the-european|peru|china|usa|merch/.test(u),
  );
  // One page per product (a combination id in the URL only preselects a flavour).
  const byId = new Map<string, string>();
  for (const u of urls) byId.set(/\/(\d+)(?:-\d+)?-[^/]+\.html$/.exec(u)![1], u);
  return crawlPages(relevantUrls([...byId.values()], ctx, 1), (html, page) => {
    const items = prestashopProduct(html, page);
    const slugEan = gtinNorm(/-(\d{13})\.html$/.exec(page)?.[1]);
    const sheet = [...html.matchAll(/<dt class="name">ean13<\/dt>\s*<dd class="value">(\d+)</g)].map((m) => gtinNorm(m[1])).filter((x): x is string => !!x);
    return items.map((i) => ({ ...i, gtins: uniq([...i.gtins, ...sheet, ...(slugEan ? [slugEan] : [])]) }));
  });
}

async function sixPak(ctx: LoadCtx): Promise<SourceItem[]> {
  const urls = await sitemapUrls("https://6paknutrition.com/sitemap.xml", (u) => /\.html$/.test(u));
  return crawlPages(relevantUrls(urls, ctx, 1), (html, page) => prestashopProduct(html, page));
}

/** Olimp's regional WooCommerce stores: no GTIN field, but packshot file names are the EAN. */
async function olimp(): Promise<SourceItem[]> {
  const out: SourceItem[] = [];
  for (const store of ["https://olimpsport.co.uk", "https://olimpsport.com.pl", "https://olimpsport.de", "https://olimpsport.fr"]) {
    const items = await wooProducts(store, { variations: "type" });
    for (const it of items) {
      const ean = /\/(\d{13})[-_.]/.exec(it.images[0] ?? "")?.[1];
      if (ean) it.gtins = uniq([...it.gtins, gtinNorm(ean)!]);
      // Full-size originals (never the -WxH renditions).
      it.images = it.images.map((u) => u.replace(/-\d+x\d+(\.\w+)$/, "$1"));
    }
    out.push(...items);
  }
  return out;
}

async function everbuild(): Promise<SourceItem[]> {
  const html = await getText("https://www.everbuildnutrition.com/", { ttlDays: 14 });
  if (!html) return [];
  const items = new Map<string, SourceItem>();
  for (const m of html.matchAll(/<a[^>]+href="(https:\/\/www\.everbuildnutrition\.com\/en\/(\d+)-[^"]+\.html)"[^>]*>([\s\S]{0,400}?)<\/a>/g)) {
    const [, page, id, inner] = m;
    const it = items.get(id) ?? { product: "", productKey: page, gtins: [], images: [], page, familyImage: true };
    const img = /<img[^>]+src="([^"]*\/uf\/product\/[^"]+)"/.exec(inner)?.[1];
    if (img) it.images = [encodeURI(img)];
    else if (!it.product) it.product = strip(inner);
    items.set(id, it);
  }
  return [...items.values()].filter((i) => i.product && i.images.length);
}

/** Amix: the site search accepts an EAN and links the matching flavour page with its packshot. */
async function amix(ctx: LoadCtx): Promise<SourceItem[]> {
  const out: SourceItem[] = [];
  const eans = uniq(ctx.targets.map((t) => gtinNorm(t.ean)).filter((x): x is string => !!x && x.length >= 12));
  await Promise.all(
    eans.map(async (ean) => {
      const html = await getText(`https://amix-nutrition.com/search-results?q=${ean.padStart(13, "0")}`, { ttlDays: 30 });
      if (!html) return;
      const hits = [...html.matchAll(/<a href="(\/[^"?]+)"><img src="(\/data\/image\/w500h500\/[^"]+)"[^>]*alt="([^"]*)"/g)];
      if (hits.length !== 1) return; // no hit, or several products: not an exact EAN answer
      const [, path, img, alt] = hits[0];
      out.push({
        product: decodeEntities(alt),
        productKey: path,
        variant: path.split("/").pop()!.replace(/-/g, " "),
        gtins: [ean],
        images: [`https://amix-nutrition.com${img.replace("/w500h500/", "/w1024h1024/")}`, `https://amix-nutrition.com${img}`],
        page: `https://amix-nutrition.com${path}`,
      });
    }),
  );
  return out;
}

/** Bioherba: category pages → product pages; the product code ("BH0610") is the tail of the EAN. */
async function bioherba(ctx: LoadCtx): Promise<SourceItem[]> {
  const base = "https://bio-herba.com/";
  const home = (await getText(`${base}bg/Категории-продукти.html`, { ttlDays: 14 })) ?? "";
  const cats = uniq([...home.matchAll(/href="([^"]*Листинг-на-продукти-в-категория[^"]*)"/g), ...home.matchAll(/href="([^"]*%D0%9B%D0%B8%D1%81%D1%82%D0%B8%D0%BD%D0%B3[^"]*)"/g)].map((m) => absUrl(m[1], base)));
  const prods = new Set<string>();
  const add = (html: string) => {
    for (const m of html.matchAll(/href="([^"]*(?:Детайли-на-продукт|%D0%94%D0%B5%D1%82%D0%B0%D0%B9%D0%BB%D0%B8)[^"]*)"/g)) prods.add(absUrl(m[1], base));
  };
  await Promise.all(cats.map(async (c) => add((await getText(c, { ttlDays: 14 })) ?? "")));
  const eans = ctx.targets.map((t) => t.ean?.replace(/\D/g, "") ?? "").filter((e) => e.length >= 12);
  return crawlPages([...prods], (html, page) => {
    const code = /<strong>Код:<\/strong>\s*BH(\d{4,6})/.exec(html)?.[1];
    const name = strip(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? "");
    const img = /products_photos\/\d+\/\d+\.(?:jpe?g|png|webp)/.exec(html)?.[0];
    if (!code || !name || !img) return [];
    const hits = eans.filter((e) => e.endsWith(code));
    return [{ product: name, productKey: page, gtins: hits.length === 1 ? [gtinNorm(hits[0])!] : [], images: [absUrl(img, base)], page, familyImage: true }];
  });
}

const fitspo = async (ctx: LoadCtx) => [
  ...(await shopifyProducts("https://fitspo.zone", { barcodes: true, relevant: relevantText(ctx) })),
  ...(await wooProducts("https://b2b.fitspo.zone")).map((i) => ({ ...i, images: i.images.map((u) => u.replace(/-scaled(\.\w+)$/, "$1")) })),
];

// ---------------------------------------------------------------------------

/** WordPress uploads: the original, then the 1024 px rendition WordPress keeps next to it (originals can exceed 5 MB). */
const wpSized = (u: string) => [u, u.replace(/(\.(?:jpe?g|png|webp))$/i, "-1024x1024$1")];

const shopify = (origin: string) => (ctx: LoadCtx) => shopifyProducts(origin, { barcodes: true, relevant: relevantText(ctx) });

export const BRAND_SOURCES: BrandSource[] = [
  { brands: ["Applied Nutrition"], site: "appliednutrition.uk", method: "Shopify products.json + variant barcodes", load: shopify("https://www.appliednutrition.uk"), sized: shopifySized },
  { brands: ["BioTech USA"], site: "shop.biotechusa.com", method: "Shopify products.json + variant barcodes", load: shopify("https://shop.biotechusa.com"), sized: shopifySized, words: ["biotechusa", "biotech"] },
  { brands: ["OstroVit"], site: "ostrovit.com", method: "sitemap + product pages (JSON-LD, EAN trait, manufacturer = OstroVit)", load: ostrovit },
  {
    brands: ["Allnutrition", "SFD Nutrition"],
    site: "allnutrition.com",
    method: "sitemap + product pages (itemprop gtin; own brands only)",
    load: allnutrition,
    sized: (u) => [u.replace(/_d\d+x\d+(\.\w+)$/, "_d1200x1200$1"), u],
    words: ["all nutrition", "allnutrition", "sfd nutrition", "sfd"],
  },
  { brands: ["Trec Nutrition"], site: "trec.pl", method: "sitemap + product pages (JSON-LD; no EAN on site)", load: trec, words: ["trec nutrition", "trec"] },
  { brands: ["Scitec Nutrition"], site: "scitecnutrition.com", method: "sitemap + product JSON API (gtinId per flavour)", load: scitec, sized: scitecSized, words: ["scitec nutrition", "scitec"] },
  { brands: ["Haya Labs"], site: "hayalabs.com", method: "product list + product pages (UPC)", load: hayaLabs, words: ["haya labs", "haya"] },
  { brands: ["VPLab"], site: "vplab.com", method: "sitemap + product pages (variant data; EAN in file names)", load: vplab, words: ["vplab", "vp lab", "vp laboratory"] },
  { brands: ["Dorian Yates Nutrition"], site: "dynutrition.com", method: "Shopify products.json + barcodes/SKU", load: shopify("https://dynutrition.com"), sized: shopifySized, words: ["dorian yates nutrition", "dorian yates", "dy nutrition", "dy"] },
  { brands: ["Core Champs by Kai Greene"], site: "corechamps.eu", method: "Shopify products.json + barcodes", load: shopify("https://corechamps.eu"), sized: shopifySized, eanOnly: true, words: ["core champs", "kai greene", "core"] },
  { brands: ["Rule 1"], site: "ruleoneproteins.com", method: "Shopify products.json + barcodes", load: shopify("https://www.ruleoneproteins.com"), sized: shopifySized, eanOnly: true, words: ["rule 1", "rule one", "r1"] },
  { brands: ["Trace Minerals"], site: "traceminerals.com", method: "Shopify products.json + barcodes", load: shopify("https://www.traceminerals.com"), sized: shopifySized, eanOnly: true, words: ["trace minerals"] },
  {
    brands: ["Skinny Food Co"],
    site: "theskinnyfoodco.com",
    method: "Shopify products.json + barcodes",
    load: shopify("https://theskinnyfoodco.com"),
    sized: shopifySized,
    productFilter: (it) => !/\bcase\b|\bx\s?\d+\b|bundle/i.test(`${it.product} ${it.variant ?? ""}`),
    words: ["skinny food co", "the skinny food co", "skinny food", "notguilty"],
  },
  { brands: ["GHOST"], site: "ghostlifestyle.com", method: "Shopify products.json + barcodes", load: shopify("https://www.ghostlifestyle.com"), sized: shopifySized, eanOnly: true, words: ["ghost"] },
  { brands: ["Optimum Nutrition"], site: "optimumnutrition.com", method: "Shopify products.json (all locale stores) + barcodes", load: () => optimum(), sized: shopifySized, words: ["optimum nutrition", "optimum", "on"] },
  { brands: ["NOW Foods"], site: "nowfoods.com", method: "sitemap + product pages (UPC size table)", load: nowFoods, eanOnly: true, words: ["now foods", "now"] },
  { brands: ["Nutrend"], site: "nutrend.eu", method: "product sitemap + JSON-LD gtin13 per variant", load: nutrend, eanOnly: true, words: ["nutrend"] },
  { brands: ["Myprotein"], site: "myprotein.bg / myprotein.com", method: "product sitemap + JSON-LD ProductGroup gtin13", load: myprotein, sized: thgUnwrap, words: ["myprotein", "my protein"] },
  { brands: ["Nutriversum"], site: "nutriversum.org", method: "sitemap + product galleries (no EAN; name match)", load: nutriversum, words: ["nutriversum"] },
  { brands: ["FA Nutrition"], site: "fasklep.pl (official FA shop)", method: "brand page + product pages (gtin13)", load: faNutrition, words: ["fa nutrition", "fitness authority", "fa"] },
  { brands: ["Kevin Levrone"], site: "levrosupplements.com", method: "sitemap + PrestaShop product data (combination ean13)", load: levrone, words: ["kevin levrone", "levrone", "levro", "signature series"] },
  { brands: ["6PAK Nutrition"], site: "6paknutrition.com", method: "sitemap + PrestaShop product data (combination ean13)", load: sixPak, words: ["6pak nutrition", "6pak", "6 pak"] },
  { brands: ["Olimp Sport Nutrition"], site: "olimpsport.co.uk / .com.pl / .de / .fr", method: "WooCommerce Store API (EAN in packshot file names)", load: () => olimp(), sized: wpSized, words: ["olimp sport nutrition", "olimp"] },
  { brands: ["Everbuild Nutrition"], site: "everbuildnutrition.com", method: "product menu (one packshot per product; no EAN on site)", load: () => everbuild(), words: ["everbuild nutrition", "everbuild"] },
  { brands: ["Hero.Lab"], site: "heropro.uk (HIRO.LAB brand shop)", method: "WooCommerce Store API + variations (no EAN on site)", load: (ctx) => wooProducts("https://heropro.uk", { variations: "each", relevant: relevantText(ctx) }), sized: wpSized, words: ["hero lab", "hiro lab", "herolab", "hirolab", "hero", "hiro"] },
  { brands: ["Amix"], site: "amix-nutrition.com", method: "site search by EAN (exact single hit)", load: amix, words: ["amix", "amix nutrition", "amixnutrition"] },
  { brands: ["Swedish Supplements"], site: "swedish-supplements.com", method: "WooCommerce Store API (no EAN; name match)", load: () => wooProducts("https://www.swedish-supplements.com", { gallery: true }), sized: wpSized, words: ["swedish supplements"] },
  { brands: ["FIT SPO"], site: "fitspo.zone / b2b.fitspo.zone", method: "Shopify barcodes + WooCommerce B2B (sku = EAN)", load: fitspo, sized: shopifySized, words: ["fit spo", "fitspo"] },
  { brands: ["Nutricost"], site: "nutricost.com", method: "Shopify products.json + barcodes", load: shopify("https://nutricost.com"), sized: shopifySized, eanOnly: true, words: ["nutricost"] },
  {
    brands: ["Natural Factors"],
    site: "naturalfactors.com / ca.naturalfactors.com",
    method: "Shopify products.json + barcodes (US and CA stores)",
    load: async (ctx) => [...(await shopify("https://ca.naturalfactors.com")(ctx)), ...(await shopify("https://naturalfactors.com")(ctx))],
    sized: shopifySized,
    eanOnly: true,
    words: ["natural factors"],
  },
  { brands: ["Ronnie Coleman Signature Series"], site: "ronniecoleman.net", method: "Shopify products.json + barcodes", load: shopify("https://ronniecoleman.net"), sized: shopifySized, words: ["ronnie coleman signature series", "ronnie coleman", "signature series"] },
  { brands: ["Harbinger"], site: "harbingerfitness.com", method: "Shopify products.json + barcodes (US codes; mostly name match)", load: shopify("https://harbingerfitness.com"), sized: shopifySized, words: ["harbinger"] },
  { brands: ["Doctor's Best"], site: "drbvitamins.com", method: "Shopify products.json + barcodes", load: shopify("https://www.drbvitamins.com"), sized: shopifySized, eanOnly: true, words: ["doctor's best", "doctors best", "doctor s best"] },
  { brands: ["SmartShake"], site: "smartshake.com", method: "Shopify products.json + barcodes", load: shopify("https://smartshake.com"), sized: shopifySized, words: ["smartshake", "smart shake"] },
  { brands: ["Double Wood Supplements"], site: "doublewoodsupplements.com", method: "Shopify products.json + barcodes", load: shopify("https://doublewoodsupplements.com"), sized: shopifySized, words: ["double wood supplements", "double wood"] },
  { brands: ["JNX / Cobra Labs"], site: "jnxsports.com", method: "Shopify products.json + barcodes", load: shopify("https://jnxsports.com"), sized: shopifySized, words: ["jnx sports", "jnx", "cobra labs", "the curse"] },
  { brands: ["Genius Nutrition"], site: "geniusnutrition.eu", method: "Shopify products.json + barcodes", load: shopify("https://www.geniusnutrition.eu"), sized: shopifySized, words: ["genius nutrition", "genius"] },
  { brands: ["Bioherba"], site: "bio-herba.com", method: "category + product pages (code = EAN tail)", load: bioherba, words: ["bioherba", "биохерба", "bio herba"] },
  { brands: ["Gaspari Nutrition"], site: "gasparinutrition.com", method: "Shopify products.json + barcodes (US codes; mostly name match)", load: shopify("https://gasparinutrition.com"), sized: shopifySized, words: ["gaspari nutrition", "gaspari"] },
];

/** Words of the brand name removed from both sides before comparing product names. */
export function brandWordsOf(brand: string, src: BrandSource): string[] {
  const extra: Record<string, string[]> = {
    "Kevin Levrone": ["kevin levrone", "levrone", "levro"],
    "Olimp Sport Nutrition": ["olimp sport nutrition", "olimp"],
    "Hero.Lab": ["hero.lab", "hero lab", "herolab", "hiro.lab", "hiro lab"],
    "Everbuild Nutrition": ["everbuild nutrition", "everbuild"],
    "KFD Nutrition": ["kfd nutrition", "kfd"],
    "Applied Nutrition": ["applied nutrition", "applied"],
    OstroVit: ["ostrovit", "ostro vit"],
  };
  return uniq([...(extra[brand] ?? []), ...(src.words ?? []), ...src.brands.map((b) => b.toLowerCase()), brand.toLowerCase()]).sort((a, b) => b.length - a.length);
}
