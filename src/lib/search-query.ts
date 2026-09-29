// Turns what a shopper types into an FTS5 query over product names / brands / codes / keywords (ported from /web).
// Pure — no database access here (catalog.ts and search.ts run the SQL).
//
// Product names are ~2/3 Cyrillic and 1/3 Latin ("RYSE Loaded Greens 294 грама", "Протеиново барче DESIGNER BAR"),
// so a known word is OR-expanded to its other-language forms instead of being replaced.

/** Groups of words that mean the same thing (BG ⇄ EN, common spellings). Matched on the typed word or its stem. */
const SYNONYM_GROUPS: string[][] = [
  ["протеин", "протеини", "протеинов", "protein", "proteins"],
  ["суроватъчен", "суроватка", "whey", "уей"],
  ["креатин", "creatine", "креапур", "creapure"],
  ["колаген", "collagen"],
  ["магнезий", "magnesium", "magnez"],
  ["цинк", "zinc", "zink"],
  ["желязо", "iron", "ferrum"],
  ["калций", "calcium"],
  ["селен", "selenium"],
  ["йод", "iodine"],
  ["витамин", "витамини", "vitamin", "vitamins"],
  ["мултивитамин", "мултивитамини", "multivitamin"],
  ["омега", "omega"],
  ["рибено", "fish"],
  ["крил", "krill"],
  ["пробиотик", "пробиотици", "probiotic", "probiotics"],
  ["аминокиселини", "аминокиселина", "amino"],
  ["глутамин", "glutamine"],
  ["аргинин", "arginine"],
  ["цитрулин", "citrulline"],
  ["карнитин", "carnitine", "karnityna"],
  ["изолат", "isolate"],
  ["хидролизат", "hydrolyzed", "hydrolysate"],
  ["казеин", "casein"],
  ["гейнър", "гейнер", "gainer"],
  ["предтренировъчен", "предтренировъчни", "предтренировъчна", "preworkout", "pre-workout"],
  ["електролити", "електролит", "electrolytes", "electrolyte"],
  ["мелатонин", "melatonin"],
  ["ашваганда", "ашвагандха", "ashwagandha"],
  ["куркума", "куркумин", "turmeric", "curcumin"],
  ["джинджифил", "ginger"],
  ["женшен", "ginseng"],
  ["шейкър", "шейкъри", "shaker"],
  ["бутилка", "bottle"],
  ["бар", "барче", "барове", "bar", "bars"],
  ["веган", "vegan"],
  ["кофеин", "caffeine"],
  ["хиалурон", "хиалуронова", "hyaluronic"],
  ["биотин", "biotin"],
  ["коензим", "coenzyme", "q10"],
  ["спирулина", "spirulina"],
  ["хлорела", "chlorella"],
  ["глюкозамин", "glucosamine"],
  ["хондроитин", "chondroitin"],
  ["бета", "beta"],
  ["аланин", "alanine"],
  ["фет", "fat"],
  ["бърнър", "burner"],
  ["шоколад", "chocolate"],
  ["ванилия", "vanilla"],
  ["ягода", "strawberry"],
  ["фъстъчено", "peanut"],
  ["кето", "keto"],
  ["енергия", "енергийна", "energy"],
];

// Crude Bulgarian stemming: "пъзели" → "пъзел", "протеини" → "протеин", "витамините" → "витамин".
const ENDINGS = ["ите", "ата", "ята", "ото", "ът", "ят", "та", "те", "то", "ия", "ии", "и", "а", "я", "о", "е", "у", "ъ"];

export function stem(token: string): string {
  if (!/[а-яё]/i.test(token) || token.length < 5) return token;
  for (const e of ENDINGS) {
    if (token.endsWith(e) && token.length - e.length >= 4) return token.slice(0, -e.length);
  }
  return token;
}

const SYNONYMS = new Map<string, string[]>();
for (const group of SYNONYM_GROUPS) {
  for (const w of group) {
    for (const k of [w, stem(w)]) SYNONYMS.set(k, [...new Set([...(SYNONYMS.get(k) ?? []), ...group])]);
  }
}

