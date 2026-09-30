// Matching our catalogue products to a brand's official product list (scripts/fetch-images.ts).
// EAN/GTIN first; otherwise a weighted token F1 of the product names (brand, pack sizes and flavour removed) picks the
// product, and flavour / size pick the variant. Anything ambiguous is sent to review, never applied.
import { flavourEn } from "../../src/lib/flavours";
import { parseSizeText } from "../../src/lib/variants";
import { cleanText } from "../../src/lib/text-match";
import { gtinNorm, type SourceItem } from "./image-sources";

export type Target = {
  id: number;
  sku: string;
  ean: string | null;
  brand: string;
  name: string;
  flavour: string | null;
  flavour_en: string | null;
  size_label: string | null;
  group_id: number | null;
  stock: number;
};

export type Match = {
  status: "matched" | "review" | "not-found";
  score: number;
  how: string;
  item?: SourceItem;
  note?: string;
};

// ---------------------------------------------------------------------------
// Tokens

const BG_EN: [RegExp, string][] = [
  [/протеинов\w*|протеин\w*/gu, "protein"],
  [/барове|бар\b|блокчета?/gu, "bar"],
  [/креатин\w*/gu, "creatine"],
  [/витамин\w*/gu, "vitamin"],
  [/мултивитамин\w*/gu, "multivitamin"],
  [/магнези\w*/gu, "magnesium"],
  [/цинк\w*/gu, "zinc"],
  [/желязо/gu, "iron"],
  [/калци\w*/gu, "calcium"],
  [/колаген\w*/gu, "collagen"],
  [/глутамин\w*/gu, "glutamine"],
  [/карнитин\w*/gu, "carnitine"],
  [/аргинин\w*/gu, "arginine"],
  [/цитрулин\w*/gu, "citrulline"],
  [/бета[- ]?аланин\w*/gu, "beta alanine"],
  [/таурин\w*/gu, "taurine"],
  [/шейкър\w*/gu, "shaker"],
  [/бисквит\w*/gu, "cookie"],
  [/вафл\w*/gu, "wafer"],
  [/гел\b|гелове/gu, "gel"],
  [/чипс\w*/gu, "chips"],
  [/хидролизат\w*/gu, "hydrolysate"],
  [/изолат\w*/gu, "isolate"],
  [/суроватъч\w*/gu, "whey"],
  [/палачинк\w*/gu, "pancake"],
  [/крънч/gu, "crunch"],
  [/електролит\w*/gu, "electrolytes"],
  [/омега/gu, "omega"],
  [/мелатонин/gu, "melatonin"],
  [/ашваганда/gu, "ashwagandha"],
  [/кофеин\w*/gu, "caffeine"],
  [/гейнър\w*|гейнер\w*/gu, "gainer"],
  [/фет бърнър|фетбърнър/gu, "fat burner"],
  [/ръкавици/gu, "gloves"],
  [/колан\w*/gu, "belt"],
  [/кутия|органайзер/gu, "box"],
];

// Words that say little about WHICH product it is.
const STOP = new Set(
  (
    "with and of the for in a an by to new formula nutrition sport sports supplement supplements dietary food line series signature edition " +
    "g gr kg mg mcg µg ml l lb lbs oz x caps capsules capsule tabs tablets tablet softgels softgel gummies serv servings serving portions " +
    "dose doses amp amps pcs pc pack bag jar tub box bottle glass " +
    "с и за от на в със грама гр г кг мл л дози доза капсули капсула таблетки таблетка броя бр сашета сашe сашета пакет пакетче кутия " +
    "неовкусен неовкусена unflavoured unflavored flavourless natural вкус вкуса формула азотен бустер"
  ).split(" "),
);
const FORM_CLASS: Record<string, string> = {
  shot: "shot", shots: "shot", шот: "shot", ампула: "shot", ампули: "shot", ampoule: "shot", ampoules: "shot",
  liquid: "liquid", течен: "liquid", течна: "liquid", течност: "liquid",
  powder: "powder", прах: "powder",
  bar: "bar", bars: "bar",
  gel: "gel", gels: "gel",
  gummies: "gummies", chews: "gummies",
  drops: "drops", капки: "drops",
  cookie: "cookie", cookies: "cookie",
  spray: "spray", спрей: "spray",
};
// Form words: some weight (a "powder" and "caps" version are different packshots) but less than names.
const FORM = new Set(
  "powder прах liquid течен течна шот shot shots drink напитка chews gel drops капки spray спрей effervescent шипящи ампули ampoules stick sticks sachet sachets сашета саше".split(" "),
);

