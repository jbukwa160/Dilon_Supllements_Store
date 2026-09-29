// Numbers, prices and dates for the storefront, the admin panel and e-mails.
// Prices are EUR only: bg "24,90 €", en "€24.90". Dates are always shown in Bulgarian time (Europe/Sofia).
import { site } from "@/config/site";
import { INTL_LOCALE, type Lang } from "@/i18n/config";

const money = new Map<Lang, Intl.NumberFormat>();
const numbers = new Map<Lang, Intl.NumberFormat>();

function moneyFormat(lang: Lang): Intl.NumberFormat {
  let f = money.get(lang);
  if (!f) {
    f = new Intl.NumberFormat(INTL_LOCALE[lang], { style: "currency", currency: site.currency });
    money.set(lang, f);
  }
  return f;
}

export function formatPrice(v: number, lang: Lang): string {
  return moneyFormat(lang).format(v);
}

const wholeMoney = new Map<Lang, Intl.NumberFormat>();

/**
 * An amount in marketing copy (thresholds, milestone markers, "над 50 €"): whole euros without ",00" ("50 €" /
 * "€50"), cents kept otherwise ("49,99 €"). The ONLY such helper — lib/checkout and components/layout/format-amount
 * re-export it.
 */
export function formatAmount(v: number, lang: Lang): string {
  if (Math.abs(v - Math.round(v)) >= 0.005) return formatPrice(v, lang);
  let f = wholeMoney.get(lang);
  if (!f) {
    f = new Intl.NumberFormat(INTL_LOCALE[lang], { style: "currency", currency: site.currency, maximumFractionDigits: 0 });
    wholeMoney.set(lang, f);
  }
  return f.format(Math.round(v));
}

export function formatNumber(v: number, lang: Lang): string {
  let f = numbers.get(lang);
  if (!f) {
    f = new Intl.NumberFormat(INTL_LOCALE[lang], { maximumFractionDigits: 2 });
    numbers.set(lang, f);
  }
  return f.format(v);
}

function toDate(iso: string | Date): Date | null {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "29 септември 2026 г." / "29 September 2026". Empty string for an invalid date. */
export function formatDate(iso: string | Date, lang: Lang): string {
  const d = toDate(iso);
  return d ? d.toLocaleDateString(INTL_LOCALE[lang], { day: "numeric", month: "long", year: "numeric", timeZone: site.timeZone }) : "";
}

/** "29.09.2026 г., 14:05" / "29/09/2026, 14:05". Empty string for an invalid date. */
export function formatDateTime(iso: string | Date, lang: Lang): string {
  const d = toDate(iso);
  if (!d) return "";
  return d.toLocaleString(INTL_LOCALE[lang], {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: site.timeZone,
  });
}

/** Round to cents (1.005 -> 1.01, unlike a plain Math.round(x * 100) / 100). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Money is summed in integer cents (no 0.1 + 0.2 surprises) and converted back for display. */
export function toCents(n: number): number {
  return Math.round((n + Number.EPSILON) * 100);
}

export function fromCents(c: number): number {
  return c / 100;
}

/** "-20%" badge value, or null when there is no real reduction. */
export function discountPercent(price: number, oldPrice: number | null | undefined): number | null {
  if (!oldPrice || oldPrice <= price) return null;
  const pct = Math.round((1 - price / oldPrice) * 100);
  return pct > 0 ? pct : null;
}

const pluralRules = new Map<Lang, Intl.PluralRules>();

/**
 * The right form for `n` ({ one: "{n} продукт", other: "{n} продукта" }); "{n}" in the chosen form is
 * replaced with the formatted number. Bulgarian and English both only need "one" / "other".
 */
export function plural(lang: Lang, n: number, forms: { one: string; other: string }): string {
  let rules = pluralRules.get(lang);
  if (!rules) {
    rules = new Intl.PluralRules(INTL_LOCALE[lang]);
    pluralRules.set(lang, rules);
  }
  const form = rules.select(n) === "one" ? forms.one : forms.other;
  return form.replace(/\{n\}/g, formatNumber(n, lang));
}

/**
 * Unit price required next to the price when the net quantity is known: "49,80 € / кг", "€12.45 / l".
 * `sizeValue` is the whole net quantity of the pack in `sizeUnit` ("g", "kg", "ml" or "l"). Count units
 * (capsules, tablets, pieces…) have no unit price -> null.
 */
export function pricePerUnit(price: number, sizeValue: number | null | undefined, sizeUnit: string | null | undefined, lang: Lang): string | null {
  if (!(price > 0) || !sizeValue || !(sizeValue > 0) || !sizeUnit) return null;
  const unit = sizeUnit.toLowerCase();
  let base: number;
  let mass: boolean;
  if (unit === "g") [base, mass] = [sizeValue / 1000, true];
  else if (unit === "kg") [base, mass] = [sizeValue, true];
  else if (unit === "ml") [base, mass] = [sizeValue / 1000, false];
  else if (unit === "l") [base, mass] = [sizeValue, false];
  else return null;
  if (!(base > 0)) return null;
  const label = lang === "bg" ? (mass ? "кг" : "л") : mass ? "kg" : "l";
  return `${formatPrice(round2(price / base), lang)} / ${label}`;
}