export function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .normalize("NFC")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0)
    .slice(0, 8);
}

const quote = (t: string) => `"${t.replace(/"/g, "")}"*`;

// Vitamins are written with a letter ("витамин D", "Vitamin B12", "Витамин Д3", "D3 + K2"): "витамин" followed by a
// letter is searched as the phrase in both alphabets and spellings, never as "d*" (which matches every d-word).
const VITAMIN_WORDS = new Set(["витамин", "витамини", "витамина", "vitamin", "vitamins", "vit", "вит"]);
/** Cyrillic letters Bulgarians type for vitamin letters (В looks like B, С like C). */
const LETTER_EQUIV: Record<string, string> = { а: "a", б: "b", в: "b", с: "c", д: "d", е: "e", к: "k" };
const LETTER_CYR: Record<string, string[]> = { a: ["а"], b: ["б", "в"], c: ["с"], d: ["д"], e: ["е"], k: ["к"] };
/** Names without the word "vitamin" ("D3 + K2 2000 IU", "Methyl B12"). */
const VITAMIN_CODES: Record<string, string[]> = { d: ["d3", "d2", "д3"], k: ["k2", "k1", "к2", "mk7"], b: ["b12", "b6", "b1", "b2", "b3", "b5", "b7", "b9", "в12", "в6"] };
const VITAMIN_CODE_RE = /^([a-ekабвсдек])(\d{0,2})$/u;

/** The Latin vitamin letter of a token ("d", "D3", "д", "в12" → "d"/"b"), or null. */
function vitaminLetter(t: string): { letter: string; digits: string } | null {
  const m = VITAMIN_CODE_RE.exec(t);
  if (!m) return null;
  const letter = LETTER_EQUIV[m[1]] ?? m[1];
  return /^[a-ek]$/.test(letter) ? { letter, digits: m[2] } : null;
}

function vitaminGroup(v: { letter: string; digits: string }, withWord: boolean): string {
  const letters = [v.letter, ...(LETTER_CYR[v.letter] ?? [])];
  const forms = new Set<string>();
  for (const l of letters) {
    for (const w of ["витамин", "vitamin"]) forms.add(`${w} ${l}${v.digits}`);
    if (v.digits || !withWord) forms.add(`${l}${v.digits}`);
  }
  if (!v.digits) for (const c of VITAMIN_CODES[v.letter] ?? []) forms.add(c);
  return `(${[...forms].map(quote).join(" OR ")})`;
}

/** FTS5 MATCH expression, or null if nothing searchable was typed: every word must match (in any of its forms). */
export function ftsQuery(q: string): string | null {
  const tokens = tokenize(q);
  if (!tokens.length) return null;
  const parts: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const next = tokens[i + 1];
    const v = next && VITAMIN_WORDS.has(t) ? vitaminLetter(next) : null;
    if (v) {
      parts.push(vitaminGroup(v, true));
      i++;
      continue;
    }
    // "d3", "b12", "k2" typed on their own.
    const code = /\d/.test(t) ? vitaminLetter(t) : null;
    if (code) {
      parts.push(vitaminGroup(code, false));
      continue;
    }
    const forms = new Set([stem(t)]);
    // "pre-workout" → the phrase "pre workout" (the index splits words at hyphens).
    for (const s of SYNONYMS.get(t) ?? SYNONYMS.get(stem(t)) ?? []) forms.add(stem(s.replace(/-/g, " ")));
    const list = [...forms].filter(Boolean).map(quote);
    parts.push(list.length > 1 ? `(${list.join(" OR ")})` : list[0]);
  }
  return parts.join(" AND ");
}

