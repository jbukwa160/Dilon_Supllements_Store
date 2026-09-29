// Technical constants. Store name, contacts, shipping prices and texts are edited in the
// admin panel (Настройки) — defaults live in src/lib/settings-types.ts.
export const site = {
  /** Public address without a trailing slash (canonical URLs, sitemap, links in e-mails). */
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, ""),
  currency: "EUR",
  /** Dates and times are always shown in Bulgarian time, on the server and in the browser alike. */
  timeZone: "Europe/Sofia",
};