function stripSizes(s: string): string {
  return s
    .replace(/\d+(?:[.,]\d+)?\s*(?:x|х|×)\s*\d+(?:[.,]\d+)?\s*(?:g|gr|г|гр|ml|мл|kg|кг)\b\.?/giu, " ")
    .replace(
      /\d+(?:[.,]\d+)?\s*(?:kg|кг|g|gr|гр|грама|г|mg|мг|mcg|мкг|ml|мл|l|л|lbs?|oz|caps?\.?|capsules|капсули|tabs?\.?|tablets|таблетки|softgels|меки капсули|serv\w*|дози|доза|sachets?|сашета|pcs|бр\.?|броя|amps?\.?|ампули|шота|gummies|дъвчащи)(?![\p{L}])/giu,
      " ",
    );
}

export function tokens(raw: string, drop: string[] = []): string[] {
  let s = cleanText(raw).toLowerCase();
  // Latin words typed with Cyrillic look-alike letters ("Cafе" with a Cyrillic е).
  s = s.replace(/[\p{L}]+/gu, (w) => (/[a-z]/.test(w) && /\p{Script=Cyrillic}/u.test(w) ? w.replace(/[аеорсхукміт]/g, (c) => "aeopcxykmit"["аеорсхукміт".indexOf(c)]) : w));
  s = s.replace(/blue raz+/g, "blue raspberry").replace(/multi[- ]vitamin/g, "multivitamin");
  s = s.replace(/[®™©]/g, "").replace(/(\d):(\d):(\d)/g, "$1$2$3");
  s = stripSizes(s);
  for (const [re, en] of BG_EN) s = s.replace(re, ` ${en} `);
  for (const d of drop) {
    if (!d) continue;
    const esc = d.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    s = s.replace(new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, "gu"), " ");
  }
  s = s.replace(/[^\p{L}\p{N}]+/gu, " ");
  // Split letter/number glue ("b12" stays, "wpc80" → "wpc 80").
  s = s.replace(/([a-z]{3,})(\d{2,})\b/g, "$1 $2");
  return s.split(" ").filter((t) => t && !STOP.has(t) && !(t.length === 1 && !/\d/.test(t)));
}

function weight(t: string): number {
  if (FORM.has(t)) return 0.4;
  if (/\p{Script=Cyrillic}/u.test(t)) return 0.25; // untranslated Bulgarian words rarely appear on brand sites
  return 1;
}

/** Weighted F1 of two token lists (recall over `a` = ours, precision over `b` = theirs). */
export function tokenF1(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let wa = 0, wb = 0, wi = 0;
  for (const t of A) {
    wa += weight(t);
    if (B.has(t) || (t.length >= 5 && [...B].some((x) => x.length >= 5 && (x.startsWith(t) || t.startsWith(x))))) wi += weight(t);
  }
  for (const t of B) wb += weight(t);
  if (!wi) return 0;
  const r = wi / wa;
  const p = Math.min(1, wi / wb);
  return (2 * p * r) / (p + r);
}

// ---------------------------------------------------------------------------
// Size / flavour

function grams(text: string | null | undefined): { v: number; kind: string } | null {
  if (!text) return null;
  const t = cleanText(text).replace(/(\d),(\d)/g, "$1.$2").replace(/(\d+(?:[.,]\d+)?)\s*lbs?\b/gi, (_, n) => `${Math.round(parseFloat(n.replace(",", ".")) * 453.6)} g`);
  const sz = parseSizeText(t);
  if (!sz) return null;
  const kind = sz.unit === "g" || sz.unit === "ml" ? "mass" : sz.unit;
  return { v: sz.value * (sz.mult || 1), kind };
}

