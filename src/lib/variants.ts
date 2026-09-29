// Variants: pack size, servings and flavour parsed from product names, and the grouping of rows into families
// (the same product in several flavours / sizes; precision first). Ported 1:1 from the research prototype
// variants_proto.py (§3–§7). Pure — shared by the importer and the admin.
import type { ProductForm } from "./catalog-types";
import { type BrandSource, type BrandTable, brandKey, resolveBrand, stripBrandFromBase } from "./brands";
import { cleanText, ure } from "./text-match";
import { flavourKey, flavourNames } from "./flavours";

export { flavourBg, flavourEn } from "./flavours";

// ---------------------------------------------------------------------------
// Data: unit spellings and the flavour lexicon

/** Unit surface form → canonical unit. ORDER MATTERS (longer forms first). */
const UNIT_FORMS: [string, RawUnit][] = [
  ["дъвчащи\\s+гел\\s+капсули", "softgels"],
  ["софтгел\\s+капсули", "softgels"],
  ["гел\\s+капсули", "softgels"],
  ["меки\\s+капсули", "softgels"],
  ["софтгел[аи]?", "softgels"],
  ["soft\\s*gels?", "softgels"],
  ["sgels?", "softgels"],
  ["liquid\\s+caps(?:ules)?", "softgels"],
  ["(?:веган|веге|вег\\.?|растителни|раст\\.|v-|вегетариански)\\s*капсул[иа]", "caps"],
  ["(?:veg(?:etable|gie)?|vegan|v)[\\s-]*caps(?:ules)?\\.?", "caps"],
  ["vcaps\\.?", "caps"],
  ["капсул[иа]", "caps"],
  ["капс\\.?", "caps"],
  ["caps(?:ules?)?\\.?", "caps"],
  ["(?:желирани|дъвчащи)\\s+(?:бонбон[иа]|дражета|мечета|таблетки)", "gummies"],
  ["(?:подезични|сублингвални|ефервесцентни|разтворими|шумящи)\\s+таблетки", "tabs"],
  ["таблетки\\s+за\\s+смучене", "tabs"],
  ["таблетк[иа]", "tabs"],
  ["табл\\.?", "tabs"],
  ["тбл\\.?", "tabs"],
  ["табс", "tabs"],
  ["каплет[иа]", "tabs"],
  ["chew\\s*tabs\\.?", "tabs"],
  ["tablets?\\.?", "tabs"],
  ["tabs?\\.?", "tabs"],
  ["caplets?", "tabs"],
  ["tabletta", "tabs"],
  ["дражета", "tabs"],
  ["gumm(?:ies|y)", "gummies"],
  ["chews", "gummies"],
  ["бонбона", "gummies"],
  ["филтърни\\s+пакетчета", "teabags"],
  ["tea\\s*bags", "teabags"],
  ["сашета", "sachets"],
  ["саше", "sachets"],
  ["пакетчета", "sachets"],
  ["sachets?", "sachets"],
  ["sticks", "sachets"],
  ["стика", "sachets"],
  ["пакета", "sachets"],
  ["packs", "sachets"],
  ["ампули", "ampoules"],
  ["amp\\.", "ampoules"],
  ["флакона", "ampoules"],
  ["shots", "ampoules"],
  ["броя", "pcs"],
  ["брой", "pcs"],
  ["бр\\.?", "pcs"],
  ["pcs\\.?", "pcs"],
  ["bars", "pcs"],
  ["килограма", "kg"],
  ["кг\\.?", "kg"],
  ["kg\\.?", "kg"],
  ["lbs?\\.?", "lb"],
  ["грама", "g"],
  ["грам", "g"],
  ["гр\\.?", "g"],
  ["gr\\.?", "g"],
  ["g\\.?", "g"],
  ["г\\.?", "g"],
  ["литра", "l"],
  ["литър", "l"],
  ["милилитра", "ml"],
  ["мл\\.?", "ml"],
  ["ml\\.?", "ml"],
  ["fl\\.?\\s*oz", "floz"],
  ["oz\\.?", "oz"],
  ["л\\.?", "l"],
  ["l\\.?", "l"],
];

/** CORE words name a taste on their own; MODIFIERS only count next to a core word ("Double Chocolate"). */
const FLAVOUR_CORE = new Set<string>([
  "almond", "apple", "apricot", "banana", "berries", "berry", "biscuit", "blackberry", "blackcurrant", "blueberry", "brownie",
  "bubblegum", "cactus", "cake", "cappuccino", "caramel", "cheesecake", "cherry", "choco", "chocolate", "cinnamon", "citrus",
  "coconut", "coffee", "cola", "colada", "cookie", "cookies", "cranberry", "elderflower", "fruit", "fruits", "fudge", "ginger",
  "grape", "grapefruit", "guava", "hazelnut", "kiwi", "lemon", "lemonade", "lime", "lychee", "mango", "melon", "mint", "mocha",
  "mojito", "nectarine", "nougat", "orange", "papaya", "passionfruit", "peach", "peanut", "pear", "pineapple", "pistachio", "plum",
  "pomegranate", "praline", "punch", "raisin", "raspberry", "rum", "strawberry", "tangerine", "tiramisu", "toffee", "unflavored",
  "unflavoured", "vanilla", "waffle", "watermelon", "yoghurt", "yogurt", "yuzu", "ананас", "бадем", "бадеми", "банан", "бисквита",
  "бисквити", "бисквитки", "боровинка", "боровинки", "брауни", "брюле", "бъз", "ванилия", "вафла", "вафли", "вишна", "грейпфрут",
  "грозде", "гуава", "джинджифил", "диня", "дъвка", "ежевика", "ирис", "йогурт", "кайсия", "кактус", "канела", "капучино",
  "карамел", "касис", "кафе", "кекс", "кестен", "киви", "кокос", "кола", "колада", "круша", "къпина", "лайм", "лешник", "лешници",
  "лимон", "лимонада", "личи", "малина", "малини", "манго", "мандарина", "маракуя", "мента", "мока", "мокачино", "мохито",
  "мултифрут", "нар", "нектарина", "неовкусен", "неовкусена", "нуга", "папая", "плодове", "портокал", "пралина", "праскова",
  "праскови", "пунш", "пъпеш", "ром", "сладолед", "слива", "сливи", "стафиди", "тирамису", "торта", "тофи", "тропикал", "фъстък",
  "фъстъчено", "цитрус", "череша", "чийзкейк", "шамфъстък", "шоколад", "ябълка", "ягода", "ягоди",
]);

const FLAVOUR_MODIFIERS = new Set<string>([
  "belgian", "black", "blood", "blue", "butter", "cream", "crunchy", "dark", "double", "flavor", "flavour", "forest", "french",
  "fresh", "fusion", "green", "ice", "iced", "juice", "milk", "milky", "pie", "pink", "red", "roll", "salted", "shake", "smooth",
  "sour", "sweet", "swiss", "tea", "triple", "tropical", "white", "wild", "бял", "бяла", "горски", "двоен", "двойна", "див",
  "дива", "екзотични", "зелен", "зелена", "кисел", "кисела", "крем", "крема", "леден", "ледена", "масло", "млечен", "млечна",
  "мляко", "розов", "розова", "синя", "сладка", "сладък", "солен", "солена", "студен", "тропически", "тропическо", "тъмен", "чай",
  "червен", "червена", "черен",
]);

