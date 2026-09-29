// The blog's text format — a small, safe subset of Markdown the admin writes with toolbar buttons:
//
//   ## Заглавие            ### Подзаглавие
//   **удебелен**  *курсив*  [текст](/kategoria/pazeli)
//   - точка               1. стъпка
//   > Съвет: …            (цветна кутия)
//   ![описание](/uploads/…)
//   [[продукти: Dilon-1, Dilon-2]]      [[бутон: Текст | /адрес]]
//   (English posts may write [[products: …]] and [[button: …]]; both spellings work in either language.)
//
// Blocks are separated by empty lines; a single line break inside a paragraph is kept. Links are stored
// language-neutral ("/kategoria/proteini"); BlogBody adds "/en" on English pages.
// Used on the site and in the admin preview, so it has no server-only imports.
import { safeHref } from "./links";
import { slugify } from "./slug";

export type Inline = { t: "text"; v: string } | { t: "br" } | { t: "b" | "i"; c: Inline[] } | { t: "a"; href: string; c: Inline[] };

export type Block =
  | { type: "h2" | "h3"; text: string; id: string }
  | { type: "p"; c: Inline[] }
  | { type: "ul" | "ol"; items: Inline[][] }
  | { type: "quote"; c: Inline[] }
  | { type: "image"; src: string; alt: string }
  | { type: "products"; skus: string[] }
  | { type: "button"; label: string; href: string };

const INLINE_RE = /\*\*(.+?)\*\*|\[([^\]\n]+)\]\(([^)\s]+)\)|\*([^*\s](?:[^*\n]*[^*\s])?)\*/g;

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  const text = (v: string) => {
    v.split("\n").forEach((part, i) => {
      if (i > 0) out.push({ t: "br" });
      if (part) out.push({ t: "text", v: part });
    });
  };
  let last = 0;
  for (const m of s.matchAll(INLINE_RE)) {
    text(s.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[1] !== undefined) out.push({ t: "b", c: parseInline(m[1]) });
    else if (m[2] !== undefined) {
      const href = safeHref(m[3]);
      // safeHref returns "" for an empty target: that is not a link either.
      if (href) out.push({ t: "a", href, c: parseInline(m[2]) });
      else text(m[2]);
    } else out.push({ t: "i", c: parseInline(m[4]) });
  }
  text(s.slice(last));
  return out;
}

/** Only pictures uploaded in the admin or https addresses. */
function safeImage(src: string): string | null {
  if (/^\/uploads\/[a-z0-9]+\.[a-z]+$/.test(src)) return src;
  if (/^https:\/\/[^\s<>"]+$/i.test(src)) return src;
  return null;
}

function special(line: string): Block | null {
  const m = line.match(/^\[\[\s*([^:\]]+?)\s*:\s*(.*?)\s*\]\]$/);
  if (!m) return null;
  const kind = m[1].toLowerCase();
  if (kind === "продукти" || kind === "products") {
    const skus = m[2].split(/[,;\s]+/).map((s) => s.trim()).filter((s) => /^[\w.-]{2,60}$/.test(s)).slice(0, 12);
    return skus.length ? { type: "products", skus } : null;
  }
  if (kind === "бутон" || kind === "button") {
    const [label, rawHref] = m[2].split("|").map((s) => s.trim());
    const href = rawHref ? safeHref(rawHref) : null;
    return label && href ? { type: "button", label: label.slice(0, 80), href } : null;
  }
  return null;
}

export function parseBody(body: string): Block[] {
  const blocks: Block[] = [];
  const ids = new Map<string, number>();
  const headingId = (text: string) => {
    const base = slugify(text, 60) || "razdel";
    const n = (ids.get(base) ?? 0) + 1;
    ids.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  };
  let para: string[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;
  let quote: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ type: "p", c: parseInline(para.join("\n")) });
    if (list) blocks.push({ type: list.type, items: list.items.map(parseInline) });
    if (quote.length) blocks.push({ type: "quote", c: parseInline(quote.join("\n")) });
    para = [];
    list = null;
    quote = [];
  };

  for (const raw of body.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^(#{2,3})\s+(.+)$/))) {
      flush();
      const text = m[2].replace(/\s+#+$/, "").trim();
      blocks.push({ type: m[1].length === 2 ? "h2" : "h3", text, id: headingId(text) });
    } else if (/^#\s+/.test(line)) {
      // A single # would be a second page title; treat it as a section heading.
      flush();
      const text = line.replace(/^#\s+/, "");
      blocks.push({ type: "h2", text, id: headingId(text) });
    } else if (line.startsWith("[[") && special(line)) {
      flush();
      blocks.push(special(line)!);
    } else if ((m = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/))) {
      flush();
      const src = safeImage(m[2]);
      if (src) blocks.push({ type: "image", src, alt: m[1].trim() });
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      if (para.length || list) flush();
      quote.push(m[1]);
    } else if ((m = line.match(/^[-*•]\s+(.+)$/))) {
      if (para.length || quote.length || list?.type === "ol") flush();
      list ??= { type: "ul", items: [] };
      list.items.push(m[1]);
    } else if ((m = line.match(/^\d{1,3}[.)]\s+(.+)$/))) {
      if (para.length || quote.length || list?.type === "ul") flush();
      list ??= { type: "ol", items: [] };
      list.items.push(m[1]);
    } else {
      if (list || quote.length) flush();
      para.push(line);
    }
  }
  flush();
  return blocks;
}

export function headings(blocks: Block[]): { id: string; text: string; level: 2 | 3 }[] {
  return blocks.flatMap((b) => (b.type === "h2" || b.type === "h3" ? [{ id: b.id, text: b.text, level: b.type === "h2" ? 2 : 3 } as const] : []));
}

export function productSkus(blocks: Block[]): string[] {
  return [...new Set(blocks.flatMap((b) => (b.type === "products" ? b.skus : [])))];
}

export function inlineText(c: Inline[]): string {
  return c.map((n) => (n.t === "text" ? n.v : n.t === "br" ? " " : n.t === "a" || n.t === "b" || n.t === "i" ? inlineText(n.c) : "")).join("");
}

const FAQ_HEADING = /често задавани въпроси|въпроси и отговори|frequently asked questions|questions and answers|^faqs?$/i;

/** Questions and answers under a "Често задавани въпроси" / "Frequently asked questions" section (### question + the paragraphs after it). */
export function faq(blocks: Block[]): { q: string; a: string }[] {
  const out: { q: string; a: string }[] = [];
  let inFaq = false;
  for (const b of blocks) {
    if (b.type === "h2") inFaq = FAQ_HEADING.test(b.text.trim());
    else if (inFaq && b.type === "h3") out.push({ q: b.text, a: "" });
    else if (inFaq && out.length && (b.type === "p" || b.type === "quote")) {
      const last = out[out.length - 1];
      last.a = `${last.a} ${inlineText(b.c)}`.trim();
    }
  }
  return out.filter((x) => x.a);
}

export function plainText(body: string): string {
  return body
    .replace(/\[\[[^\]]*\]\]/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function wordCount(body: string): number {
  const t = plainText(body);
  return t ? t.split(" ").length : 0;
}

export function readingMinutes(body: string): number {
  return Math.max(1, Math.round(wordCount(body) / 200));
}
