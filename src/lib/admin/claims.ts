// "Claim linter" for marketing texts (banners, announcement, promo cards): finds wording that food supplements may not
// use in advertising — disease claims, weight-loss promises, "clinically proven", generic green claims … (Reg. (EU)
// 1924/2006, Dir. 2002/46/EC Art. 6, Наредба за храните за специална употреба чл. 15, Dir. (EU) 2024/825; word list from
// the legal research §A.3). It only WARNS — the admin decides; nothing is blocked.
// Pure: safe to import from client components.

export type ClaimRule = {
  /** Regular expression source (matched case-insensitively, whole words — see `word()`). */
  pattern: RegExp;
  /** Why it is a problem, in plain Bulgarian. */
  reason: string;
};

export type ClaimHit = {
  /** The words exactly as they appear in the text. */
  match: string;
  reason: string;
};

// A "word" boundary that also works for Cyrillic (JavaScript's \b only knows Latin letters).
const L = "\\p{L}\\p{N}";
const word = (body: string) => new RegExp(`(?<![${L}])(?:${body})(?![${L}])`, "giu");

const DISEASE = "Добавките не могат да се представят като лечение или предпазване от болести.";
const WEIGHT = "Забранени са обещания за скорост или количество отслабване.";
const PROOF = "Твърдения за доказан ефект или препоръка от лекари не са позволени.";
const SAFETY = "Не може да се твърди, че продуктът е напълно безопасен или без странични ефекти.";
const DOPING = "Тези думи внушават забранени или лекарствени вещества.";
const GREEN = "Общи „зелени“ твърдения са забранени от 27.09.2026 без призната сертификация.";
const ORGANIC = "„Био“ / „органичен“ може да се ползва само за сертифицирани биологични продукти.";

/** Bulgarian and English rules. Suffix groups keep "ракета" from matching "рак", "healthy" from matching "heal" etc. */
export const CLAIM_RULES: ClaimRule[] = [
  // Disease: treat / cure / prevent
  { pattern: word("(?:из)?лекува\\p{L}*|лечени\\p{L}*|лечеб\\p{L}*|терапи\\p{L}*"), reason: DISEASE },
  { pattern: word("предпазва\\p{L}*\\s+от|предотвратява\\p{L}*|профилактика\\s+на"), reason: DISEASE },
  { pattern: word("премахва\\p{L}*\\s+(?:болест\\p{L}*|заболяван\\p{L}*)"), reason: DISEASE },
  { pattern: word("болест(?:и|та|ите)?|заболяван(?:е|ия|ето|ията)|рак(?:а|ът|ови|ово|ова)?|диабет\\p{L}*|депреси(?:я|и|ята)|артрит\\p{L}*|инфекци\\p{L}*|вирус\\p{L}*|грип(?:а|ът)?|covid(?:-19)?|ковид"), reason: DISEASE },
  { pattern: word("cur(?:e|es|ed|ing)|treat(?:s|ed|ing|ment|ments)?|heal(?:s|ed|ing)?|therap(?:y|ies|eutic)"), reason: DISEASE },
  { pattern: word("prevent(?:s|ed|ing|ion)?|protects?\\s+against"), reason: DISEASE },
  { pattern: word("diseases?|cancer|diabetes|depression|arthritis|infections?|virus(?:es)?"), reason: DISEASE },
  { pattern: word("детокс\\p{L}*|пречиства\\p{L}*\\s+организма|detox\\p{L}*|cleanse\\p{L}*"), reason: DISEASE },
  // Weight loss
  { pattern: word("изгаря\\p{L}*\\s+мазнини|отслабнете\\s+с|\\d+(?:[.,]\\d+)?\\s*(?:кг|килограма)\\s+за"), reason: WEIGHT },
  { pattern: word("гарантира\\p{L}*\\s+(?:резултат\\p{L}*|отслабване)"), reason: WEIGHT },
  { pattern: word("burns?\\s+fat|lose\\s+\\d+(?:[.,]\\d+)?\\s*(?:kg|kilos?|pounds|lbs)|guaranteed\\s+(?:results?|weight\\s+loss)"), reason: WEIGHT },
  // Proof / authority / safety
  { pattern: word("клинично\\s+доказан\\p{L}*|препоръчан\\p{L}*\\s+от\\s+лекари|clinically\\s+proven|doctors?[-\\s]recommended|recommended\\s+by\\s+doctors"), reason: PROOF },
  { pattern: word("без\\s+странични\\s+ефекти|100\\s*%\\s+безопас\\p{L}*|no\\s+side\\s+effects|100\\s*%\\s+safe"), reason: SAFETY },
  { pattern: word("анаболн?\\p{L}*|стероид\\p{L}*|sarms?|anabolic|steroids?"), reason: DOPING },
  // Green claims ("зелен чай", "green tea", "green coffee" are product names, not claims)
  { pattern: word("еко|екологич\\p{L}*|климатично\\s+неутрал\\p{L}*|природосъобраз\\p{L}*|зелен(?:а|о|и)?(?!\\s+(?:чай|кафе|ябълк\\p{L}*))"), reason: GREEN },
  { pattern: word("eco(?:-friendly)?|climate[-\\s]neutral|green(?!\\s+(?:tea|coffee|apple))"), reason: GREEN },
  // ("биологично активни вещества" is a normal label term, so only the short "био" is checked)
  { pattern: word("био|органич\\p{L}*|organic"), reason: ORGANIC },
];

/**
 * Problem wording in one text, in order of appearance: each distinct match once, and a match inside a longer one
 * already found ("болести" in "премахва болести") is left out.
 */
export function findClaims(text: string): ClaimHit[] {
  if (!text.trim()) return [];
  const hits: (ClaimHit & { from: number; to: number })[] = [];
  const seen = new Set<string>();
  for (const rule of CLAIM_RULES) {
    for (const m of text.matchAll(rule.pattern)) {
      const from = m.index ?? 0;
      const to = from + m[0].length;
      const key = m[0].toLowerCase();
      if (seen.has(key) || hits.some((h) => from < h.to && to > h.from)) continue;
      seen.add(key);
      hits.push({ match: m[0], reason: rule.reason, from, to });
    }
  }
  return hits.sort((a, b) => a.from - b.from).map(({ match, reason }) => ({ match, reason }));
}