/** Words of a query as the category matcher compares them: stemmed, vitamin letters in Latin ("витамин Д" → витамин, d). */
export function queryWords(q: string): string[] {
  const tokens = tokenize(q);
  const vitamin = tokens.some((t) => VITAMIN_WORDS.has(t));
  const out: string[] = [];
  for (const t of tokens) {
    const v = vitamin || /\d/.test(t) ? vitaminLetter(t) : null;
    if (v) out.push(v.letter);
    else if (t.length >= 3) out.push(stem(t));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Product codes: SKU ("Dilon-108965") and barcode (EAN / UPC, "3800123456789")

type Code = { text: string; digits: string | null };

/** One word with digits in it — a SKU or barcode typed or scanned into a search box ("5 901234 123457" counts too). */
function codeQuery(q: string): Code | null {
  const text = q.trim();
  const compact = text.replace(/\s+/g, "");
  if (/^\d{4,14}$/.test(compact)) return { text: compact, digits: compact };
  if (text.length > 40 || !/\d/.test(text) || !/^[\p{L}\p{N}._/-]+$/u.test(text)) return null;
  return { text, digits: null };
}

/** A barcode without its leading zeros — Excel drops them and scanners add one to 12-digit UPC codes, so compare this. */
export function barcodeKey(ean: string): string {
  return ean.replace(/\D/g, "").replace(/^0+/, "");
}

/** FTS5 expression for a barcode with any number of leading zeros, or null if it is too short to be one. */
function barcodeFts(digits: string): string | null {
  const core = barcodeKey(digits);
  if (digits.length < 8 || core.length < 6) return null;
  const variants: string[] = [];
  for (let v = core; v.length <= 14; v = `0${v}`) variants.push(`"${v}"`);
  return `ean : (${variants.join(" OR ")})`;
}

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Body of a `WITH m AS (…)` returning (id, exact, rank, inname) over ALL products (hidden and family variants included —
 * callers filter and map to cards): exact = 2 — the SKU or barcode is exactly what was typed; 1 — it contains it
 * (admin only); 0 — name / brand / keyword / code prefix matches, best `rank` first. inname = 1 when every word
 * matched the name or brand (not only a category / flavour keyword).
 */
export function searchMatchSql(q: string, { admin = false } = {}): { sql: string; params: string[] } | null {
  const parts: string[] = [];
  const params: string[] = [];
  const code = codeQuery(q);
  if (code) {
    const exact = ["p.sku = ? COLLATE NOCASE"];
    params.push(code.text);
    if (admin && code.digits) {
      exact.push("p.sku LIKE ?");
      params.push(`%-${code.digits}`);
    }
    const ean = code.digits ? barcodeFts(code.digits) : null;
    if (ean) {
      exact.push("p.id IN (SELECT rowid FROM products_fts WHERE products_fts MATCH ?)");
      params.push(ean);
    }
    parts.push(`SELECT p.id, 2 AS exact, 0 AS rank, 1 AS inname FROM products p WHERE ${exact.join(" OR ")}`);
    if (admin) {
      const like = `%${likeEscape(code.text)}%`;
      const partial = ["p.sku LIKE ? ESCAPE '\\'"];
      params.push(like);
      if (code.digits) {
        partial.push("p.ean LIKE ?");
        params.push(like);
      }
      parts.push(`SELECT p.id, 1 AS exact, 0 AS rank, 1 AS inname FROM products p WHERE ${partial.join(" OR ")}`);
    }
  }
  const fts = ftsQuery(q);
  if (fts) {
    // Columns: name, name_en, brand, sku, ean, keywords — a number in a product's name outranks the same digits at the
    // start of some SKU, and a category / goal word counts less than a word in the name.
    parts.push("SELECT rowid AS id, 0 AS exact, rank, 0 AS inname FROM products_fts WHERE products_fts MATCH ? AND rank MATCH 'bm25(1, 1, 0.2, 0.1, 0.1, 1)'");
    params.push(fts);
    parts.push("SELECT rowid AS id, 0 AS exact, NULL AS rank, 1 AS inname FROM products_fts WHERE products_fts MATCH ?");
    params.push(`{name name_en brand} : (${fts})`);
  }
  if (!parts.length) return null;
  return { sql: `SELECT id, MAX(exact) AS exact, MIN(rank) AS rank, MAX(inname) AS inname FROM (${parts.join(" UNION ALL ")}) GROUP BY id`, params };
}