const FLAVOUR_CONNECTORS = new Set<string>(["&", "'n'", "+", "-", "and", "n", "with", "вкус", "и", "на", "с", "със"]);

const INGREDIENT_LEADS = new Set<string>(["&", "+", "and", "extract", "of", "plus", "with", "екстракт", "и", "от", "с", "със"]);

const COLOUR_WORDS = new Set<string>([
  "/", "and", "beige", "black", "blue", "brown", "camo", "clear", "coral", "dark", "gold", "gray", "green", "grey", "khaki",
  "light", "mint", "navy", "olive", "orange", "pink", "purple", "red", "rose", "silver", "transparent", "turquoise", "violet",
  "white", "yellow", "бежов", "бял", "бяла", "бяло", "жълт", "жълта", "зелен", "зелена", "и", "кафяв", "кафява", "лилав", "лилава",
  "ментово", "оранжев", "оранжева", "прозрачен", "прозрачна", "розов", "розова", "светло", "сив", "сива", "син", "синя", "тъмно",
  "тюркоаз", "червен", "червена", "черен", "черна", "черно",
]);

const FLAVOUR_NEUTRAL = new Set<string>(["natural", "neutral", "unflavored", "unflavoured", "без вкус", "натурален", "натурална", "неовкусен", "неовкусена"]);

// ---------------------------------------------------------------------------
// Pack size

/** Canonical units after conversion (kg → g, l → ml, lb/oz → g, fl oz → ml). */
export type SizeUnit = "g" | "ml" | "caps" | "softgels" | "tabs" | "gummies" | "sachets" | "ampoules" | "pcs" | "teabags";
type RawUnit = SizeUnit | "kg" | "lb" | "l" | "oz" | "floz";
export type Size = { value: number; unit: SizeUnit; mult: number; fromLb?: boolean; approx?: boolean };

const COUNT_UNITS = new Set<SizeUnit>(["caps", "softgels", "tabs", "gummies", "sachets", "ampoules", "pcs", "teabags"]);

// number: "908", "2.27", "1,5", "10 x 12", "20×25", "1624~1876", "300-315", "10,000" (thousands)
const NUM = "(?:\\d+\\s*[xх×XХ]\\s*)?\\d+(?:[.,]\\d+)?(?:\\s*[~-]\\s*\\d+(?:[.,]\\d+)?)?";
const UNIT_ALT = UNIT_FORMS.map(([f]) => `(?:${f})`).join("|");
const UNIT_RES: [RegExp, RawUnit][] = UNIT_FORMS.map(([f, u]) => [ure(`^(?:${f})$`, "iu"), u]);
// Pack size token: NUMBER + UNIT, not glued to letters/"-" on either side ("B12", "Omega-3 Gummies", "80 L-Carnitine"
// don't match) and not the decimal part of a number ("2.5 kg" is read whole).
const SIZE_TOKEN_SRC = `(?<![\\w,\\-])(?<!\\d\\.)(?P<num>${NUM})\\s*(?P<unit>${UNIT_ALT})(?![\\w\\-])`;
const SIZE_TOKEN_RE = ure(SIZE_TOKEN_SRC, "iu");
const SIZE_TOKEN_ALL = ure(SIZE_TOKEN_SRC, "giu");
const SIZE_TOKEN_START = ure(`^(?:${SIZE_TOKEN_SRC})`, "iu");
const SIZE_TOKEN_FULL = ure(`^(?:${SIZE_TOKEN_SRC})$`, "iu");
const SERV_RE = ure("(?P<n>\\d+)\\s*(?:доз[аи]|serv(?:ings?|\\.)|порци[яи])(?![\\w])", "iu");
const DOZI_RE = ure(
  `^(?P<pre>.*?)(?:(?P<num>${NUM})\\s*(?P<unit>${UNIT_ALT})(?:\\s*/плик/)?\\s*,?\\s*)?(?P<serv>\\d+)\\s*(?:доз[аи])(?![\\w])\\s*\\)?\\s*(?P<tail>.*)$`,
  "iu",
);
// Kaufland feed: a trailing " / 0.908g." is the NET WEIGHT IN KG (sic).
const KG_SEG_RE = ure("^(?P<kg>\\d+(?:[.,]\\d+)?)\\s*g\\.$", "u");
// Bracket feed: "… [908 грама, 30 Дози] Flavour".
const BRACKET_RE = ure("\\[(?P<inner>[^\\]]*\\d[^\\]]*)\\]\\s*(?:-\\s*)?(?P<tail>.*)$", "iu");
// Count only: "х60", "x 90", "Х 30 NF" — the unit comes from a form word elsewhere in the name.
const COUNT_ONLY_RE = ure("(?:(?<=\\s)|^)[xхXХ×]\\s?(?P<n>\\d{1,4})(?:\\s*(?:бр\\.?|броя))?(?=\\s|$|[,.)])", "u");
const PAREN_SIZE_RE = ure(`\\((?P<num>${NUM})\\s*(?P<unit>${UNIT_ALT})\\)\\s*(?:-\\s*(?P<tail>[^()]+))?$`, "iu");
const PACK_TYPE_RE =
  /^(?:bag|sachet|box|doypack|glass ampoule|ampoule|blister|can|tube|jar|refill|pouch|pack|bottle|плик|кутия|туба|пакет|кенче|бутилка|new look|new formula|new)$/iu;
const APPAREL_SIZE_RE = ure("(?:\\s|-|/)(?P<sz>XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL|S/M|L/XL|S-M|L-XL)$", "u");
const FLAVOUR_INTRO_RE = ure(
  "(?:,\\s*)?\\(?\\s*(?:с\\s+вкус\\s+(?:и\\s+аромат\\s+)?на|с\\s+аромат\\s+на|вкус[:\\s]+|flavou?r[:\\s]+)\\s*(?P<f>[^,()|/\\[\\]]+?)\\s*\\)?(?=$|[,|/\\[(]|\\s-\\s|\\s\\d)",
  "iu",
);
const SEP_SPLIT_RE = /(\s-\s|\s\|\s|\s\/\s)/u;
const TRAILING_SEGMENT_RE = ure("\\s[-|/]\\s(?P<c>[^-|/]+)$", "u");
const DOSE_UNIT_RE = ure("\\b(?:mg|mcg|iu|мг|мкг)\\b", "iu");

function canonUnit(u: string): RawUnit | null {
  const t = u.trim();
  for (const [rx, cu] of UNIT_RES) if (rx.test(t)) return cu;
  return null;
}

/** "2.27" → 2.27, "1,5" → 1.5, "10,000" → 10000, "10 x 12" → [10, 12], "1624~1876" → 1876 (upper bound). */
function parseNumber(num: string): number | [number, number] {
  num = num.replace(/ /g, "");
  let m = /^(\d+)[xх×XХ](.+)$/u.exec(num);
  if (m) {
    const inner = parseNumber(m[2]);
    return [parseInt(m[1], 10), Array.isArray(inner) ? inner[1] : inner];
  }
  m = /^(.+?)[~-](.+)$/u.exec(num);
  if (m) return parseNumber(m[2]);
  if (/^\d+,\d{3}$/.test(num)) return Number(num.replace(",", ""));
  const v = Number(num.replace(",", "."));
  if (!Number.isFinite(v)) throw new Error(`bad number ${num}`);
  return v;
}

