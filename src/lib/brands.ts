// Brand normalisation: the export spells the same brand many ways ("OLIMP", "Olimp Sport Nutrition", "Олимп"),
// leaves the Brand column empty for some suppliers, or files rows under the wrong brand.
// Ported 1:1 from the research prototype variants_proto.py (§2). Pure — shared by the importer and the admin.
import { cleanText } from "./text-match";

// ---------------------------------------------------------------------------
// Data (hand-checked in the prototype)

const NULL_BRANDS = new Set<string>([
  "", "#n/a", "-", "0", "battery", "generic", "n/a", "na", "no brand", "none", "null", "unknown",
  // not brands at all: placeholders, a product type, a product name typed into the Brand column
  "без марка", "без бранд", "няма", "друга марка", "други марки", "други", "разни", "various", "other", "others", "other brands",
  "no name", "noname", "бутилка за вода", "d3 selen zinc c", "services ood bulga", "фарма ад", "промоция",
]);

const BG_TRANSLIT: Record<string, string> = {
  "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l",
  "м": "m", "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "h", "ц": "ts", "ч": "ch",
  "ш": "sh", "щ": "sht", "ъ": "a", "ь": "", "ю": "yu", "я": "ya", "ѝ": "i",
};

/** Trailing tokens dropped when computing the key. */
const BRAND_KEY_SUFFIXES = new Set<string>([
  "ad", "ag", "and", "bv", "canada", "co", "eood", "foods", "france", "germany", "gmbh", "inc", "kg", "laboratoire",
  "laboratories", "laboratory", "labs", "limited", "llc", "ltd", "ltds", "nutrition", "nutritions", "o", "ood", "organic", "organics",
  "sa", "series", "signature", "sp", "spa", "sport", "sports", "srl", "supplement", "supplements", "the", "uk", "usa", "z",
  "vertriebs", "plc", "corp",
]);
/** Company legal forms: dropped from the key wherever they stand ("Цветелина ООД Пловдив", "Abo Pharma & Painex GmbH & Co."). */
const LEGAL_FORM_TOKENS = new Set<string>(["ood", "eood", "gmbh", "ltd", "ltds", "llc", "spa", "srl", "et", "chp", "plc"]);

/** key → key merges the generic key function cannot find. */
const BRAND_KEY_ALIASES: Record<string, string> = {
  "ruleone": "rule1", "r1": "rule1", "nestl": "nestle", "kevinlevronesignature": "kevinlevrone", "levrone": "kevinlevrone",
  "kevinlevron": "kevinlevrone", "dorianyatesnutrition": "dorianyates", "dy": "dorianyates", "olimpsport": "olimp",
  "olimplabs": "olimp", "scitecnutrition": "scitec", "gymbeamcom": "gymbeam", "naturalsplus": "naturesplus",
  "naturesplususa": "naturesplus", "bioherbabg": "bioherba", "hollandbarrett": "hollandandbarrett",
  "doctorsbestinc": "doctorsbest", "drbest": "doctorsbest", "jamiesonlaboratories": "jamieson", "bioprogramaeood": "bioprograma",
  "zeinfarma": "zeinpharma", "hayalabs": "haya", "herolabs": "herolab", "myproteincom": "myprotein", "optimumnutrition": "optimum",
  "universalnutrition": "universal", "solgarvitaminandherb": "solgar", "vitabioticsltd": "vitabiotics",
  "herbamedika": "herbamedica", "dymatizenutrition": "dymatize", "activlabpharma": "activlab", "mirtamedikus": "mirtamedicus",
  "dhuarzneimittelgmbh": "dhuarzneimittel", "dhu": "dhuarzneimittel", "pumpkinorganics": "pumpkin", "bionaorganic": "biona",
  "webber": "webbernaturals", "thorneresearch": "thorne", "globalhealingcenter": "globalhealing", "ostrovitpharma": "ostrovit",
  "forever": "foreverliving", "dzheymisan": "jamieson", "solgar": "solgar",
  // company names of brands (the Brand column sometimes holds the maker's or importer's company name)
  "kendi": "kendypharma", "ramkofarm": "ramcopharm", "ramkopharm": "ramcopharm", "goldenfarm": "goldenpharm",
  "abopharmaandpainex": "abopharma", "medigruennaturprodukte": "medigruen", "manukahealthnewzealand": "manukahealth",
  "queisserpharma": "doppelherz", "zonapharm": "zonapharma",
};

