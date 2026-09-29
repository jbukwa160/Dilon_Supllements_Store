import "server-only";
import { site } from "@/config/site";
import { INTL_LOCALE, type Lang } from "@/i18n/config";
import { COURIERS, courierName } from "@/lib/checkout";
import { formatDate, formatPrice } from "@/lib/format";
import { loc } from "@/lib/l10n";
import { RETENTION } from "@/lib/retention";
import { localizeHref } from "@/lib/links";
import { getGiftTiers, getSettings } from "@/lib/settings";
import { companyInfo } from "@/lib/settings-types";

// Everything the legal / info texts insert, taken from the admin settings (Настройки, Цени и промоции) and already
// formatted for the page's language. The texts themselves are per-language components in ./legal.

/** Revision date of the legal texts (shown as "Последна актуализация"). Change it with every material edit. */
export const LEGAL_UPDATED = "2026-09-29";

/**
 * Commitments the texts make that are not admin settings. They must match what the business really does.
 * [ЮРИСТ] / owner: confirm every value before go-live (legal-content.md §A.7 retention anchors, §D item 8).
 */
export const LEGAL_POLICY = {
  /** Orders, invoices data: general limitation period for claims (ЗЗД чл. 110). Not purged automatically. */
  ordersYears: RETENTION.ordersYears,
  /** Withdrawals, complaints and support cases after the case is closed. */
  casesYears: RETENTION.casesYears,
  /** Chat conversations that are not linked to an order. */
  chatMonths: RETENTION.chatMonths,
  /** Security logs (sign-in attempts, IP addresses). */
  logsMonths: RETENTION.logsMonths,
  /** Newsletter consent proof after unsubscribing. */
  consentProofYears: RETENTION.consentProofYears,
  /** Newsletter sign-ups that were never confirmed. */
  pendingNewsletterDays: RETENTION.pendingNewsletterDays,
} as const;

export type LegalCtx = {
  lang: Lang;
  /** Localized storefront link: ctx.href("/vrashtane") → "/en/vrashtane" on English pages. */
  href: (path: string) => string;
  updated: string;
  store: {
    name: string;
    /** "shop.example" (no protocol). */
    domain: string;
    url: string;
    email: string;
    phone: string;
    /** "tel:+359…" friendly value. */
    phoneHref: string;
    /** Correspondence and complaints address. */
    address: string;
    hours: string;
    privacyEmail: string;
  };
  company: {
    legalName: string;
    eik: string;
    vatNumber: string;
    registeredAddress: string;
    representative: string;
    foodRegistration: string;
    babhRegNo: string;
    babhAuthority: string;
  };
  /** Where returned goods go (the correspondence address when not set). */
  returnAddress: string;
  /** Withdrawal period in days (never below the statutory 14). */
  returnDays: number;
  deliveryDays: string;
  /** "Еконт и Спиди" / "Econt and Speedy". */
  couriers: string;
  shipping: {
    mode: "courier" | "fixed";
    office: string;
    address: string;
    /** Formatted threshold, or null when delivery is never free. */
    freeOver: string | null;
    /** The threshold is 0: delivery is free for every order (within freeScope). */
    freeAll: boolean;
    freeScope: "all" | "office";
  };
  /** Bank-transfer details, or null when the IBAN is not filled in. */
  bank: { holder: string; iban: string; bic: string; bank: string } | null;
  gifts: {
    /** A threshold-gift campaign is running now. */
    active: boolean;
    mode: "perTier" | "single";
    /** "40 €, 60 € и 80 €" (empty when there are no enabled tiers). */
    thresholds: string;
    /** Campaign window (formatted dates) or null. */
    from: string | null;
    to: string | null;
  };
  /** Analytics / marketing tags configured in Настройки (they load only after consent). */
  tracking: { ga4: boolean; metaPixel: boolean };
  policy: typeof LEGAL_POLICY;
};

/** "a, b и c" / "a, b and c". */
export function listJoin(items: string[], lang: Lang): string {
  if (items.length < 2) return items.join("");
  return new Intl.ListFormat(INTL_LOCALE[lang], { style: "long", type: "conjunction" }).format(items);
}

/** Today in Bulgaria as YYYY-MM-DD (gift campaign windows are Sofia dates). */
function sofiaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: site.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function getLegalContext(lang: Lang): LegalCtx {
  const s = getSettings();
  // Bilingual company details (legal name, addresses, БАБХ authority…) in the page's language.
  const c = companyInfo(s, lang);
  const gt = getGiftTiers();
  const tiers = gt.tiers.filter((t) => t.enabled && t.threshold > 0).sort((a, b) => a.threshold - b.threshold);
  const today = sofiaToday();
  const inWindow = (!gt.startsAt || gt.startsAt <= today) && (!gt.endsAt || gt.endsAt >= today);
  const address = loc(s.address, lang);

  return {
    lang,
    href: (path) => localizeHref(path, lang),
    updated: formatDate(`${LEGAL_UPDATED}T12:00:00Z`, lang),
    store: {
      name: s.name,
      domain: site.url.replace(/^https?:\/\//, ""),
      url: site.url,
      email: s.email,
      phone: s.phone,
      phoneHref: `tel:${s.phone.replace(/[^\d+]/g, "")}`,
      address,
      hours: loc(s.workingHours, lang),
      privacyEmail: c.privacyEmail || s.email,
    },
    company: {
      legalName: c.legalName,
      eik: c.eik,
      vatNumber: c.vatNumber,
      registeredAddress: c.registeredAddress,
      representative: c.representative,
      foodRegistration: c.foodRegistration,
      babhRegNo: c.babhRegNo,
      babhAuthority: c.babhAuthority,
    },
    returnAddress: c.returnAddress || address,
    returnDays: Math.max(14, s.returnDays),
    deliveryDays: loc(s.deliveryDays, lang),
    couriers: listJoin(
      COURIERS.map((k) => courierName(k, lang)),
      lang,
    ),
    shipping: {
      mode: s.shipping.mode,
      office: formatPrice(s.shipping.office, lang),
      address: formatPrice(s.shipping.address, lang),
      freeOver: s.shipping.freeOver === null ? null : formatPrice(s.shipping.freeOver, lang),
      freeAll: s.shipping.freeOver !== null && s.shipping.freeOver <= 0,
      freeScope: s.shipping.freeScope,
    },
    bank: s.bank.iban.trim() ? { ...s.bank } : null,
    gifts: {
      active: gt.enabled && tiers.length > 0 && inWindow,
      mode: gt.mode,
      thresholds: listJoin(
        tiers.map((t) => formatPrice(t.threshold, lang)),
        lang,
      ),
      from: gt.startsAt ? formatDate(`${gt.startsAt}T12:00:00Z`, lang) : null,
      to: gt.endsAt ? formatDate(`${gt.endsAt}T12:00:00Z`, lang) : null,
    },
    tracking: { ga4: !!s.tracking.ga4Id.trim(), metaPixel: !!s.tracking.metaPixelId.trim() },
    policy: LEGAL_POLICY,
  };
}
