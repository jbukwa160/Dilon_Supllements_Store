// Safe output of data inside HTML: JSON-LD <script> blocks and text in e-mails.

/**
 * JSON for `<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(data) }} />`.
 * "<" is escaped so a product name like "</script><script>…" cannot close the tag; U+2028/U+2029 too.
 */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/[<>&\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Text for HTML (e-mail bodies built by hand). */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}