/** Canonical display names (hand-checked). Keys not listed fall back to the best raw spelling. */
export const BRAND_DISPLAY: Record<string, string> = {
  "now": "NOW Foods", "allnutrition": "Allnutrition", "ostrovit": "OstroVit", "swanson": "Swanson", "biotech": "BioTech USA",
  "naturalfactors": "Natural Factors", "applied": "Applied Nutrition", "gymbeam": "GymBeam", "amix": "Amix",
  "pure": "Pure Nutrition", "nutricost": "Nutricost", "fa": "FA Nutrition", "olimp": "Olimp Sport Nutrition",
  "kevinlevrone": "Kevin Levrone", "artesaniaagricola": "Artesanía Agrícola", "lifeextension": "Life Extension",
  "naturesway": "Nature's Way", "kfd": "KFD Nutrition", "everbuild": "Everbuild Nutrition",
  "mattissonhealthstyle": "Mattisson Healthstyle", "myprotein": "Myprotein", "trec": "Trec Nutrition",
  "jarrowformulas": "Jarrow Formulas", "scitec": "Scitec Nutrition", "haya": "Haya Labs", "gardenoflife": "Garden of Life",
  "hollandandbarrett": "Holland & Barrett", "harbinger": "Harbinger", "herolab": "Hero.Lab", "solgar": "Solgar",
  "nutrend": "Nutrend", "6pak": "6PAK Nutrition", "darynatury": "Dary Natury", "osavi": "Osavi", "purasana": "Purasana",
  "21stcentury": "21st Century", "genius": "Genius Nutrition", "swedish": "Swedish Supplements",
  "nordicnaturals": "Nordic Naturals", "sfd": "SFD Nutrition", "doctorsbest": "Doctor's Best",
  "doublewood": "Double Wood Supplements", "nutriversum": "Nutriversum", "gaspari": "Gaspari Nutrition",
  "webbernaturals": "Webber Naturals", "ekamedica": "EkaMedica", "peak": "PEAK", "phytomoinscher": "PhytoMoinsCher",
  "dorianyates": "Dorian Yates Nutrition", "natandform": "Nat&Form", "muscletech": "MuscleTech", "herbamedica": "Herbamedica",
  "naughtyboy": "Naughty Boy", "paladinpharma": "Paladin Pharma", "hs": "HS Labs", "vplab": "VPLab", "ethicsport": "EthicSport",
  "traceminerals": "Trace Minerals", "famillemary": "Famille Mary", "weightworld": "WeightWorld", "optimum": "Optimum Nutrition",
  "cvetitaherbal": "Cvetita Herbal", "mutant": "Mutant", "humanprotect": "Human Protect", "abopharma": "Abopharma",
  "fitspo": "FIT SPO", "trainedbyjp": "Trained by JP", "amlanaturmaharishiayurveda": "Amla Natur / Maharishi Ayurveda",
  "proposnature": "Propos'Nature", "herbesdelmoli": "Herbes del Molí", "sifaana": "Şifa Ana", "drwakdes": "Dr. Wakde's",
  "lemonpharma": "Lemon Pharma", "bornwinner": "Born Winner", "universal": "Universal Nutrition", "greenidea": "Green Idea",
  "auraherbals": "Aura Herbals", "corechampsbykaigreene": "Core Champs by Kai Greene", "barbeldrexel": "Bärbel Drexel",
  "nurslokmanhekim": "Nurs Lokman Hekim", "ericfavre": "Eric Favre", "karlminck": "Karl Minck", "nanosupps": "NanoSupps",
  "allmax": "AllMax Nutrition", "activlab": "ActivLab", "ecologicalformulas": "Ecological Formulas", "gallpharma": "Gall Pharma",
  "kikihealth": "KIKI Health", "smartshake": "SmartShake", "dymatize": "Dymatize", "skinnyfood": "Skinny Food Co",
  "drfrei": "Dr. Frei", "cellucor": "Cellucor", "biona": "Biona Organic", "ladrome": "Ladrôme", "elcompra": "El Compra",
  "proteinisi": "Proteini.si", "richpiana5": "Rich Piana 5% Nutrition", "badass": "Bad Ass Nutrition", "extrifit": "Extrifit",
  "pranarom": "Pranarôm", "vitagold": "Vitagold", "raabvitalfood": "Raab Vitalfood", "raw": "RAW Nutrition",
  "vitabiotics": "Vitabiotics", "terranova": "Terranova", "lazarangelov": "Lazar Angelov Nutrition",
  "dexterjackson": "Dexter Jackson", "dragonherbs": "Dragon Herbs", "maxxwin": "MaxxWin", "vshape": "V-Shape Supplements",
  "rudigerfeldt": "Rüdiger Feldt", "healthyorigins": "Healthy Origins", "powerhealth": "Power Health",
  "globalhealing": "Global Healing", "finejapan": "Fine Japan", "virde": "Virde",
  "sportsandhealthsolutions": "Sports & Health Solutions", "swissenergy": "Swiss Energy", "skull": "Skull Labs",
  "ronniecoleman": "Ronnie Coleman Signature Series", "bioprograma": "Bioprograma", "fitobios": "Fitobios",
  "manukadoctor": "Manuka Doctor", "chaoscrew": "Chaos Crew", "balkanpharmaceuticals": "Balkan Pharmaceuticals",
  "pumpkin": "Pumpkin Organics", "natugena": "NatuGena", "vemoherb": "VemoHerb", "pharmaliferesearch": "Pharmalife Research",
  "powersystem": "Power System", "superiorsource": "Superior Source", "musclemeds": "MuscleMeds", "nuclear": "Nuclear Nutrition",
  "walmark": "Walmark", "nestle": "Nestlé", "allamericanefx": "All American EFX", "fortex": "Fortex", "jamieson": "Jamieson",
  "nutrex": "Nutrex", "swedishnutra": "Swedish Nutra", "zoomad": "Zoomad Labs", "kompava": "Kompava",
  "dragonsuperfoods": "Dragon Superfoods", "dedicated": "Dedicated Nutrition", "magnalabs": "MagnaLabs", "bioherba": "Bioherba",
  "boiron": "Boiron", "thorne": "Thorne", "esn": "ESN", "bsn": "BSN", "san": "SAN", "usp": "USPlabs",
  "controlled": "Controlled Labs", "bestbody": "Best Body Nutrition", "naturesanswer": "Nature's Answer",
  "naturesplus": "Nature's Plus", "zeinpharma": "ZEINpharma", "musclepharm": "MusclePharm", "grassberg": "Grassberg",
  "rule1": "Rule 1", "biovea": "Biovea", "foreverliving": "Forever Living", "lrhealthandbeauty": "LR Health & Beauty",
  "vitaworld": "Vita World", "naturalico": "Naturalico", "herbalkan": "Herbalkan", "viridian": "Viridian", "vegavero": "Vegavero",
  "aromandise": "Aromandise", "deva": "Deva", "vitabay": "Vitabay", "himalaya": "Himalaya", "iswari": "Iswari",
  "mgd": "MGD Nature", "doppelherz": "Doppelherz", "natrol": "Natrol", "ghost": "GHOST", "byodo": "Byodo",
  "armageddon": "Armageddon Nutrition", "storck": "Storck", "gt": "GT", "damhert": "Damhert", "alcenero": "Alce Nero",
  "raks": "Raks", "nutravita": "Nutravita", "fleurancenature": "Fleurance Nature", "floresense": "Floresense",
  "phiessences": "PHI Essences", "enzymedica": "Enzymedica", "myconatur": "MycoNatur", "zoyabg": "ZoyaBG",
  "vitallplus": "Vit'all+", "dhuarzneimittel": "DHU", "englishteashop": "English Tea Shop", "vitalers": "Vitaler's",
  "bareorganics": "Bare Organics", "universalanimal": "Universal Animal", "scivation": "Scivation", "naturelove": "Nature Love",
  "supplementneeds": "Supplement Needs", "oshee": "OSHEE", "probiogen": "Probiogen", "stacker": "Stacker2",
  "sweetmemories": "Sweet Memories",
};

