// Fill in defaults and sanitise admin-provided settings. Used when reading and before saving; never throws.
import { normL10n, type L10n } from "./l10n";
import { safeHref, isExternalHref } from "./links";
import {
  DEFAULT_APPEARANCE,
  DEFAULT_CHAT,
  DEFAULT_GIFT_TIERS,
  DEFAULT_HOME,
  DEFAULT_MENU,
  DEFAULT_SETTINGS,
  MENU_ICONS,
  MENU_STYLES,
  THEMES,
  parseColor,
  type ChatSettings,
  type GiftTier,
  type GiftTierSettings,
  type HeroSlide,
  type HomeContent,
  type MenuAppearance,
  type MenuColumn,
  type MenuConfig,
  type MenuIconName,
  type MenuItem,
  type MenuItemKind,
  type MenuStyle,
  type PromoCard,
  type StoreSettings,
  type ThemeKey,
} from "./settings-types";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const obj = (v: unknown): Obj => (isObj(v) ? v : {});

function str(v: unknown, fallback: string, max = 300): string {
  return typeof v === "string" ? v.trim().slice(0, max) : fallback;
}
function num(v: unknown, fallback: number, min = 0, max = 1_000_000): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v.replace(/\s/g, "").replace(",", ".")) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 100) / 100)) : fallback;
}
function int(v: unknown, fallback: number, min: number, max: number): number {
  return Math.round(num(v, fallback, min, max));
}
function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}
function href(v: unknown, fallback: string): string {
  if (typeof v !== "string") return fallback;
  return safeHref(v) ?? fallback;
}
/** An https:// profile link (social networks), else "". */
function webLink(v: unknown): string {
  const h = typeof v === "string" ? safeHref(v.slice(0, 300)) : null;
  return h && isExternalHref(h) ? h : "";
}
function theme(v: unknown, fallback: ThemeKey): ThemeKey {
  return typeof v === "string" && v in THEMES ? (v as ThemeKey) : fallback;
}
/** Image: an uploaded file (/uploads/…) or an http(s) address. */
export function normalizeImage(v: unknown): string {
  if (typeof v !== "string") return "";
  const t = v.trim();
  if (/^\/uploads\/[a-z0-9]+\.[a-z]+$/.test(t)) return t;
  if (/^https?:\/\/[^\s<>"]+$/i.test(t)) return t.slice(0, 1000);
  return "";
}
function id(v: unknown, i: number): string {
  return typeof v === "string" && /^[\w-]{1,40}$/.test(v) ? v : `i${i}-${Date.now().toString(36)}`;
}
/** L10n with a fallback for a missing value (plain strings from older saves are accepted as Bulgarian). */
function text(v: unknown, fallback: L10n, max: number): L10n {
  return v === undefined || v === null ? fallback : normL10n(v, max);
}
/**
 * A bilingual company detail (Настройки → Фирмени данни). Plain strings saved before the field became bilingual are
 * read as Bulgarian; a value still equal to the Bulgarian default (a placeholder, or "ОДБХ – София-град") also gets
 * the default's English text instead of showing Bulgarian on the English pages.
 */
function companyText(v: unknown, fallback: L10n, max: number): L10n {
  const t = text(v, fallback, max);
  return !t.en && t.bg === fallback.bg ? { bg: t.bg, en: fallback.en } : t;
}
/** Like text(), but the Bulgarian half is required: empty → the fallback. */
function requiredText(v: unknown, fallback: L10n, max: number): L10n {
  const t = text(v, fallback, max);
  return t.bg ? t : fallback;
}
/** Per-language image (an image-only banner usually has text baked in); a plain string = both languages' Bulgarian picture. */
function imageL10n(v: unknown): L10n {
  if (typeof v === "string") return { bg: normalizeImage(v), en: "" };
  const o = obj(v);
  return { bg: normalizeImage(o.bg), en: normalizeImage(o.en) };
}
/** "YYYY-MM-DD" of a real calendar day, else null. */
function day(v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null;
}
function skuList(v: unknown, max: number): string[] {
  const list = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim() && x.length <= 60).map((x) => x.trim()) : [];
  return [...new Set(list)].slice(0, max);
}

// ---------------------------------------------------------------------------

export function normalizeSettings(raw: unknown): StoreSettings {
  const r = obj(raw);
  const d = DEFAULT_SETTINGS;
  const company = obj(r.company);
  const shipping = obj(r.shipping);
  const bank = obj(r.bank);
  const social = obj(r.social);
  const tracking = obj(r.tracking);
  const ga4 = str(tracking.ga4Id, "", 30).toUpperCase();
  const pixel = str(tracking.metaPixelId, "", 30);
  return {
    name: str(r.name, d.name, 60) || d.name,
    tagline: text(r.tagline, d.tagline, 120),
    description: text(r.description, d.description, 400),
    phone: str(r.phone, d.phone, 40),
    email: str(r.email, d.email, 120),
    address: text(r.address, d.address, 200),
    workingHours: text(r.workingHours, d.workingHours, 120),
    company: {
      legalName: companyText(company.legalName, d.company.legalName, 200),
      eik: str(company.eik, d.company.eik, 40),
      vatNumber: str(company.vatNumber, d.company.vatNumber, 40),
      registeredAddress: companyText(company.registeredAddress, d.company.registeredAddress, 300),
      representative: companyText(company.representative, d.company.representative, 120),
      foodRegistration: companyText(company.foodRegistration, d.company.foodRegistration, 200),
      babhRegNo: str(company.babhRegNo, d.company.babhRegNo, 80),
      babhAuthority: companyText(company.babhAuthority, d.company.babhAuthority, 120),
      returnAddress: companyText(company.returnAddress, d.company.returnAddress, 300),
      privacyEmail: str(company.privacyEmail, d.company.privacyEmail, 120),
    },
    shipping: {
      // null / "" = no free delivery; a missing key = the default.
      freeOver:
        shipping.freeOver === null || shipping.freeOver === ""
          ? null
          : shipping.freeOver === undefined
            ? d.shipping.freeOver
            : num(shipping.freeOver, d.shipping.freeOver ?? 0, 0, 100000),
      freeScope: shipping.freeScope === "office" ? "office" : "all",
      office: num(shipping.office, d.shipping.office, 0, 1000),
      address: num(shipping.address, d.shipping.address, 0, 1000),
      mode: shipping.mode === "fixed" ? "fixed" : "courier",
    },
    returnDays: int(r.returnDays, d.returnDays, 14, 365),
    deliveryDays: text(r.deliveryDays, d.deliveryDays, 60),
    allowOutOfStockOrders: bool(r.allowOutOfStockOrders, d.allowOutOfStockOrders),
    showDemoNotice: bool(r.showDemoNotice, d.showDemoNotice),
    hideNoImage: bool(r.hideNoImage, d.hideNoImage),
    bank: {
      holder: str(bank.holder, d.bank.holder, 120),
      iban: str(bank.iban, d.bank.iban, 42).replace(/\s+/g, " ").toUpperCase(),
      bic: str(bank.bic, d.bank.bic, 20).toUpperCase(),
      bank: str(bank.bank, d.bank.bank, 120),
    },
    social: {
      facebook: webLink(social.facebook),
      instagram: webLink(social.instagram),
      tiktok: webLink(social.tiktok),
      youtube: webLink(social.youtube),
    },
    tracking: {
      consentVersion: int(tracking.consentVersion, d.tracking.consentVersion, 1, 10000),
      ga4Id: /^G-[A-Z0-9]{4,20}$/.test(ga4) ? ga4 : "",
      metaPixelId: /^\d{5,20}$/.test(pixel) ? pixel : "",
    },
  };
}

// ---------------------------------------------------------------------------
// Home page

function button(v: unknown, fallback: { label: L10n; href: string }) {
  const b = obj(v);
  return { label: text(b.label, fallback.label, 60), href: href(b.href, fallback.href) };
}

const NO_TEXT: L10n = { bg: "", en: "" };

export function normalizeSlide(raw: unknown, i: number): HeroSlide {
  const r = obj(raw);
  return {
    id: id(r.id, i),
    enabled: bool(r.enabled, true),
    layout: r.layout === "image-only" ? "image-only" : "text-image",
    eyebrow: text(r.eyebrow, NO_TEXT, 120),
    title: text(r.title, NO_TEXT, 120),
    highlight: text(r.highlight, NO_TEXT, 80),
    text: text(r.text, NO_TEXT, 400),
    image: imageL10n(r.image),
    mobileImage: imageL10n(r.mobileImage),
    href: href(r.href, ""),
    theme: theme(r.theme, "sunrise"),
    primary: button(r.primary, { label: NO_TEXT, href: "" }),
    secondary: button(r.secondary, { label: NO_TEXT, href: "" }),
  };
}

export function normalizePromo(raw: unknown, i: number): PromoCard {
  const r = obj(raw);
  return {
    id: id(r.id, i),
    enabled: bool(r.enabled, true),
    title: text(r.title, NO_TEXT, 80),
    text: text(r.text, NO_TEXT, 200),
    image: normalizeImage(r.image),
    href: href(r.href, ""),
    buttonLabel: text(r.buttonLabel, NO_TEXT, 40),
    theme: theme(r.theme, "sunrise"),
  };
}

export function normalizeHome(raw: unknown): HomeContent {
  if (!isObj(raw)) return DEFAULT_HOME;
  const d = DEFAULT_HOME;
  const a = obj(raw.announcement);
  const s = obj(raw.sections);
  const sections = { ...d.sections };
  for (const k of Object.keys(sections) as (keyof typeof sections)[]) sections[k] = bool(s[k], d.sections[k]);
  return {
    announcement: {
      enabled: bool(a.enabled, d.announcement.enabled),
      text: text(a.text, d.announcement.text, 200),
      href: href(a.href, d.announcement.href),
      theme: theme(a.theme, d.announcement.theme),
    },
    slides: Array.isArray(raw.slides) ? raw.slides.slice(0, 10).map(normalizeSlide) : d.slides,
    autoplaySeconds: int(raw.autoplaySeconds, d.autoplaySeconds, 0, 60),
    promos: Array.isArray(raw.promos) ? raw.promos.slice(0, 6).map(normalizePromo) : d.promos,
    sections,
  };
}

// ---------------------------------------------------------------------------
// Gift tiers

export function normalizeGiftTier(raw: unknown, i: number): GiftTier {
  const r = obj(raw);
  const d = DEFAULT_GIFT_TIERS.tiers[0];
  return {
    id: id(r.id, i),
    enabled: bool(r.enabled, true),
    threshold: num(r.threshold, d.threshold, 0.01, 100000),
    title: requiredText(r.title, d.title, 80),
    note: text(r.note, NO_TEXT, 160),
    skus: skuList(r.skus, 24),
  };
}

export function normalizeGiftTiers(raw: unknown): GiftTierSettings {
  if (!isObj(raw)) return DEFAULT_GIFT_TIERS;
  const d = DEFAULT_GIFT_TIERS;
  const seenThreshold = new Set<number>();
  const seenId = new Set<string>();
  const tiers = (Array.isArray(raw.tiers) ? raw.tiers : d.tiers)
    .slice(0, 12)
    .map(normalizeGiftTier)
    .filter((t) => {
      // Two tiers with the same threshold (or id) make no sense: keep the first.
      if (seenThreshold.has(t.threshold) || seenId.has(t.id)) return false;
      seenThreshold.add(t.threshold);
      seenId.add(t.id);
      return true;
    })
    .sort((a, b) => a.threshold - b.threshold)
    .slice(0, 6);
  return {
    enabled: bool(raw.enabled, d.enabled),
    mode: raw.mode === "single" ? "single" : "perTier",
    startsAt: day(raw.startsAt),
    endsAt: day(raw.endsAt),
    showBar: bool(raw.showBar, d.showBar),
    headline: requiredText(raw.headline, d.headline, 80),
    tiers,
  };
}

// ---------------------------------------------------------------------------
// Menu

function color(v: unknown, fallback: string): string {
  return (typeof v === "string" && parseColor(v)) || fallback;
}

function appearance(raw: unknown, fallback: MenuAppearance): MenuAppearance {
  const r = obj(raw);
  return {
    style: typeof r.style === "string" && r.style in MENU_STYLES ? (r.style as MenuStyle) : fallback.style,
    color: color(r.color, fallback.color),
    color2: color(r.color2, fallback.color2),
    icon: typeof r.icon === "string" && (MENU_ICONS as readonly string[]).includes(r.icon) ? (r.icon as MenuIconName) : fallback.icon,
  };
}

function column(raw: unknown, i: number): MenuColumn {
  const r = obj(raw);
  const links = Array.isArray(r.links) ? r.links : [];
  return {
    id: id(r.id, i),
    kind: r.kind === "image" ? "image" : "links",
    title: text(r.title, NO_TEXT, 60),
    href: href(r.href, ""),
    image: normalizeImage(r.image),
    links: links
      .slice(0, 15)
      .map((l, k) => {
        const o = obj(l);
        return { id: id(o.id, k), label: text(o.label, NO_TEXT, 60), href: href(o.href, "") };
      })
      .filter((l) => l.label.bg && l.href),
  };
}

function menuItem(raw: unknown, i: number): MenuItem | null {
  const r = obj(raw);
  // Old saved menus may still hold a "gifts" item (the removed gift ideas panel) — drop it.
  if (r.kind === "gifts") return null;
  const kind: MenuItemKind = r.kind === "dropdown" ? "dropdown" : "link";
  const label = text(r.label, NO_TEXT, 40);
  if (!label.bg) return null;
  const item: MenuItem = {
    id: id(r.id, i),
    kind,
    label,
    href: href(r.href, ""),
    appearance: appearance(r.appearance, DEFAULT_APPEARANCE),
    columns: kind === "dropdown" && Array.isArray(r.columns) ? r.columns.slice(0, 5).map(column) : [],
  };
  if (kind === "link" && !item.href) return null;
  return item;
}

export function normalizeMenu(raw: unknown): MenuConfig {
  if (!isObj(raw)) return DEFAULT_MENU;
  const c = obj(raw.categories);
  const items = (Array.isArray(raw.items) ? raw.items : []).slice(0, 14).map(menuItem).filter((x): x is MenuItem => !!x);
  return {
    categories: {
      show: bool(c.show, true),
      label: requiredText(c.label, DEFAULT_MENU.categories.label, 40),
      color: color(c.color, DEFAULT_MENU.categories.color),
    },
    items,
  };
}

// ---------------------------------------------------------------------------
// Chat

export function normalizeChat(raw: unknown): ChatSettings {
  const r = obj(raw);
  const d = DEFAULT_CHAT;
  const questions = Array.isArray(r.quickQuestions)
    ? r.quickQuestions
        .map((q) => normL10n(q, 120))
        .filter((q) => q.bg)
        .slice(0, 6)
    : d.quickQuestions;
  return {
    enabled: bool(r.enabled, d.enabled),
    title: requiredText(r.title, d.title, 40),
    greeting: text(r.greeting, d.greeting, 400),
    offlineText: text(r.offlineText, d.offlineText, 300),
    quickQuestions: questions,
    askContact: bool(r.askContact, d.askContact),
  };
}