function makeSize(num: string, unitRaw: string | undefined, kaufland = false): Size | null {
  let u = unitRaw ? canonUnit(unitRaw) : null;
  let parsed = parseNumber(num);
  let mult = 1;
  if (Array.isArray(parsed)) [mult, parsed] = parsed;
  let v = parsed;
  let fromLb = false;
  if (u === "kg") [u, v] = ["g", v * 1000];
  else if (u === "lb") [u, v, fromLb] = ["g", Math.round(v * 453.6), true];
  else if (u === "l") [u, v] = ["ml", v * 1000];
  else if (u === "oz") [u, v] = ["g", Math.round(v * 28.35)];
  else if (u === "floz") [u, v] = ["ml", Math.round(v * 29.57)];
  // "/ 0.500 ml." in the Kaufland feed = 0.5 l
  if (kaufland && (u === "g" || u === "ml") && v < 10 && v !== Math.trunc(v)) v *= 1000;
  v = Math.round(v * 1000) / 1000;
  if (!u) return null;
  const out: Size = { value: v, unit: u, mult };
  if (fromLb) out.fromLb = true;
  return out;
}

/** Rejects product-name numbers that look like sizes ("L-Carnitine 3000 Caps", "Creatine 3000 Caps"). */
function plausibleSize(sz: Size | null): sz is Size {
  if (!sz) return false;
  const total = sz.value * (sz.mult || 1);
  if (COUNT_UNITS.has(sz.unit)) return sz.value >= 1 && sz.value <= 1500 && total <= 3000;
  if (sz.unit === "g") return total >= 1 && total <= 25000;
  if (sz.unit === "ml") return total >= 1 && total <= 10000;
  return false;
}

type Groups = Record<string, string | undefined>;

function trySize(g: Groups | undefined, kaufland = false): Size | null {
  if (!g?.num) return null;
  try {
    const sz = makeSize(g.num, g.unit, kaufland);
    return plausibleSize(sz) ? sz : null;
  } catch {
    return null;
  }
}

const UNIT_NAMES: Record<"bg" | "en", Record<SizeUnit, string>> = {
  bg: { g: "г", ml: "мл", caps: "капсули", softgels: "софтгел капсули", tabs: "таблетки", gummies: "желирани бонбона", sachets: "сашета",
    ampoules: "ампули", pcs: "бр.", teabags: "филтърни пакетчета" },
  en: { g: "g", ml: "ml", caps: "capsules", softgels: "softgels", tabs: "tablets", gummies: "gummies", sachets: "sachets", ampoules: "ampoules",
    pcs: "pcs", teabags: "tea bags" },
};

/** Python "%g": up to 6 significant digits, no trailing zeros. */
const g6 = (v: number) => String(Number(v.toPrecision(6)));

/** {value: 908, unit: "g"} → "908 г"; 2270 g → "2,27 кг"; 20 × 30 g → "20 x 30 г". */
export function sizeLabel(sz: Pick<Size, "value" | "unit" | "mult"> | null, lang: "bg" | "en" = "bg"): string {
  if (!sz) return "";
  const { value: v, unit: u, mult: m } = sz;
  const dec = lang === "bg" ? "," : ".";
  let s: string;
  if ((u === "g" || u === "ml") && v >= 1000 && m === 1) {
    const big = u === "g" ? (lang === "bg" ? "кг" : "kg") : lang === "bg" ? "л" : "l";
    s = `${g6(v / 1000).replace(".", dec)} ${big}`;
  } else {
    s = `${g6(v).replace(".", dec)} ${UNIT_NAMES[lang][u] ?? u}`;
  }
  return m > 1 ? `${m} x ${s}` : s;
}

const SIZE_WORDS_EN: [RegExp, string][] = [
  [/софтгел капсули/g, "softgels"], [/желирани бонбона/g, "gummies"], [/филтърни пакетчета/g, "tea bags"], [/капсули/g, "capsules"],
  [/таблетки/g, "tablets"], [/сашета/g, "sachets"], [/ампули/g, "ampoules"], [/бр\./g, "pcs"], [/(\d) кг(?!\p{L})/gu, "$1 kg"],
  [/(\d) мл(?!\p{L})/gu, "$1 ml"], [/(\d) г(?!\p{L})/gu, "$1 g"], [/(\d) л(?!\p{L})/gu, "$1 l"],
];

/** English form of a stored (Bulgarian) size label: "2,27 кг" → "2.27 kg", "90 капсули" → "90 capsules". */
export function sizeLabelEn(bg: string): string {
  let s = bg.replace(/(\d),(\d)/g, "$1.$2");
  for (const [rx, en] of SIZE_WORDS_EN) s = s.replace(rx, en);
  return s;
}

/** A pack size typed by the admin ("1 кг", "90 капсули", "20 x 30 г"), or null. */
export function parseSizeText(text: string): Size | null {
  const m = SIZE_TOKEN_RE.exec(cleanText(text));
  return m ? trySize(m.groups) : null;
}

/** Grams / ml / count, for ordering the size selector. */
export function sizeSortKey(sz: Pick<Size, "value" | "mult"> | null): number {
  return sz ? sz.value * (sz.mult || 1) : 0;
}

