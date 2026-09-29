// Bulgarian → Latin (official streamlined system) so URLs stay readable.
// Slugs never contain a "." — the proxy treats a last path segment with a dot as a file and skips it.
const MAP: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
  ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sht", ъ: "a", ь: "y", ю: "yu", я: "ya",
  ё: "yo", ы: "y", э: "e",
};

export function transliterate(input: string): string {
  let out = "";
  for (const ch of input.toLowerCase()) out += MAP[ch] ?? ch;
  return out;
}

export function slugify(input: string, maxLength = 80): string {
  const s = transliterate(input)
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[̀-ͯ]/g, "")
    .replace(/[®™©]/g, "")
    .replace(/&/g, " i ")
    // Everything that is not a Latin letter or digit (dots included) becomes a separator.
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (s.length <= maxLength) return s;
  return s.slice(0, maxLength).replace(/-[^-]*$/, "");
}