/** Brands that only / mostly appear inside the NAME (Brand column #N/A for these suppliers). */
const NAME_ONLY_BRANDS: Record<string, string> = {
  "esn": "ESN", "bestbody": "Best Body Nutrition", "naturesanswer": "Nature's Answer", "zeinpharma": "ZEINpharma",
  "naturesplus": "Nature's Plus", "controlled": "Controlled Labs", "usp": "USPlabs", "bsn": "BSN", "san": "SAN",
  "naturelove": "Nature Love", "supplementneeds": "Supplement Needs", "probiogen": "Probiogen", "scivation": "Scivation",
  "stacker": "Stacker2", "musclepharm": "MusclePharm", "oshee": "OSHEE", "primaforce": "PrimaForce", "goodhemp": "Good Hemp",
  "hoyer": "Hoyer",
};

/** How a brand is written inside names when it differs from the key (lower-cased raw text → key). */
const NAME_BRAND_ALIASES: Record<string, string> = {
  "biotech": "biotech", "biotech usa": "biotech", "olimp": "olimp", "olimp sport nutrition": "olimp", "scitec": "scitec",
  "now": "now", "now foods": "now", "now sports": "now", "amix": "amix", "everbuild": "everbuild", "haya labs": "haya",
  "vemoherb": "vemoherb", "optimum nutrition": "optimum", "gymbeam": "gymbeam", "gym beam": "gymbeam", "myprotein": "myprotein",
  "kfd": "kfd", "sfd": "sfd", "gaspari": "gaspari", "muscle pharm": "musclepharm", "jamiseon": "jamieson", "нау": "now",
  "солгар": "solgar", "зеин фарма": "zeinpharma", "зеинфарма": "zeinpharma", "smart shake": "smartshake",
  "levrone": "kevinlevrone", "dy nutrition": "dorianyates", "naturesplus": "naturesplus", "nature's plus": "naturesplus",
  "пранаром": "pranarom", "джеймисън": "jamieson",
};