function stripSeps(s: string): string {
  return s.replace(/^[\s,;:|/\-(]+|[\s,;:|/\-(\[]+$/gu, "").trim();
}

/** Free text in a flavour SLOT: short, no pack sizes / servings / doses, not a sentence. */
function looksLikeFlavourText(t: string): boolean {
  t = t.trim();
  if (!t || t.length > 48 || SIZE_TOKEN_RE.test(t) || SERV_RE.test(t)) return false;
  if (/\d{3,}/.test(t) || t.split(/\s+/).length > 6) return false;
  if (DOSE_UNIT_RE.test(t)) return false;
  return true;
}

const FORM_WORDS: [SizeUnit, RegExp][] = [
  ["softgels", ure("софтгел|гел капсул|softgel|sgels|меки капсули")],
  ["caps", ure("капсул|капс\\b|caps\\b|capsule|vcaps")],
  ["tabs", ure("таблет|табл\\b|тбл\\b|tablet|tabs\\b|каплет|дражета|caplet")],
  ["gummies", ure("желирани|gumm|бонбон|мечета|chew")],
  ["sachets", ure("сашет|саше\\b|sachet|стик")],
  ["ampoules", ure("ампул|amp\\.|shot\\b|шот\\b")],
];

function detectFormWords(s: string): SizeUnit | null {
  const low = s.toLowerCase();
  for (const [form, rx] of FORM_WORDS) if (rx.test(low)) return form;
  return null;
}

// ---------------------------------------------------------------------------
// Name → base / size / servings / flavour / pack / colour / apparel size

export type ParsedName = {
  base: string;
  size: Size | null;
  servings: number | null;
  flavour: string | null;
  pack: string | null;
  colour: string | null;
  apparel: string | null;
  style: "plain" | "slash" | "bracket" | "dozi" | "comma" | "sep" | "paren" | "inline" | "count";
  netKg: number | null;
};

/** Replace every match of a global regex, with access to its named groups. */
function replaceMatches(s: string, rx: RegExp, fn: (m: RegExpMatchArray) => string): string {
  let out = "";
  let last = 0;
  for (const m of s.matchAll(rx)) {
    out += s.slice(last, m.index) + fn(m);
    last = (m.index ?? 0) + m[0].length;
  }
  return out + s.slice(last);
}

export function parseName(name: string): ParsedName {
  let s = cleanText(name).replace(/[®™©]/g, "");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/\s\|\s*$/u, ""); // "KFD Premium WPC - … | 0.700kg |"
  s = s.replace(/(?<=\s)([xхXХ])(?=\d)/gu, "$1 "); // "х30капсули" → "х 30капсули"
  const out: ParsedName = { base: s, size: null, servings: null, flavour: null, pack: null, colour: null, apparel: null, style: "plain", netKg: null };
  let work = s;

  // ---- A. Kaufland slash feed:  NAME / [size] / [pack] / [Flavour] / 0.908g.
  if (work.includes(" / ")) {
    const segs = work.split(" / ").map((x) => x.trim());
    let poppedKg = false;
    let poppedSize = false;
    const mk = KG_SEG_RE.exec(segs[segs.length - 1]);
    if (mk && segs.length > 1) {
      out.netKg = Number(mk.groups!.kg.replace(",", "."));
      segs.pop();
      poppedKg = true;
    }
    let changed = true;
    while (changed && segs.length > 1) {
      changed = false;
      const last = segs[segs.length - 1];
      const ms = SIZE_TOKEN_FULL.exec(last.trim());
      const sz = ms ? trySize(ms.groups, true) : null;
      if (sz && !out.size) {
        out.size = sz;
        segs.pop();
        poppedSize = changed = true;
        continue;
      }
      if (PACK_TYPE_RE.test(last)) {
        out.pack = last;
        segs.pop();
        changed = true;
        continue;
      }
      const prevIsSize = segs.length >= 3 && SIZE_TOKEN_FULL.test(segs[segs.length - 2].trim());
      if (!out.flavour && (poppedKg || poppedSize || prevIsSize) && looksLikeFlavourText(last)) {
        out.flavour = last;
        segs.pop();
        changed = true;
        continue;
      }
    }
    if (poppedKg || poppedSize || out.flavour) {
      out.style = "slash";
      work = segs.join(" / ");
      if (!out.size && out.netKg) {
        // "HYDRO 1000g. / …"
        const ms = [...work.matchAll(SIZE_TOKEN_ALL)].filter((x) => trySize(x.groups, true));
        if (ms.length) {
          const last = ms[ms.length - 1];
          out.size = trySize(last.groups, true);
          work = (work.slice(0, last.index) + work.slice((last.index ?? 0) + last[0].length)).trim();
        } else {
          out.size = { value: Math.round(out.netKg * 1000), unit: "g", mult: 1, approx: true };
        }
      }
      // "Platinum Hydro Whey 3.5 lbs. / … / 1.6g." → trust the metric net weight over the lb conversion
      if (out.size?.fromLb && out.netKg) out.size = { value: Math.round(out.netKg * 1000), unit: "g", mult: 1 };
    }
  }

  // ---- B. bracket feed:  NAME [908 грама, 30 Дози] Flavour
  let m = BRACKET_RE.exec(work);
  if (m) {
    const inner = m.groups!.inner;
    const tail = (m.groups!.tail ?? "").trim();
    const ms = [...inner.matchAll(SIZE_TOKEN_ALL)].filter((x) => trySize(x.groups));
    if (ms.length && !out.size) out.size = trySize(ms[0].groups);
    const mv = SERV_RE.exec(inner);
    if (mv) out.servings = parseInt(mv.groups!.n, 10);
    if (tail && looksLikeFlavourText(tail) && !out.flavour) out.flavour = tail;
    work = work.slice(0, m.index).trim();
    out.style = "bracket";
  }

  // ---- C. servings anchor: "… 908 грама, 30 Дози Flavour" / "(66 дози) 2000 g"
  if (out.servings === null) {
    m = DOZI_RE.exec(work);
    if (m) {
      const g = m.groups!;
      if (g.num && !out.size) out.size = trySize(g);
      out.servings = parseInt(g.serv!, 10);
      let tail = stripSeps(g.tail ?? "");
      if (tail && looksLikeFlavourText(tail) && !out.flavour) {
        out.flavour = tail;
        tail = "";
      }
      const pre = (g.pre ?? "").replace(/[(\s,]+$/u, "");
      work = (pre + (tail ? ` ${tail}` : "")).trim();
      if (out.style === "plain") out.style = "dozi";
    } else {
      const mv = SERV_RE.exec(work);
      if (mv) {
        out.servings = parseInt(mv.groups!.n!, 10);
        work = (work.slice(0, mv.index) + work.slice(mv.index + mv[0].length)).replace(/\(\s*\)/gu, "");
        work = work.replace(/\s+/g, " ").trim();
      }
    }
  }

  // ---- C2. comma feed: "Game Changer Mass, ванилия, 3000 g, Dorian Yates Nutrition",
  //          "Isodrinx, пудра, 1000 g, грейпфрут, Nutrend", "Mass, triple chocolate, 6.8 kg, Mutant"
  if (!out.size && work.split(", ").length - 1 >= 2) {
    const segs = work.split(", ");
    const idx = segs
      .map((x, i) => i)
      .filter((i) => {
        if (i === 0) return false;
        const f = SIZE_TOKEN_FULL.exec(segs[i].trim());
        return !!f && !!trySize(f.groups);
      });
    if (idx.length) {
      const i = idx[idx.length - 1];
      out.size = trySize(SIZE_TOKEN_FULL.exec(segs[i].trim())!.groups);
      const lastSeg = segs[segs.length - 1];
      const brandTail =
        i < segs.length - 1 &&
        isUpperChar(lastSeg.slice(0, 1)) &&
        lastSeg.split(/\s+/).length <= 4 &&
        !/\d/.test(lastSeg) &&
        /[A-Za-z]/.test(segs[0]);
      let flavI: number | null = null;
      let fallback: number | null = null;
      for (const j of [i - 1, i + 1]) {
        if (j > 0 && j < segs.length && (j !== segs.length - 1 || !brandTail)) {
          const x = segs[j].trim();
          if (isLowerChar(x.slice(0, 1)) && looksLikeFlavourText(x) && !/\d/.test(x)) {
            if (x.split(/\s+/).some((w) => flavourWordKind(w) === "core")) {
              flavI = j;
              break;
            }
            if (brandTail && j === i - 1) fallback = j;
          }
        }
      }
      if (flavI === null) flavI = fallback;
      if (flavI !== null) out.flavour = segs[flavI].trim();
      work = segs.filter((_, k) => k !== i && k !== flavI).join(", ");
      if (out.style === "plain") out.style = "comma";
    }
  }

  // ---- D. separator segments: "BRAND - Name - 300 g", "Name - BG - 400g - Шоколад", "Name | 90 caps", "Name | 390g Лимон"
  if (!out.size) {
    const parts = work.split(SEP_SPLIT_RE);
    const segs = parts.filter((_, k) => k % 2 === 0);
    const seps = parts.filter((_, k) => k % 2 === 1);
    for (let i = segs.length - 1; i > 0; i--) {
      const seg = segs[i].trim();
      const ms = SIZE_TOKEN_START.exec(seg);
      if (!ms || !trySize(ms.groups)) continue;
      const rest = seg.slice(ms[0].length).trim();
      const after = segs
        .slice(i + 1)
        .map((x) => x.trim())
        .filter(Boolean)
        .join(" - ");
      const flav = rest || after;
      if (rest && !looksLikeFlavourText(rest)) continue;
      out.size = trySize(ms.groups);
      let keepAfter = "";
      if (flav && looksLikeFlavourText(flav) && !out.flavour) out.flavour = flav;
      else if (after) keepAfter = ` - ${after}`;
      let head = "";
      for (let j = 0; j < i; j++) head += segs[j] + (j < i - 1 ? seps[j] : "");
      work = stripSeps(head) + keepAfter;
      if (out.style === "plain") out.style = "sep";
      break;
    }
  }

  // ---- E. paren size: "(120 капс)", "(908 гр) - Ягода", "(20×25 мл)"
  if (!out.size) {
    m = PAREN_SIZE_RE.exec(work);
    if (m && trySize(m.groups)) {
      out.size = trySize(m.groups);
      const tail = (m.groups!.tail ?? "").trim();
      if (tail && looksLikeFlavourText(tail) && !out.flavour) out.flavour = tail;
      work = work.slice(0, m.index).trim();
      if (out.style === "plain") out.style = "paren";
    }
  }

  // ---- F. last free-standing size token (pharmacy style ", 400 mg х 60 капсули Natural Factors")
  if (!out.size) {
    const ms = [...work.matchAll(SIZE_TOKEN_ALL)].filter((x) => trySize(x.groups));
    if (ms.length) {
      const mm = ms[ms.length - 1];
      out.size = trySize(mm.groups);
      const pre = work.slice(0, mm.index).replace(/[,\s]*[xхXХ×]\s*$/u, "");
      const post = work.slice((mm.index ?? 0) + mm[0].length).trim();
      work = (pre.trim() + (post ? ` ${post}` : "")).trim();
      if (out.style === "plain") out.style = "inline";
    }
  }
  if (!out.size) {
    const mc = COUNT_ONLY_RE.exec(work);
    const n = mc ? parseInt(mc.groups!.n, 10) : 0;
    if (mc && n >= 1 && n <= 1500) {
      out.size = { value: n, unit: detectFormWords(s) ?? "pcs", mult: 1 };
      work = (work.slice(0, mc.index) + " " + work.slice(mc.index + mc[0].length)).trim();
      if (out.style === "plain") out.style = "count";
    }
  }

  // Remove any other pack-size tokens left in the base ("Nutrend Flexit Liquid 500 ml 500 мл, 33 Дози").
  work = replaceMatches(work, SIZE_TOKEN_ALL, (mm) => (out.size && trySize(mm.groups) ? "" : mm[0]));
  work = work.replace(/\(\s*\)|\[\s*\]/gu, "");

  // ---- G. explicit flavour phrase: "с вкус на шоколад", "(с вкус на Шоколад)"
  if (!out.flavour) {
    const mf = FLAVOUR_INTRO_RE.exec(work);
    if (mf && looksLikeFlavourText(mf.groups!.f!)) {
      out.flavour = mf.groups!.f!.trim();
      work = (work.slice(0, mf.index) + " " + work.slice(mf.index + mf[0].length)).trim();
    }
  }

  // ---- H. accessories: trailing colour segment / apparel size
  const mcol = TRAILING_SEGMENT_RE.exec(work);
  if (mcol && mcol.groups!.c.toLowerCase().replace(/-/g, " ").split(/\s+/).filter(Boolean).every((w) => COLOUR_WORDS.has(w))) {
    out.colour = mcol.groups!.c.trim();
    work = work.slice(0, mcol.index).trim();
  }
  const ma = APPAREL_SIZE_RE.exec(work);
  if (ma && work.split(/\s+/).length >= 3) {
    out.apparel = ma.groups!.sz;
    work = work.slice(0, ma.index).trim();
  }

  out.base = stripSeps(work).replace(/\s+/g, " ");
  return out;
}

const isUpperChar = (c: string) => !!c && c !== c.toLowerCase() && c === c.toUpperCase();
const isLowerChar = (c: string) => !!c && c !== c.toUpperCase() && c === c.toLowerCase();

// ---------------------------------------------------------------------------
// Flavour lexicon (BG + EN): validates a trailing flavour when the name has no flavour slot, and translates the
// most common English flavours to Bulgarian (the Kaufland feed is English, the storefront is BG-first).

// A stem hit counts too: "кокосови" → "кокос", "ягодова" → "ягод", "черешов" → "череш".
const FLAVOUR_STEMS = [...new Set([...FLAVOUR_CORE].filter((w) => w.length >= 4).map((w) => ("аяиеоуъ".includes(w[w.length - 1]) && w.length > 5 ? w.slice(0, -1) : w)))].sort(
  (a, b) => b.length - a.length,
);

export function flavourWordKind(t: string): "core" | "mod" | null {
  t = t.toLowerCase().replace(/^[,.()"']+|[,.()"']+$/g, "");
  if (FLAVOUR_CORE.has(t)) return "core";
  if (FLAVOUR_MODIFIERS.has(t)) return "mod";
  if (/^[а-я]{5,}$/u.test(t) && FLAVOUR_STEMS.some((st) => st.length >= 4 && t.startsWith(st))) return "core";
  return null;
}

/**
 * "OstroVit Collagen + Vitamin C Праскова" → ["OstroVit Collagen + Vitamin C", "Праскова"]. Strips a run of flavour
 * words at the very end when it contains a CORE word, >= minLeft tokens remain, and it is not an ingredient list
 * ("… with Guarana and Green Tea", "… с екстракт от мента").
 */
export function splitTrailingFlavour(base: string, minLeft = 2): [string, string | null] {
  const toks = base.split(/\s+/).filter(Boolean);
  let i = toks.length;
  let nCore = 0;
  let nAny = 0;
  while (i > 0) {
    const kind = flavourWordKind(toks[i - 1]);
    if (kind) {
      nAny++;
      if (kind === "core") nCore++;
      i--;
    } else if (FLAVOUR_CONNECTORS.has(toks[i - 1].toLowerCase()) && nAny && i - 1 > 0 && flavourWordKind(toks[i - 2])) {
      i--;
    } else break;
  }
  if (nCore === 0 || i < minLeft) return [base, null];
  if (INGREDIENT_LEADS.has(toks[i - 1].toLowerCase().replace(/^[,.]+|[,.]+$/g, ""))) return [base, null];
  const flav = toks.slice(i).join(" ").replace(/^[ \-,]+|[ \-,]+$/g, "");
  if (flav.length > 40) return [base, null];
  return [toks.slice(0, i).join(" ").replace(/[ \-,|/]+$/, ""), flav];
}

/** "KFD Regular+ WPC 80 - Суроватъчен Протеин - Кокосови бисквитки" → [..., "Кокосови бисквитки"]. */
export function trailingSegmentFlavour(base: string): [string, string | null] {
  const parts = base.split(/\s[-|]\s/u);
  if (parts.length < 3) return [base, null]; // needs Name - Descriptor - Flavour
  const last = parts[parts.length - 1].trim();
  const words = last.split(/\s+/).filter((w) => w && !FLAVOUR_CONNECTORS.has(w.toLowerCase()));
  if (!words.length || words.length > 5 || !looksLikeFlavourText(last)) return [base, null];
  const kinds = words.map(flavourWordKind);
  if (kinds.includes("core") && kinds.filter(Boolean).length * 2 >= words.length) {
    return [base.slice(0, base.trimEnd().lastIndexOf(last)).replace(/[ \-|]+$/, ""), last];
  }
  return [base, null];
}

export function isNeutralFlavour(f: string | null): boolean {
  return !!f && FLAVOUR_NEUTRAL.has(f.toLowerCase().trim());
}

// ---------------------------------------------------------------------------
// Family key (grouping)

const UNIT_NORMALISE: [RegExp, string][] = [
  [ure("\\bмкг\\b|µg|μg|\\bmcg\\b", "gu"), "mcg"],
  [ure("\\bмг\\b|\\bmg\\b", "gu"), "mg"],
  [ure("\\bме\\b|\\biu\\b|\\bие\\b", "gu"), "iu"],
  [ure("\\bгр\\.?(?=\\s|$)", "gu"), "g"],
  [ure("(\\d)\\s+(mg|mcg|iu)\\b", "gu"), "$1$2"],
];
const BASE_NOISE: RegExp[] = [
  ure("\\bnew\\s+(?:look|formula|improved)\\b", "gu"),
  ure("\\bново?\\b", "gu"),
  /\(new\)/gu,
  ure("\\bnew\\b", "gu"),
  /®|™/gu,
];

export function normBase(base: string): string {
  let s = cleanText(base).toLowerCase();
  s = s.replace(/&/g, " and ").replace(/ё/g, "е");
  for (const [rx, rep] of UNIT_NORMALISE) s = s.replace(rx, rep);
  for (const rx of BASE_NOISE) s = s.replace(rx, " ");
  s = s.replace(/[^\p{L}\p{N}_%+.]+/gu, " "); // keep letters/digits, % + and decimal points
  s = s.replace(/(?<!\d)\.|\.(?!\d)/gu, " ");
  return s.replace(/\s+/g, " ").trim();
}

/** "Whey Protein - Суроватъчен Протеин" → "Whey Protein" (only when a Latin part remains). */
function dropBgDescriptor(base: string): string {
  const parts = base.split(/\s[-|]\s/u);
  if (parts.length < 2) return base;
  const keep = parts.filter((p) => !(/[а-яА-Я]/u.test(p) && !/[a-zA-Z]/.test(p)));
  return keep.length && keep.some((p) => /[a-zA-Z]{3}/.test(p)) ? keep.join(" - ") : base;
}

/** "<brand key>::<normalised base without brand>", or null when the brand is unknown or the base too short. */
export function familyKey(brandKey: string | null, baseNoBrand: string): string | null {
  const nb = normBase(dropBgDescriptor(baseNoBrand));
  if (!brandKey || nb.replace(/[^a-zа-я]/gu, "").length < 3) return null;
  return `${brandKey}::${nb}`;
}

// ---------------------------------------------------------------------------
// Listing-filter attributes: form and diet tags

// [form, regex, liquid when the pack size is in ml]
const FORM_RULES: [ProductForm, RegExp, boolean?][] = [
  ["gummies", ure("желирани|gummies|gummy|мечета|дъвчащи бонбон")],
  ["softgels", ure("софтгел|гел капсул|softgel|sgels|меки капсули|liquid caps")],
  ["capsules", ure("капсул|\\bкапс\\b|\\bcaps\\b|capsules?|vcaps")],
  ["tablets", ure("таблет|\\bтабл\\b|\\bтбл\\b|tablet|\\btabs\\b|каплет|caplet|дражета|chewtabs")],
  ["bar", ure("\\bбар\\b|барче|\\bbar\\b|bars\\b|вафла|wafer|бисквит|cookie|флапджак|flapjack")],
  [
    "liquid",
    ure("течн|сироп|капки|\\bdrops?\\b|liquid|шот\\b|shot\\b|ампул|напитка|drink|\\bml\\b|\\bмл\\b|спрей|spray|тинктура|масло\\b|\\boil\\b"),
  ],
  [
    "powder",
    ure(
      "\\bпрах\\b|на прах|powder|protein|протеин|гейнър|gainer|креатин|creatine|bcaa|eaa|pre-?workout|\\bwhey\\b|казеин|casein|isolate|изолат|\\bграма\\b|\\bkg\\b|\\bкг\\b",
    ),
    true,
  ],
  ["powder", ure("сашет|саше\\b|sachet|стик|sticks")], // "Сашета" in the prototype
  ["drink", ure("\\bчай\\b|\\btea\\b|филтърни")], // "Чай"
  ["other", ure("\\bкрем\\b|\\bгел\\b|мехлем|лосион|cream|\\bgel\\b|balm")], // "Крем / гел"
];

/** Physical form from the parsed pack size, then from words in the name. */
export function detectForm(name: string, size: Size | null): ProductForm | null {
  const low = cleanText(name).toLowerCase();
  if (size) {
    const byUnit: Partial<Record<SizeUnit, ProductForm>> = {
      softgels: "softgels", caps: "capsules", tabs: "tablets", gummies: "gummies", sachets: "powder", teabags: "drink", ampoules: "liquid",
    };
    const f = byUnit[size.unit];
    if (f) return f;
  }
  for (const [form, rx, liquidIfMl] of FORM_RULES) {
    if (rx.test(low)) return liquidIfMl && size?.unit === "ml" ? "liquid" : form;
  }
  if (size?.unit === "ml") return "liquid";
  if (size?.unit === "g" && size.value >= 150) return "powder";
  return null;
}

// ---------------------------------------------------------------------------
// Families: SAFE grouping rule (precision first)

export type VariantRec = {
  sku: string;
  brandKey: string | null;
  fkey: string | null;
  size: Size | null;
  flavour: string | null;
  colour: string | null;
  apparel: string | null;
  pack: string | null;
  inStock: boolean;
};

export type Family<T extends VariantRec> = { key: string; members: T[]; duplicates: T[]; dupOf?: string };

const UNIT_CLASS: Record<SizeUnit, string> = {
  g: "mass", ml: "mass", caps: "caps", softgels: "caps", tabs: "tabs", gummies: "gummies", sachets: "pack", ampoules: "pack", pcs: "pack",
  teabags: "pack",
};

function unitClass(r: VariantRec): string | null {
  return r.size ? (UNIT_CLASS[r.size.unit] ?? "other") : null;
}

/** "шоколад | 908 г" — what tells the members of a family apart (flavour + size + colour + apparel size + pack). */
export function variantKeyLabel(r: VariantRec): string {
  const fl = flavourNames(r.flavour);
  return [fl ? flavourKey(fl) : "", r.size ? sizeLabel(r.size) : "", r.colour ?? "", r.apparel ?? "", r.pack ?? ""]
    .filter(Boolean)
    .map((p) => p.toLowerCase())
    .join(" | ");
}

/**
 * 1. brand resolved AND normalised base >= 3 letters, else the row stays a singleton;
 * 2. a family never mixes size classes (g/ml | capsules+softgels | tablets | gummies | sachets/pieces): rows without a
 *    size join the largest class;
 * 3. rows with the same variant label (the same product from another supplier feed) stay in the family and share one
 *    selector chip (in-stock rows first); rows with an empty label cannot be told apart and stay separate products.
 */
export function buildFamilies<T extends VariantRec>(recs: T[]): Family<T>[] {
  const fam = new Map<string, T[]>();
  const singles: T[] = [];
  for (const r of recs) {
    if (r.fkey) fam.set(r.fkey, [...(fam.get(r.fkey) ?? []), r]);
    else singles.push(r);
  }
  const families: Family<T>[] = [];
  for (const [k, members] of fam) {
    const byCls = new Map<string | null, T[]>();
    for (const m of members) {
      const c = unitClass(m);
      byCls.set(c, [...(byCls.get(c) ?? []), m]);
    }
    const sized = new Map([...byCls].filter(([c]) => c !== null)) as Map<string, T[]>;
    if (sized.size && byCls.has(null)) {
      let biggest: string | null = null;
      for (const [c, v] of sized) if (biggest === null || v.length > sized.get(biggest)!.length) biggest = c;
      sized.set(biggest!, [...sized.get(biggest!)!, ...byCls.get(null)!]);
    }
    const groups = sized.size ? [...sized.values()] : [members];
    for (const grp of groups) {
      const gk = groups.length === 1 ? k : `${k}@${unitClass(grp[0]) ?? "none"}`;
      grp.sort((a, b) => Number(!a.inStock) - Number(!b.inStock) || (a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0));
      const seen = new Set<string>();
      const kept: T[] = [];
      const extra: T[] = [];
      for (const m of grp) {
        const lab = variantKeyLabel(m);
        if (lab && !seen.has(lab)) {
          seen.add(lab);
          kept.push(m);
        } else extra.push(m);
      }
      if (kept.length >= 2) {
        const same = extra.filter((x) => variantKeyLabel(x));
        families.push({ key: gk, members: [...kept, ...same], duplicates: same });
        for (const x of extra) if (!variantKeyLabel(x)) families.push({ key: `${gk}#dup#${x.sku}`, members: [x], duplicates: [], dupOf: gk });
      } else {
        for (const m of grp) families.push({ key: grp.length === 1 ? gk : `${gk}#${m.sku}`, members: [m], duplicates: [] });
      }
    }
  }
  for (const m of singles) families.push({ key: `single#${m.sku}`, members: [m], duplicates: [] });
  return families;
}

// ---------------------------------------------------------------------------
// Pipeline: brand + name parsing + the sibling rule for lexicon flavours

export type VariantInput = { sku: string; name: string; brandRaw: string; inStock: boolean };

export type VariantInfo = VariantRec & {
  brandSource: BrandSource;
  /** Name without brand, size, servings and flavour. */
  base: string;
  servings: number | null;
  style: ParsedName["style"];
  flavourSource: "slot" | "lexicon" | null;
};

/**
 * Brand, pack size, servings, flavour and family key of every row. A flavour recognised only from the lexicon
 * (a trailing "… Праскова" without a flavour slot) is accepted when it changes the family key AND the stripped key
 * is shared with another row (a sibling that has that base natively, or another lexicon row with a different flavour).
 */
export function analyseVariants<T extends VariantInput>(rows: T[], table: BrandTable, known: Map<string, string>): (T & VariantInfo)[] {
  type Rec = T & VariantInfo & { cand: [string, string] | null };
  const recs: Rec[] = rows.map((r) => {
    const { key, source } = resolveBrand(r.brandRaw, r.name, known, table);
    const p = parseName(r.name);
    const baseNb = key ? stripBrandFromBase(p.base, key) : p.base;
    let cand: [string, string] | null = null;
    if (!p.flavour) {
      let [b2, fl] = trailingSegmentFlavour(baseNb); // "… - Протеин - Кокосови бисквитки"
      if (!fl) [b2, fl] = splitTrailingFlavour(baseNb); // "… Vitamin C Праскова"
      if (fl) cand = [b2, fl];
    }
    return {
      ...r,
      brandKey: key,
      brandSource: source,
      base: baseNb,
      fkey: familyKey(key, baseNb),
      cand,
      size: p.size,
      servings: p.servings,
      flavour: p.flavour,
      flavourSource: p.flavour ? "slot" : null,
      pack: p.pack,
      colour: p.colour,
      apparel: p.apparel,
      style: p.style,
    };
  });
  const native = new Map<string, number>();
  for (const r of recs) if (r.fkey) native.set(r.fkey, (native.get(r.fkey) ?? 0) + 1);
  const candKeys = new Map<string, Set<string>>();
  for (const r of recs) {
    if (!r.cand) continue;
    const k = familyKey(r.brandKey, r.cand[0]);
    if (k) candKeys.set(k, (candKeys.get(k) ?? new Set()).add(r.cand[1].toLowerCase()));
  }
  return recs.map(({ cand, ...r }) => {
    if (!cand) return r;
    const k = familyKey(r.brandKey, cand[0]);
    if (!k || k === r.fkey) return r;
    if ((native.get(k) ?? 0) >= 1 || (candKeys.get(k)?.size ?? 0) >= 2) {
      return { ...r, base: cand[0], flavour: cand[1], fkey: k, flavourSource: "lexicon" as const };
    }
    return r;
  }) as unknown as (T & VariantInfo)[];
}

// ---------------------------------------------------------------------------
// Display names (cards, product pages, cart)

/** Empty brackets, doubled spaces and stray separators at either end. */
function tidyName(s: string): string {
  return s
    .replace(/\(\s*\)|\[\s*\]/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:|/\-]+|[\s,;:|/\-(\[]+$/gu, "")
    .trim();
}

const titleWord = (w: string) => w.charAt(0) + w.slice(1).toLowerCase();

/** "BIOTECH USA Iso Whey" → "BioTech USA Iso Whey": a brand written in capitals at the start gets its display spelling. */
function brandCaps(s: string, brand: string): string {
  const toks = s.split(" ");
  const bk = brandKey(brand);
  if (!bk) return s;
  for (let n = Math.min(4, toks.length - 1); n > 0; n--) {
    const lead = toks.slice(0, n);
    const text = lead.join(" ");
    if (!/\p{Lu}{2}/u.test(text) || text !== text.toUpperCase() || brandKey(text) !== bk) continue;
    if (brand.split(" ").length === n) return [brand, ...toks.slice(n)].join(" ");
    // Acronyms stay ("KFD Premium WPC", "NOW Vitamin C"); long words get a capital first letter only.
    if (lead.some((w) => w.replace(/[^\p{L}]/gu, "").length <= 3)) return s;
    return [...lead.map(titleWord), ...toks.slice(n)].join(" ");
  }
  return s;
}

// The Kaufland feed ends names with the net weight in KILOGRAMS written as grams: " / 0.454g.".
const KG_TAIL_RE = /\s\/\s(\d+(?:[.,]\d+)?)\s*g\.\s*$/u;

/**
 * A product name as shown in the shop: the Kaufland feed's " / 0.454g." becomes a real size (" / 454 g") or goes
 * when the name already says the size; a repeated " / " segment ("Unflavored / Unflavored") is written once; a
 * brand written in capitals at the start gets its display spelling.
 */
export function cleanProductName(name: string, brand: string | null = null): string {
  let s = cleanText(name);
  const m = KG_TAIL_RE.exec(s);
  if (m) {
    const head = s.slice(0, m.index);
    const kg = Number(m[1].replace(",", "."));
    const own = parseName(head);
    s = own.size || !(kg > 0 && kg < 30) ? head : `${head} / ${sizeLabel({ value: Math.round(kg * 1000), unit: "g", mult: 1 }, "en")}`;
  }
  // The same kilograms-as-grams elsewhere ("… | 0.500g"): a real size, or nothing when the name has one already.
  s = s.replace(/(^|[\s|/-])0[.,](\d{1,3})g\.?(?=\s|$)/gu, (_m, lead: string, frac: string) => {
    const grams = Math.round(Number(`0.${frac}`) * 1000);
    const rest = s.replace(_m, " ");
    return parseName(rest).size || !grams ? lead : `${lead}${sizeLabel({ value: grams, unit: "g", mult: 1 }, "en")}`;
  });
  // "[1.101lbs.|0.500kg.|100Дози]": the metric size once, or nothing when the name already has it.
  s = s.replace(/\s*\[\s*[\d.,]+\s*lbs?\.?\s*\|\s*([\d.,]+)\s*kg\.?\s*(?:\|[^\]]*)?\]/giu, (m, kg: string) => {
    const grams = Math.round(Number(kg.replace(",", ".")) * 1000);
    return parseName(s.replace(m, " ")).size || !(grams > 0) ? "" : ` ${sizeLabel({ value: grams, unit: "g", mult: 1 }, "en")}`;
  });
  const segs = s.split(" / ");
  s = segs.filter((x, i) => i === 0 || x.trim().toLowerCase() !== segs[i - 1].trim().toLowerCase()).join(" / ");
  if (brand) s = brandCaps(s, brand);
  return tidyName(s) || cleanText(name);
}

/**
 * The name of a family member without what tells the variants apart: pack size, servings, flavour, pack type, colour
 * and apparel size ("Optimum Nutrition 100% Whey Gold Standard / Vanilla Fusion / 454 g" → "Optimum Nutrition 100% Whey
 * Gold Standard"). `flavour` / `flavourEn` are the member's stored flavour names (any spelling of them is removed).
 */
export function familyBaseName(name: string, flavour: string | null, flavourEn: string | null = null, brand: string | null = null): string {
  let base = parseName(name).base;
  // A brand written at the END ("…, Nutrend", "… Natural Factors") — the card shows the brand on its own line.
  const bk = brand ? brandKey(brand) : "";
  if (bk) {
    const toks = base.split(" ");
    for (let n = Math.min(4, toks.length - 2); n > 0; n--) {
      if (brandKey(toks.slice(-n).join(" ")) === bk) {
        base = tidyName(toks.slice(0, -n).join(" "));
        break;
      }
    }
  }
  const target = flavourNames(flavour) ?? flavourNames(flavourEn);
  if (target) {
    const tk = flavourKey(target);
    const isFlavour = (t: string) => {
      const n = flavourNames(t);
      return !!n && flavourKey(n) === tk;
    };
    const seg = /^(.*?\S)(?:\s[-|/]\s|,\s*)([^-|/,]+)$/u.exec(base);
    if (seg && isFlavour(seg[2])) base = seg[1];
    else {
      const toks = base.split(" ");
      for (let n = Math.min(6, toks.length - 1); n >= 1; n--) {
        if (isFlavour(toks.slice(-n).join(" "))) {
          base = toks.slice(0, -n).join(" ");
          break;
        }
      }
    }
  }
  base = tidyName(base.replace(/(?:,\s*|\s)(?:с\s+)?(?:вкус|flavou?r)(?:\s+на)?\s*$/iu, ""));
  // parseName reads "X5" as "x 5" (a count); put back what the name really says ("BCAA X5").
  base = base.replace(/(^|\s)([xхXХ]) (\d+)(?=\s|$)/gu, (m, a: string, x: string, d: string) => (name.includes(`${x}${d}`) ? `${a}${x}${d}` : m));
  return base.replace(/[^\p{L}]/gu, "").length >= 3 ? base : tidyName(cleanText(name));
}

/**
 * The name a family's card shows: the base name most members share (ties: the primary's); when every member is
 * spelt differently, the words they all start with.
 */
export function familyDisplayName(
  members: { name: string; flavour: string | null; flavourEn?: string | null; brand?: string | null }[],
  primary = 0,
): string {
  if (!members.length) return "";
  const bases = members.map((m) => familyBaseName(m.name, m.flavour, m.flavourEn ?? null, m.brand ?? null));
  const key = (b: string) => b.toLowerCase().replace(/[^\p{L}\p{N}%+]+/gu, " ").trim();
  const count = new Map<string, { n: number; text: string }>();
  for (const b of bases) {
    const c = count.get(key(b));
    if (c) c.n++;
    else count.set(key(b), { n: 1, text: b });
  }
  const p = Math.min(Math.max(0, primary), bases.length - 1);
  let best = bases[p];
  let bestN = count.get(key(best))!.n;
  for (const c of count.values()) if (c.n > bestN) [best, bestN] = [c.text, c.n];
  if (bestN * 2 < bases.length) {
    // No spelling is shared by half the members (colours / models inside the name): the words they all start with,
    // as long as that keeps most of the name.
    const toks = bases.map((b) => b.split(" "));
    let n = 0;
    while (toks.every((t) => t.length > n && key(t[n]) === key(toks[0][n]))) n++;
    const prefix = tidyName(toks[p].slice(0, n).join(" "));
    const letters = (x: string) => x.replace(/[^\p{L}]/gu, "").length;
    if (n >= 2 && letters(prefix) >= 6 && letters(prefix) >= 0.6 * letters(best)) return prefix;
  }
  return best;
}

/**
 * Near-equal pack sizes of one family written the same way ("2,04 кг" / "2,084 кг", "907 г" / "908 г" — the same tub
 * weighed by two suppliers), so the size selector shows one option: sizes within 5 % share the most common label.
 * Returns the display label per member (input order); the exact net quantity stays on each product.
 */
export function snapSizeLabels(members: { value: number | null; unit: string | null; label: string | null }[]): (string | null)[] {
  const out = members.map((m) => m.label);
  const byUnit = new Map<string, number[]>();
  members.forEach((m, i) => {
    if (m.label && m.value && m.value > 0 && (m.unit === "g" || m.unit === "ml")) byUnit.set(m.unit, [...(byUnit.get(m.unit) ?? []), i]);
  });
  for (const idx of byUnit.values()) {
    const sorted = [...idx].sort((a, b) => members[a].value! - members[b].value!);
    let cluster: number[] = [];
    const flush = () => {
      if (new Set(cluster.map((i) => members[i].label)).size > 1) {
        const freq = new Map<string, number>();
        for (const i of cluster) freq.set(members[i].label!, (freq.get(members[i].label!) ?? 0) + 1);
        const label = [...freq].sort((a, b) => b[1] - a[1])[0][0];
        for (const i of cluster) out[i] = label;
      }
      cluster = [];
    };
    for (const i of sorted) {
      if (cluster.length && (members[i].value! - members[cluster[0]].value!) / members[i].value! > 0.05) flush();
      cluster.push(i);
    }
    flush();
  }
  return out;
}