function sameSize(a: { v: number; kind: string }, b: { v: number; kind: string }): boolean {
  if (a.kind !== b.kind) return false;
  const r = a.v / b.v;
  return (r > 0.95 && r < 1.053) || (a.kind === "mass" && Math.abs(a.v - b.v) <= 5);
}

export function flavourTokens(t: Target): string[] {
  const words = new Set<string>();
  for (const f of [t.flavour_en, flavourEn(t.flavour), /[a-z]/i.test(t.flavour ?? "") ? t.flavour : null]) {
    if (!f) continue;
    for (const w of tokens(f)) if (!/\p{Script=Cyrillic}/u.test(w)) words.add(w);
  }
  return [...words];
}

const VARIANT_NOISE = new Set("flavor flavour flavored flavoured taste smak geschmack gout new limited edition single box units unit pack servings serving tub bag bottle".split(" "));

const NEUTRAL_FLAVOUR = /неовкусен|без вкус|unflavou?red|natural|neutral|plain|натурален/i;

// ---------------------------------------------------------------------------

export type Prepared = { items: SourceItem[]; byGtin: Map<string, SourceItem[]>; products: Map<string, { title: string[]; items: SourceItem[] }> };

export function prepare(items: SourceItem[], brandWords: string[]): Prepared {
  const byGtin = new Map<string, SourceItem[]>();
  const products = new Map<string, { title: string[]; items: SourceItem[] }>();
  for (const it of items) {
    for (const g of it.gtins) {
      const l = byGtin.get(g) ?? [];
      l.push(it);
      byGtin.set(g, l);
    }
    let p = products.get(it.productKey);
    if (!p) {
      p = { title: tokens(it.product, brandWords), items: [] };
      products.set(it.productKey, p);
    }
    p.items.push(it);
  }
  return { items, byGtin, products };
}