/** Brand keys that are also ordinary words: never inferred from a single name token. */
const GENERIC_BRAND_KEYS = new Set<string>([
  "active", "alive", "amino", "baby", "balance", "beauty", "better", "bio", "biomed", "black", "body", "cocoa", "collagen",
  "creatine", "daily", "digestive", "energy", "essential", "first", "fit", "gold", "golden", "green", "head", "health", "hemp",
  "imunobor", "iron", "keto", "kids", "lab", "labs", "life", "magnesium", "mars", "max", "mind", "natural", "nature", "neoplast",
  "nutri", "omega", "one", "organic", "pediakid", "power", "premium", "protein", "pumpkin", "pure", "raw", "revive", "slim",
  "smart", "sport", "super", "swiss", "total", "ultra", "vita", "vitamin", "vitargo", "whey", "xtend", "zdrave", "zinc",
]);

const NON_SUPPLEMENT_BRAND_KEYS = new Set<string>([
  // audit: essential oils / massage bases, household cleaners, cosmetics
  "floresense", "tribio", "khadi",
  "adidas", "bavicchi", "comsed", "dove", "englishteashop", "gt", "hartmann", "heinz", "lorenz", "lrhealthandbeauty", "orthoteh",
  "phiessences", "platinet", "pringles", "scholl", "snickersandmars", "storck", "sweetmemories",
]);


/** Brand keys this short must appear UPPERCASE (or exactly as displayed) in a name to be inferred from it. */
const SHORT_BRAND_NEEDS_UPPER = 4;

// ---------------------------------------------------------------------------

export function isNullBrand(b: string | null | undefined): boolean {
  return NULL_BRANDS.has(cleanText(b).toLowerCase());
}

const isUpperChar = (c: string) => c !== c.toLowerCase() && c === c.toUpperCase();
/** Python str.isupper(): has cased characters and all of them are upper case. */
const isUpperStr = (s: string) => /\p{L}/u.test(s) && s === s.toUpperCase() && s !== s.toLowerCase();
/** Python str.title(): upper case after every non-letter. */
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[^\p{L}])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());

