// Text clean-up and keyword matching shared by the catalogue importer, the taxonomy rules and the admin.
// Pure functions, no Node or Next imports.
//
// The rule lists were written as Python regexes (research prototypes), so `ure()` translates the few
// Python-only constructs: JS `\b` / `\w` only understand ASCII, Python's are Unicode-aware.

const WORD = "\\p{L}\\p{N}_";
/** Python `\b` with Unicode word characters. */
const BOUNDARY = `(?:(?<=[${WORD}])(?![${WORD}])|(?<![${WORD}])(?=[${WORD}]))`;
// Characters that may be escaped with a backslash in a `u`-flag regex.
const SYNTAX = new Set([..."^$\\.*+?()[]{}|/"]);
const CLASS_ESCAPES = new Set([..."dDsSwWbBnrtfv0123456789pPkuxc"]);

/** Compile a Python-flavoured regex source as a Unicode-aware JS RegExp. */
export function ure(src: string, flags = "iu"): RegExp {
  let out = "";
  let inClass = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "\\" && i + 1 < src.length) {
      const n = src[++i];
      if (n === "w") out += inClass ? WORD : `[${WORD}]`;
      else if (n === "W") out += inClass ? "" : `[^${WORD}]`;
      else if (n === "b" && !inClass) out += BOUNDARY;
      else if (SYNTAX.has(n) || CLASS_ESCAPES.has(n) || (inClass && n === "-")) out += `\\${n}`;
      else out += n; // "\-", "\'" … are plain characters
      continue;
    }
    if (!inClass && src.startsWith("[^\\W_]", i)) {
      out += "[\\p{L}\\p{N}]";
      i += 5;
      continue;
    }
    if (!inClass && src.startsWith("(?P<", i)) {
      out += "(?<";
      i += 3;
      continue;
    }
    if (c === "[" && !inClass) inClass = true;
    else if (c === "]" && inClass) inClass = false;
    out += c;
  }
  return new RegExp(out, flags.includes("u") ? flags : `${flags}u`);
}

/**
 * Keyword list → one case-insensitive regex. Every keyword must start at the beginning of a word; a trailing
 * "$" on a keyword means it must also end a word ("sex$" matches "sex" but not "sexy").
 */
export function kw(...stems: string[]): RegExp {
  const parts = stems.map((s) => (s.endsWith("$") ? `${s.slice(0, -1)}(?![^\\W_])` : s));
  return ure(`(?<![^\\W_])(?:${parts.join("|")})`, "iu");
}

// ---------------------------------------------------------------------------
// HTML entities: the export has "&amp;", "&#39;", "&quot;" … (some double-encoded).

const ENTITIES: Record<string, string> = {
  amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", deg: "°", prime: "′", Prime: "″", rdquo: "”", ldquo: "“",
  bdquo: "„", rsquo: "’", lsquo: "‘", sbquo: "‚", laquo: "«", raquo: "»", reg: "®", trade: "™", copy: "©", ndash: "–",
  mdash: "—", hellip: "…", times: "×", divide: "÷", micro: "µ", mu: "μ", Delta: "Δ", Oslash: "Ø", oslash: "ø", eacute: "é",
  egrave: "è", Eacute: "É", aacute: "á", agrave: "à", iacute: "í", oacute: "ó", uacute: "ú", auml: "ä", ouml: "ö",
  uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß", ntilde: "ñ", ccedil: "ç", middot: "·", bull: "•", frac12: "½",
  frac14: "¼", euro: "€", plusmn: "±", sup2: "²", sup3: "³", ordf: "ª", ordm: "º", shy: "",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? ENTITIES[e.toLowerCase()] ?? m;
  });
}

// UTF-8 text that was read as cp1251 somewhere upstream (~20 rows).
const MOJIBAKE_FIXES: [string, string][] = [
  ["в„ў", "™"], ["Рњ", "М"], ["Рў", "Т"], ["вЂ™", "'"], ["вЂ“", "-"], ['вЂ"', "-"], ["вЂ”", "-"], ["Â®", "®"],
];

/** Names and brands for display: entities decoded (twice), quotes/dashes/spaces normalised, mojibake fixed. */
export function cleanText(raw: string | null | undefined): string {
  let s = raw ?? "";
  for (let i = 0; i < 2; i++) s = decodeEntities(s);
  s = s.replace(/_x000D_/g, " ").replace(/[\r\n]/g, " ");
  s = s.replace(/[’‘`´]/g, "'").replace(/[“”„]/g, '"');
  s = s.replace(/ /g, " ").replace(/[–—]/g, "-").replace(/​/g, "");
  for (const [bad, good] of MOJIBAKE_FIXES) s = s.split(bad).join(good);
  return s.replace(/\s+/g, " ").trim();
}

/** The lighter clean-up the classification rules were tuned on (entities, apostrophes, spaces). */
export function normText(raw: string | null | undefined): string {
  let s = raw ?? "";
  for (let i = 0; i < 2; i++) s = decodeEntities(s);
  s = s.replace(/[’`´]/g, "'").replace(/ /g, " ");
  return s.replace(/\s+/g, " ").trim();
}

/** First matching rule of an ordered list ([result, regex, guard?]; the guard must NOT match). */
export function firstHit<T extends string>(t: string, rules: readonly (readonly [T, RegExp, RegExp?])[]): T | null {
  for (const [slug, rx, guard] of rules) {
    if (rx.test(t) && !(guard && guard.test(t))) return slug;
  }
  return null;
}

/** The rule whose regex matches EARLIEST in the text (ties: list order). */
export function earliestHit<T extends string>(t: string, rules: readonly (readonly [T, RegExp])[]): T | null {
  let best: { at: number; slug: T } | null = null;
  for (const [slug, rx] of rules) {
    const m = rx.exec(t);
    if (m && (best === null || m.index < best.at)) best = { at: m.index, slug };
  }
  return best?.slug ?? null;
}