/** Our product name without brand, flavour and pack size: [full name, primary part before "|" / " - <Bulgarian>"]. */
export function coreNames(t: Target, brandWords: string[]): string[][] {
  let n = t.name;
  for (const f of [t.flavour, t.flavour_en]) if (f && f.length > 2) n = n.split(f).join(" ");
  const full = tokens(n, brandWords);
  const primary = tokens(n.split(/\s\|\s|\s[-–]\s(?=\p{Script=Cyrillic})|\[/u)[0], brandWords);
  return primary.length && primary.join(" ") !== full.join(" ") ? [full, primary] : [full];
}

const nameScore = (cores: string[][], title: string[]) => Math.max(...cores.map((c) => tokenF1(c, title)));

export function matchTarget(t: Target, P: Prepared, brandWords: string[], minScore: number): Match {
  const cores = coreNames(t, brandWords);
  // 1. EAN / GTIN
  const g = gtinNorm(t.ean);
  if (g) {
    const hits = P.byGtin.get(g);
    if (hits?.length) {
      const it = hits.find((h) => h.images.length) ?? hits[0];
      if (!it.images.length) return { status: "review", score: 1, how: "ean", item: it, note: "EAN found but no image" };
      const ns = nameScore(cores, tokens(`${it.product} ${it.variant ?? ""}`, brandWords));
      if (ns < 0.2) return { status: "review", score: 0.9, how: "ean", item: it, note: `EAN match but names differ (${ns.toFixed(2)})` };
      const ts = grams(t.size_label) ?? grams(t.name);
      const is = grams(it.variant) ?? grams(it.product);
      if (ts && is && !sameSize(ts, is)) return { status: "review", score: 0.9, how: "ean", item: it, note: "EAN match but the official item has another pack size" };
      return { status: "matched", score: 1, how: it.familyImage ? "ean (product packshot)" : "ean", item: it };
    }
  }

  // 2. Name → product (a product whose title names a different pack size is penalised)
  if (!cores[0].length) return { status: "not-found", score: 0, how: "name", note: "no usable name tokens" };
  const tSize = grams(t.size_label) ?? grams(t.name);
  const scored = [...P.products.entries()]
    .map(([key, p]) => {
      let s = nameScore(cores, p.title);
      const ps = grams(p.items[0].product);
      if (s > 0 && tSize && ps && !sameSize(tSize, ps)) s *= 0.75;
      return { key, p, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  if (!scored.length) return { status: "not-found", score: 0, how: "name" };
  const best = scored[0];
  // Too few distinctive words in common (e.g. only "drops") is not enough to tell products apart.
  const shared = Math.max(...cores.map((c) => c.filter((w) => best.p.title.includes(w)).reduce((a, w) => a + weight(w), 0)));
  // A different product form (a shot vs a bottle, powder vs capsules) is a different packshot.
  const formOf = (ws: string[]) => new Set(ws.map((w) => FORM_CLASS[w]).filter(Boolean));
  const tf = formOf(tokens(t.name, brandWords));
  const pf = formOf(best.p.title);
  // A single-serving sachet / sample is a different packshot from the tub or bag.
  const sachet = (text: string) => /(?<![\p{L}])(sachets?|сашета|саше|samples?|probka|пробка|мостра)(?![\p{L}])/iu.test(text);
  const formClash = (tf.size > 0 && pf.size > 0 && ![...tf].some((f) => pf.has(f))) || sachet(t.name) !== sachet(best.p.items[0].product);
  const second = scored.find((x) => x.key !== best.key && x.p.items[0].images[0] !== best.p.items[0].images[0]);
  const withImg = best.p.items.filter((i) => i.images.length);
  if (!withImg.length) return { status: "not-found", score: best.s, how: "name", note: "product has no image" };

  // 3. Variant: size, then flavour
  const fl = flavourTokens(t);
  const neutral = !!t.flavour && NEUTRAL_FLAVOUR.test(t.flavour);
  // Words of our name that are not in the official product title (often an English flavour the export kept in the name).
  const titleSet = new Set(best.p.title);
  const residual = tokens(t.name, brandWords).filter((w) => !titleSet.has(w) && !/\p{Script=Cyrillic}/u.test(w));
  const cands = withImg.map((it) => {
    const vt = tokens(`${it.variant ?? ""} ${it.product}`);
    const hit = (w: string) => vt.includes(w) || vt.some((x) => x.length >= 5 && w.length >= 5 && x.slice(0, 5) === w.slice(0, 5));
    const fScore = fl.length ? fl.filter(hit).length / fl.length : residual.length ? residual.filter(hit).length / residual.length : null;
    const iSize = grams(it.variant) ?? grams(it.product);
    const sOk = tSize && iSize ? sameSize(tSize, iSize) : null;
    // Words of the official flavour that ours does not have ("White Chocolate with Raspberries" vs "Chocolate").
    const ours = new Set([...fl, ...residual]);
    const extra = fl.length
      ? tokens(it.variant ?? "").filter((w) => !titleSet.has(w) && !/^\d/.test(w) && !VARIANT_NOISE.has(w) && ![...ours].some((o) => o === w || (o.length >= 5 && w.length >= 5 && o.slice(0, 5) === w.slice(0, 5)))).length
      : 0;
    return { it, fScore, sOk, extra };
  });
  let note = "";
  let score = best.s;
  if (shared < 1.5) {
    note = "too few distinctive words in common";
    score = Math.min(score, minScore - 0.01);
  }
  if (formClash) {
    note = note || `different product form (${[...tf].join("/")} vs ${[...pf].join("/")})`;
    score *= 0.8;
  }
  const sizeHit = cands.filter((c) => c.sOk === true);
  let pool = sizeHit.length ? sizeHit : cands.filter((c) => c.sOk === null);
  if (!pool.length) {
    pool = cands;
    score *= 0.85;
    note = "size differs from every official variant";
  }
  pool.sort((a, b) => (b.fScore ?? 0) - (a.fScore ?? 0) || a.extra - b.extra);
  const pick = pool[0];
  const distinctImages = new Set(cands.map((c) => c.it.images[0])).size;
  let how = "name";
  if (distinctImages > 1) {
    // The brand shows a different picture per variant: the variant must be identified.
    if (fl.length && !neutral) {
      if ((pick.fScore ?? 0) < 0.99) {
        score *= 0.8;
        note = note || "flavour not found among the official variants";
      } else if (pick.extra > 0) {
        score *= 0.85;
        note = note || `official flavour "${pick.it.variant}" has other words than ours`;
      } else how = "name+flavour";
    } else if (residual.length && (pick.fScore ?? 0) >= 0.99 && (pool[1]?.fScore ?? 0) < 0.99) how = "name+variant words";
    else if (neutral && pool.some((c) => /unflav|natural|neutral|plain/i.test(c.it.variant ?? ""))) {
      const n = pool.find((c) => /unflav|natural|neutral|plain/i.test(c.it.variant ?? ""))!;
      return finish(n.it, "name+unflavoured");
    } else {
      note = note || "brand has a picture per variant but our product names no flavour";
      score = Math.min(score, minScore - 0.01);
    }
  } else how = pick.it.familyImage || withImg.length === 1 ? "name (product packshot)" : "name";
  if (pick.it.mixedSizes && tSize) {
    note = note || "one official picture for several pack sizes";
    score = Math.min(score, minScore - 0.01);
  }
  // A single serving (sachet / sample) of a powder: the official picture without a size usually shows the tub.
  if (tSize?.kind === "mass" && tSize.v <= 60 && !sizeHit.length && !/(bar|bars|cookie|cookies|chips|wafer|gel|gels|shot|shots|bites|crisps|барче|бар|бисквита|вафла|чипс)/i.test(`${t.name} ${best.p.items[0].product}`)) {
    note = note || "single-serving size; the official picture may show another pack";
    score = Math.min(score, minScore - 0.01);
  }
  if (second && best.s - second.s < 0.08) {
    note = note || `ambiguous with "${second.p.items[0].product}" (${second.s.toFixed(2)})`;
    score = Math.min(score, minScore - 0.01);
  }
  return finish(pick.it, how);

  function finish(item: SourceItem, h: string): Match {
    const status = score >= minScore && !note ? "matched" : score >= 0.45 ? "review" : "not-found";
    return { status, score: Math.round(score * 100) / 100, how: h, item, note: note || undefined };
  }
}

// Flavour words that show up in packshot file names ("…_STRAWBERRY_01.jpg", "Clear-Vegan-400g-Tropical-twist.png").
const FILE_FLAVOURS =
  "chocolate choco vanilla strawberry banana cookie cookies caramel toffee tropical mango lemon lemonade orange apple cherry raspberry " +
  "blueberry berry berries peach pineapple coconut hazelnut pistachio cola grape watermelon lime cinnamon coffee latte cappuccino mocha " +
  "biscuit peanut punch kiwi melon passion passionfruit pear plum apricot yogurt yoghurt cheesecake brownie tiramisu matcha rum pina " +
  "blackcurrant grapefruit mint almond salted fudge";
const FILE_FLAVOUR_SET = new Set(FILE_FLAVOURS.split(" "));

/**
 * A shared product picture whose file name names a flavour that is not ours (a "Tropical Twist" packshot for our
 * "Forest fruits"): the flavour on the label would contradict the product.
 */
export function imageFlavourConflict(t: Target, url: string): string | null {
  if (!t.flavour || NEUTRAL_FLAVOUR.test(t.flavour)) return null;
  const ours = new Set([...flavourTokens(t), ...tokens(t.name)]);
  if (!ours.size) return null;
  let file = "";
  try {
    file = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
  } catch {
    return null;
  }
  const words = file.toLowerCase().replace(/\.\w+$/, "").split(/[^a-z]+/).filter(Boolean);
  const named = words.filter((w) => FILE_FLAVOUR_SET.has(w) || [...FILE_FLAVOUR_SET].some((f) => f.length >= 5 && w.length > f.length && w.startsWith(f)));
  if (!named.length) return null;
  const match = (w: string) => [...ours].some((o) => o === w || (o.length >= 4 && w.length >= 4 && (o.startsWith(w.slice(0, 5)) || w.startsWith(o.slice(0, 5)) || w.includes(o))));
  return named.some(match) ? null : named.join(" ");
}