/** Normalised brand identity ("Olimp Sport Nutrition" / "OLIMP" / "Олимп" → "olimp"). Never shown to shoppers. */
export function brandKey(b: string | null | undefined): string {
  let s = cleanText(b).toLowerCase().replace(/[®™©*]/g, "");
  s = s.normalize("NFKD").replace(/\p{M}/gu, "");
  s = [...s].map((c) => BG_TRANSLIT[c] ?? c).join("");
  s = s.replace(/&/g, " and ").replace(/'/g, "");
  // Dotted abbreviations are one token: "S.p.A." → "spa", "S.A." → "sa".
  s = s.replace(/(^|[^a-z0-9])((?:[a-z]\.){2,}[a-z]?)/g, (_, a: string, abbr: string) => a + abbr.replace(/\./g, ""));
  let toks: string[] = [...(s.match(/[a-z0-9]+/g) ?? [])];
  if (toks.length > 1) {
    const kept = toks.filter((t, i) => i === 0 || !LEGAL_FORM_TOKENS.has(t));
    if (kept.length) toks = kept;
    if (toks.length > 1 && (toks[0] === "et" || toks[0] === "chp")) toks = toks.slice(1);
  }
  while (toks.length > 1 && BRAND_KEY_SUFFIXES.has(toks[toks.length - 1])) toks.pop();
  const k = toks.join("");
  return BRAND_KEY_ALIASES[k] ?? k;
}

// A company's legal form at the end of a brand as written in the export ("QUEISSER PHARMA GmbH", "Кенди ООД",
// "Paladin Pharma S.p.A.", "Abo Pharma & Painex GmbH & Co.") and a sole-trader prefix ("ЕТ …", "ЧП …").
const LEGAL_TAIL_RE =
  /(?:,?\s+(?:&\s*co\.?|gmbh|ltd\.?|ltds|llc|inc\.?|s\.?\s?p\.?\s?a\.?|s\.?\s?a\.?|s\.?\s?r\.?\s?l\.?|b\.?v\.?|ag|kg|plc|corp\.?|vertriebs|ад|еоод|оод|ет|eood|ood|ad)\.?)+\s*$/iu;
const LEGAL_HEAD_RE = /^(?:ет|чп|et)\s+/iu;

/** A brand for display: without the company's legal form, all-lowercase words capitalised ("Holle baby food ag" → "Holle Baby Food"). */
export function tidyBrandName(raw: string): string {
  let s = cleanText(raw).replace(/[®™©*]/g, "").trim();
  for (let i = 0; i < 3; i++) s = s.replace(LEGAL_TAIL_RE, "").replace(LEGAL_HEAD_RE, "").trim();
  // "Цветелина Оод Пловдив": the legal form in the middle, the town after it.
  s = s.replace(/\s+(?:оод|еоод|ood|eood|gmbh|ltd\.?)\s+\p{L}+$/iu, "").trim();
  const words = s.split(/\s+/);
  if (words.length > 1) s = words.map((w, i) => (i > 0 && /^\p{Ll}{4,}$/u.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(" ");
  return s || cleanText(raw);
}

function displayScore(v: string): number {
  let s = 0;
  if (v !== v.toUpperCase()) s += 2;
  if (v && isUpperChar(v[0])) s += 1;
  const words = v.split(/\s+/).filter(Boolean);
  return s + words.filter((w) => isUpperChar(w[0])).length / Math.max(1, words.length);
}

export type BrandEntry = { display: string; raw: Map<string, number>; count: number };
export type BrandTable = Map<string, BrandEntry>;

/** Brand key → display name and row count, from the Brand column of the given rows. */
export function buildBrandTable(brands: Iterable<string>): BrandTable {
  const groups = new Map<string, Map<string, number>>();
  for (const b of brands) {
    if (isNullBrand(b)) continue;
    const k = brandKey(b);
    const raw = cleanText(b.replace(/[®™©*]/g, ""));
    const g = groups.get(k) ?? new Map<string, number>();
    g.set(raw, (g.get(raw) ?? 0) + 1);
    groups.set(k, g);
  }
  const table: BrandTable = new Map();
  for (const [k, raw] of groups) {
    let display = BRAND_DISPLAY[k];
    if (!display) {
      // Best-looking spelling (mixed case, capitalised words), then the most common one; without a legal form.
      let best: [string, number] | null = null;
      for (const [v0, n] of raw) {
        const v = tidyBrandName(v0);
        if (!best || displayScore(v) > displayScore(best[0]) || (displayScore(v) === displayScore(best[0]) && n > best[1])) best = [v, n];
      }
      display = best![0];
      if (isUpperStr(display) && display.length > 4) display = titleCase(display);
    }
    table.set(k, { display, raw, count: [...raw.values()].reduce((a, b) => a + b, 0) });
  }
  return table;
}

/** Brands that may be recognised inside product names: >= minRows rows in the Brand column, plus name-only brands. */
export function knownBrands(table: BrandTable, minRows = 3): Map<string, string> {
  const known = new Map<string, string>();
  for (const [k, v] of table) if (v.count >= minRows) known.set(k, v.display);
  for (const [k, v] of Object.entries(NAME_ONLY_BRANDS)) if (!known.has(k)) known.set(k, v);
  return known;
}

const NAME_TOKEN_RE = /[\p{L}\p{N}_.&'+%-]+/gu;

function nameTokens(name: string): string[] {
  return (cleanText(name).match(NAME_TOKEN_RE) ?? []).map((t) => t.replace(/^-+|-+$/g, "")).filter(Boolean);
}

function brandOk(k: string, raw: string, known: Map<string, string>): boolean {
  if (!known.has(k)) return false;
  if (k.length <= SHORT_BRAND_NEEDS_UPPER && !(isUpperStr(raw) || raw === known.get(k))) return false;
  if (GENERIC_BRAND_KEYS.has(k) && raw.split(/\s+/).filter(Boolean).length < 2) return false;
  return true;
}

function aliasKey(raw: string): string {
  return NAME_BRAND_ALIASES[raw.toLowerCase()] || brandKey(raw);
}

/** Key of the longest run of leading name tokens (5..1) that is a known brand, and how many tokens it used. */
export function leadingBrand(name: string, known: Map<string, string>): [string | null, number] {
  const toks = nameTokens(name);
  for (let n = Math.min(5, toks.length); n > 0; n--) {
    const raw = toks.slice(0, n).join(" ");
    const k = aliasKey(raw);
    if (brandOk(k, raw, known)) return [k, n];
  }
  return [null, 0];
}

/** Brand written in the name: leading tokens, one of the last two " - " / " / " segments, or the trailing 2–3 tokens. */
export function inferBrandFromName(name: string, known: Map<string, string>): string | null {
  const [lead] = leadingBrand(name, known);
  if (lead) return lead;
  const s = cleanText(name);
  const segs = s.split(/\s[-/|]\s/);
  for (const seg of segs.slice(1).reverse().slice(0, 2)) {
    const raw = seg.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim().replace(/^[ ,.]+|[ ,.]+$/g, "");
    const k = raw ? aliasKey(raw) : "";
    if (raw && raw.split(" ").length <= 4 && brandOk(k, raw, known)) return k;
  }
  const toks = nameTokens(s);
  for (const n of [3, 2]) {
    if (toks.length > n) {
      const raw = toks.slice(-n).join(" ");
      const k = aliasKey(raw);
      if (k.length >= 6 && brandOk(k, raw, known)) return k;
    }
  }
  return null;
}

export type BrandSource = "column" | "name" | "name_override" | "none";

/**
 * The brand of a row. The Brand column wins, except: empty / "#N/A" → inferred from the name; or the name STARTS
 * with a different, well-known brand (>= 30 rows) and the column brand is not mentioned in the name (fixes
 * "Myprotein …" rows filed under another brand).
 */
export function resolveBrand(brandRaw: string, name: string, known: Map<string, string>, table: BrandTable): { key: string | null; source: BrandSource } {
  const col = isNullBrand(brandRaw) ? null : brandKey(brandRaw);
  if (!col) {
    const k = inferBrandFromName(name, known);
    return k ? { key: k, source: "name" } : { key: null, source: "none" };
  }
  const [lead] = leadingBrand(name, known);
  if (lead && lead !== col && (table.get(lead)?.count ?? 0) >= 30 && !brandKey(name).includes(col.slice(0, 6))) {
    return { key: lead, source: "name_override" };
  }
  return { key: col, source: "column" };
}

/** Display name of a brand key. */
export function brandDisplayName(key: string, table: BrandTable, known: Map<string, string>): string | null {
  return table.get(key)?.display || known.get(key) || BRAND_DISPLAY[key] || null;
}

/** Remove the brand when it is written at the start ("BIOTECH USA …", "NOW - …") or the end ("… Natural Factors"). */
export function stripBrandFromBase(base: string, key: string): string {
  let toks = base.split(/\s+/).filter(Boolean);
  for (let n = Math.min(5, toks.length - 1); n > 0; n--) {
    const raw = toks.slice(0, n).join(" ").replace(/^[ \-|/]+|[ \-|/]+$/g, "");
    if (aliasKey(raw) === key) {
      base = toks.slice(n).join(" ").replace(/^[ \-|/]+/, "");
      break;
    }
  }
  toks = base.split(/\s+/).filter(Boolean);
  for (let n = Math.min(4, toks.length - 1); n > 0; n--) {
    const raw = toks.slice(-n).join(" ").replace(/^[ \-|/(),]+|[ \-|/(),]+$/g, "");
    if (aliasKey(raw) === key) {
      base = toks.slice(0, -n).join(" ").replace(/[ \-|/,(]+$/, "");
      break;
    }
  }
  return base.trim();
}

/** Brands that are clearly not supplement makers (electronics, cosmetics, groceries) — importer noise filter. */
export function isNonSupplementBrand(key: string | null): boolean {
  return !!key && NON_SUPPLEMENT_BRAND_KEYS.has(key);
}
