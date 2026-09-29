// Types + defaults for everything the admin can edit (store info, home page, menu, gift tiers, chat).
// Texts shown in the shop are L10n ({ bg, en }; empty English falls back to Bulgarian).
// Pure data: safe to import from client components, server code and scripts.
import type { Lang } from "@/i18n/config";
import { loc, type L10n } from "./l10n";

export type { L10n } from "./l10n";
// Ported admin code imports these from here (as in /web).
export { safeHref, isExternalHref } from "./links";

// ---------------------------------------------------------------------------
// Store (Admin → Настройки)

export type StoreSettings = {
  name: string;
  tagline: L10n;
  description: L10n;
  phone: string;
  email: string;
  /** Address for correspondence and complaints. */
  address: L10n;
  workingHours: L10n;
  /**
   * The trader's details required by law. Texts that differ between the languages are L10n (English empty = the
   * Bulgarian text); read them for a page with companyInfo(settings, lang). Settings saved while these were plain
   * strings are read as the Bulgarian half (settings-normalize).
   */
  company: {
    /** Registered name; English = its Latin spelling in the Commercial Register ("Dilon EOOD"). */
    legalName: L10n;
    eik: string;
    /** "" when the company is not VAT-registered. */
    vatNumber: string;
    registeredAddress: L10n;
    representative: L10n;
    /** Registration certificate of the food business (number and date), shown in the Terms. */
    foodRegistration: L10n;
    /** Registration no. for distance selling of food (register under Art. 24(1) of the Food Act). Footer + product pages. */
    babhRegNo: string;
    /** Regional food safety directorate that issued it, e.g. "ОДБХ – София-град". */
    babhAuthority: L10n;
    /** Where returned goods are sent (empty = the correspondence address). */
    returnAddress: L10n;
    /** Contact for personal-data requests ("" = the store e-mail). */
    privacyEmail: string;
  };
  /**
   * freeOver: free delivery from this order value (the qualifying subtotal), null = never free.
   * freeScope: "office" = free only to an office / locker. mode "courier": live price from Speedy/Econt
   * (fixed prices are the fallback); "fixed": always the fixed prices.
   */
  shipping: { freeOver: number | null; freeScope: "all" | "office"; office: number; address: number; mode: "courier" | "fixed" };
  returnDays: number;
  deliveryDays: L10n;
  allowOutOfStockOrders: boolean;
  showDemoNotice: boolean;
  /**
   * Leave products without a picture out of the shop's listings, shelves, search, sitemap, gift pickers and blog cards
   * (their pages still open — marked noindex — so carts, orders and old links keep working). The admin list is unaffected.
   */
  hideNoImage: boolean;
  /** Shown for "Банков превод" orders. */
  bank: { holder: string; iban: string; bic: string; bank: string };
  social: { facebook: string; instagram: string; tiktok: string; youtube: string };
  /** Analytics / marketing scripts load only after consent. Bumping consentVersion asks every visitor again. */
  tracking: { consentVersion: number; ga4Id: string; metaPixelId: string };
};

export const DEFAULT_SETTINGS: StoreSettings = {
  name: "Dilon Nutrition",
  tagline: { bg: "Хранителни добавки и спортно хранене", en: "Supplements & sports nutrition" },
  description: {
    bg: "Онлайн магазин за хранителни добавки, протеини, витамини и спортно хранене от водещи марки — с подарък по избор при поръчка над 40 € и доставка до офис, автомат или адрес.",
    en: "Online shop for food supplements, protein, vitamins and sports nutrition from leading brands — with a free gift of your choice on orders over €40 and delivery to an office, locker or address.",
  },
  phone: "0700 00 000",
  email: "shop@dilonltd.com",
  address: { bg: "София, България", en: "Sofia, Bulgaria" },
  workingHours: { bg: "Пон – Пет: 9:00 – 18:00", en: "Mon – Fri: 9:00 – 18:00" },
  company: {
    legalName: { bg: "[Наименование на търговеца]", en: "[Trader's registered name]" },
    eik: "[ЕИК]",
    vatNumber: "",
    registeredAddress: { bg: "[Адрес на управление]", en: "[Registered office address]" },
    representative: { bg: "", en: "" },
    foodRegistration: { bg: "", en: "" },
    babhRegNo: "[Рег. № в БАБХ]",
    babhAuthority: { bg: "ОДБХ – София-град", en: "Regional Food Safety Directorate (ODBH) – Sofia City" },
    returnAddress: { bg: "", en: "" },
    privacyEmail: "",
  },
  shipping: { freeOver: 50, freeScope: "all", office: 3.99, address: 5.99, mode: "courier" },
  returnDays: 14,
  deliveryDays: { bg: "1–3 работни дни", en: "1–3 working days" },
  allowOutOfStockOrders: false,
  showDemoNotice: true,
  hideNoImage: true,
  bank: { holder: "", iban: "", bic: "", bank: "" },
  social: { facebook: "", instagram: "", tiktok: "", youtube: "" },
  tracking: { consentVersion: 1, ga4Id: "", metaPixelId: "" },
};

/** The trader's details as plain text in one language (footer, legal texts, e-mails, structured data). */
export type CompanyInfo = { [K in keyof StoreSettings["company"]]: string };

/** Settings → Фирмени данни for a page in `lang` (English texts fall back to the Bulgarian ones). */
export function companyInfo(s: StoreSettings, lang: Lang): CompanyInfo {
  const c = s.company;
  return {
    legalName: loc(c.legalName, lang),
    eik: c.eik,
    vatNumber: c.vatNumber,
    registeredAddress: loc(c.registeredAddress, lang),
    representative: loc(c.representative, lang),
    foodRegistration: loc(c.foodRegistration, lang),
    babhRegNo: c.babhRegNo,
    babhAuthority: loc(c.babhAuthority, lang),
    returnAddress: loc(c.returnAddress, lang),
    privacyEmail: c.privacyEmail,
  };
}

/** The subset client components need (passed through React context), with texts already in the page's language. */
export type PublicSettings = {
  name: string;
  tagline: string;
  phone: string;
  email: string;
  shipping: StoreSettings["shipping"];
  returnDays: number;
  deliveryDays: string;
  allowOutOfStockOrders: boolean;
  social: StoreSettings["social"];
  tracking: StoreSettings["tracking"];
};

export function publicSettings(s: StoreSettings, lang: Lang = "bg"): PublicSettings {
  return {
    name: s.name,
    tagline: loc(s.tagline, lang),
    phone: s.phone,
    email: s.email,
    shipping: s.shipping,
    returnDays: s.returnDays,
    deliveryDays: loc(s.deliveryDays, lang),
    allowOutOfStockOrders: s.allowOutOfStockOrders,
    social: s.social,
    tracking: s.tracking,
  };
}

// ---------------------------------------------------------------------------
// Colour themes of banners, promo cards and the announcement strip (keys kept from /web).

export const THEMES = {
  // `highlight`: colour of the highlighted words of a hero title on this background (AA as large text).
  sunrise: { label: "Светло", background: "linear-gradient(135deg,#f4f4f4 0%,#ffffff 55%,#fff1ea 100%)", dark: false, highlight: "#cc3300" },
  sky: { label: "Небе", background: "linear-gradient(135deg,#eaf1fa 0%,#f4f4f4 100%)", dark: false, highlight: "#cc3300" },
  mint: { label: "Мента", background: "linear-gradient(135deg,#e8f5ec 0%,#f4f4f4 100%)", dark: false, highlight: "#cc3300" },
  pink: { label: "Розово", background: "linear-gradient(135deg,#fdeceb 0%,#f4f4f4 100%)", dark: false, highlight: "#cc3300" },
  grape: { label: "Океан", background: "linear-gradient(120deg,#0e2440 0%,#1d5fa8 100%)", dark: true, highlight: "#ff8a5c" },
  brand: { label: "Оранжево", background: "linear-gradient(120deg,#a82a00 0%,#cc3300 50%,#d93a00 100%)", dark: true, highlight: "#111111" },
  ink: { label: "Тъмно", background: "linear-gradient(120deg,#111111 0%,#2b2b2b 100%)", dark: true, highlight: "#ff4410" },
} as const;
export type ThemeKey = keyof typeof THEMES;
export const THEME_KEYS = Object.keys(THEMES) as ThemeKey[];

// ---------------------------------------------------------------------------
// Home page (Admin → Начална страница)

export type LinkButton = { label: L10n; href: string };

export type HeroSlide = {
  id: string;
  enabled: boolean;
  /** "text-image": text + buttons on the left, picture on the right. "image-only": a ready-made banner picture. */
  layout: "text-image" | "image-only";
  eyebrow: L10n;
  title: L10n;
  highlight: L10n;
  text: L10n;
  /** Per language (a banner often has text baked in); empty English = the Bulgarian picture.
   * Empty on a text-image slide → an automatic collage of popular products. */
  image: L10n;
  mobileImage: L10n;
  /** Where an image-only banner leads when clicked. */
  href: string;
  theme: ThemeKey;
  primary: LinkButton;
  secondary: LinkButton;
};

export type PromoCard = {
  id: string;
  enabled: boolean;
  title: L10n;
  text: L10n;
  /** Empty → the picture of the linked category is used automatically. */
  image: string;
  href: string;
  buttonLabel: L10n;
  theme: ThemeKey;
};

export type HomeSections = {
  trust: boolean;
  categories: boolean;
  giftTiers: boolean;
  sale: boolean;
  bestsellers: boolean;
  goals: boolean;
  fresh: boolean;
  brands: boolean;
  blog: boolean;
  newsletter: boolean;
};

export type HomeContent = {
  announcement: { enabled: boolean; text: L10n; href: string; theme: ThemeKey };
  slides: HeroSlide[];
  autoplaySeconds: number;
  promos: PromoCard[];
  sections: HomeSections;
};

/** Admin labels of the home page sections, in page order. */
export const SECTION_LABELS: Record<keyof HomeSections, string> = {
  trust: "Лента с предимства (доставка, подаръци, връщане)",
  categories: "Категории",
  giftTiers: "Подаръци над сума (40 / 60 / 80 €)",
  sale: "Горещи оферти",
  bestsellers: "Най-продавани",
  goals: "Пазарувай по цел",
  fresh: "Нови продукти",
  brands: "Популярни марки",
  blog: "Последни статии от блога",
  newsletter: "Абонамент за бюлетин",
};

/** "{брой}" (or "{count}" in English texts) in banner texts is replaced with the number of products in the shop. */
export const COUNT_TOKEN = "{брой}";
export const COUNT_TOKEN_EN = "{count}";

export const DEFAULT_HOME: HomeContent = {
  announcement: {
    enabled: false,
    text: { bg: "Black Friday: до -30% на избрани продукти!", en: "Black Friday: up to 30% off selected products!" },
    href: "/promotsii",
    theme: "brand",
  },
  slides: [
    {
      id: "main",
      enabled: true,
      layout: "text-image",
      eyebrow: { bg: `Над ${COUNT_TOKEN} продукта от водещи марки`, en: `Over ${COUNT_TOKEN_EN} products from leading brands` },
      title: { bg: "Спортно хранене и добавки", en: "Sports nutrition and supplements" },
      highlight: { bg: "за всяка тренировка", en: "for every workout" },
      text: {
        bg: "Протеини, креатин, аминокиселини, предтренировъчни и аксесоари на едно място — с подарък по избор при поръчка над 40 € и доставка до офис, автомат или адрес.",
        en: "Protein, creatine, amino acids, pre-workouts and gym accessories in one place — with a free gift of your choice on orders over €40 and delivery to an office, locker or address.",
      },
      image: { bg: "", en: "" },
      mobileImage: { bg: "", en: "" },
      href: "",
      theme: "sunrise",
      primary: { label: { bg: "Разгледай продуктите", en: "Shop all products" }, href: "/produkti" },
      secondary: { label: { bg: "Промоции", en: "Deals" }, href: "/promotsii" },
    },
    {
      id: "gifts",
      enabled: true,
      layout: "text-image",
      eyebrow: { bg: "Подарък по избор", en: "Free gift of your choice" },
      title: { bg: "Поръчай над 40 €", en: "Spend over €40" },
      highlight: { bg: "и избери подарък", en: "and pick a free gift" },
      text: {
        bg: "При 40, 60 и 80 € отключваш нов подарък — избираш го направо в количката.",
        en: "At €40, €60 and €80 you unlock another gift — choose it right in your cart.",
      },
      image: { bg: "", en: "" },
      mobileImage: { bg: "", en: "" },
      href: "",
      theme: "mint",
      primary: { label: { bg: "Към продуктите", en: "Start shopping" }, href: "/produkti" },
      secondary: { label: { bg: "Нови продукти", en: "New in" }, href: "/novi" },
    },
    {
      id: "goals",
      enabled: true,
      layout: "text-image",
      eyebrow: { bg: "Пазарувай по цел", en: "Shop by goal" },
      title: { bg: "Сила, издръжливост, възстановяване", en: "Strength, endurance, recovery" },
      highlight: { bg: "— ти избираш", en: "— you choose" },
      text: {
        bg: "Продуктите са подредени по цел: мускулна маса, отслабване, енергия, възстановяване и още.",
        en: "Products sorted by goal: muscle gain, weight loss, energy, recovery and more.",
      },
      image: { bg: "", en: "" },
      mobileImage: { bg: "", en: "" },
      href: "",
      theme: "ink",
      primary: { label: { bg: "Виж целите", en: "Browse goals" }, href: "/tseli" },
      secondary: { label: { bg: "Марки", en: "Brands" }, href: "/marki" },
    },
  ],
  autoplaySeconds: 6,
  promos: [
    {
      id: "p1",
      enabled: true,
      title: { bg: "Протеини", en: "Protein" },
      text: { bg: "Суроватъчен, изолат и растителен протеин", en: "Whey, isolate and plant protein" },
      image: "",
      href: "/kategoria/proteini",
      buttonLabel: { bg: "Към протеините", en: "Shop protein" },
      theme: "mint",
    },
    {
      id: "p2",
      enabled: true,
      title: { bg: "Креатин", en: "Creatine" },
      text: { bg: "Креатин монохидрат и креатинови комплекси", en: "Creatine monohydrate and creatine blends" },
      image: "",
      href: "/kategoria/kreatin",
      buttonLabel: { bg: "Разгледай", en: "Browse" },
      theme: "sky",
    },
    {
      id: "p3",
      enabled: true,
      title: { bg: "Промоции", en: "Deals" },
      text: { bg: "Намалени продукти, докато са налични", en: "Discounted products while stocks last" },
      image: "",
      href: "/promotsii",
      buttonLabel: { bg: "Виж промоциите", en: "See the deals" },
      theme: "pink",
    },
  ],
  sections: {
    trust: true,
    categories: true,
    giftTiers: true,
    sale: true,
    bestsellers: true,
    goals: true,
    fresh: true,
    brands: true,
    blog: true,
    newsletter: true,
  },
};

// ---------------------------------------------------------------------------
// Purchase-threshold gifts (Admin → Цени и промоции → Подаръци над сума)

export type GiftTier = {
  /** Stable id, used in carts and orders. */
  id: string;
  enabled: boolean;
  /** EUR, compared with the qualifying subtotal (paid lines after sale prices, without gifts and shipping). */
  threshold: number;
  /** "{amount}" is replaced with the formatted threshold. */
  title: L10n;
  note: L10n;
  /** Gift choices (variant SKUs, ≤ 24). Hidden products are allowed (samples not sold separately). */
  skus: string[];
};

export type GiftTierSettings = {
  enabled: boolean;
  /** "perTier": one gift per reached tier (XXL model). "single": one gift in total from any reached tier. */
  mode: "perTier" | "single";
  /** Campaign window, YYYY-MM-DD inclusive (Europe/Sofia); null = no limit. */
  startsAt: string | null;
  endsAt: string | null;
  /** Strip "Подарък при поръчка над 40 €" in the header / product page. */
  showBar: boolean;
  headline: L10n;
  /** ≤ 6, sorted by threshold. */
  tiers: GiftTier[];
  /**
   * Set only on the value getGiftTiers() returns while the admin has never saved the tiers: the SKUs were picked
   * automatically (lib/gift-defaults.ts). Never stored.
   */
  automatic?: boolean;
};

const tierTitle: L10n = { bg: "Подарък над {amount}", en: "Free gift over {amount}" };

export const DEFAULT_GIFT_TIERS: GiftTierSettings = {
  enabled: true,
  mode: "perTier",
  startsAt: null,
  endsAt: null,
  showBar: true,
  headline: { bg: "Подаръци към поръчката", en: "Free gifts with your order" },
  tiers: [
    { id: "t40", enabled: true, threshold: 40, title: tierTitle, note: { bg: "", en: "" }, skus: [] },
    { id: "t60", enabled: true, threshold: 60, title: tierTitle, note: { bg: "", en: "" }, skus: [] },
    { id: "t80", enabled: true, threshold: 80, title: tierTitle, note: { bg: "", en: "" }, skus: [] },
  ],
};

// ---------------------------------------------------------------------------
// Chat bubble (Admin → Чат)

export type ChatSettings = {
  enabled: boolean;
  title: L10n;
  greeting: L10n;
  /** Shown when nobody from the shop has the admin panel open. */
  offlineText: L10n;
  /** Ready-made first questions the visitor can tap. */
  quickQuestions: L10n[];
  askContact: boolean;
};

export const DEFAULT_CHAT: ChatSettings = {
  enabled: true,
  title: { bg: "Пиши ни", en: "Chat with us" },
  greeting: {
    bg: "Здравей! 👋 С какво да помогнем? Питай за наличност, доставка или как да избереш подходящ продукт.",
    en: "Hi! 👋 How can we help? Ask about stock, delivery or choosing the right product.",
  },
  offlineText: {
    bg: "В момента не сме на линия, но ще ти отговорим възможно най-скоро.",
    en: "We're offline right now, but we'll reply as soon as we can.",
  },
  quickQuestions: [
    { bg: "Наличен ли е този продукт?", en: "Is this product in stock?" },
    { bg: "Кога ще пристигне поръчката ми?", en: "When will my order arrive?" },
    { bg: "Помогни ми да избера протеин", en: "Help me choose a protein" },
    { bg: "Как да върна продукт?", en: "How do I return a product?" },
  ],
  askContact: true,
};

/** What the storefront chat widget gets (texts already in the page's language). */
export type PublicChatConfig = { title: string; greeting: string; offlineText: string; quickQuestions: string[]; askContact: boolean };

export function publicChatConfig(c: ChatSettings, lang: Lang): PublicChatConfig {
  return {
    title: loc(c.title, lang),
    greeting: loc(c.greeting, lang),
    offlineText: loc(c.offlineText, lang),
    quickQuestions: c.quickQuestions.map((q) => loc(q, lang)).filter(Boolean),
    askContact: c.askContact,
  };
}

// ---------------------------------------------------------------------------
// Top menu (the bar under the search). Fully editable in Admin → Меню.

export const MENU_STYLES = {
  plain: "Обикновен",
  text: "Цветен текст",
  pill: "Цветен бутон",
  outline: "С рамка",
  gradient: "Преливащ цвят",
} as const;
export type MenuStyle = keyof typeof MENU_STYLES;

/** Icons the admin can put in front of a menu item (names map to lucide icons in the storefront's MenuIcon). */
export const MENU_ICONS = [
  "none", "gift", "percent", "tag", "star", "sparkles", "flame", "heart", "dumbbell", "zap", "leaf",
  "pill", "shield", "moon", "sun", "trophy", "target", "crown", "snowflake", "truck", "bell", "book",
] as const;
export type MenuIconName = (typeof MENU_ICONS)[number];

export type MenuAppearance = {
  style: MenuStyle;
  /** Main colour (#rrggbb): text colour, button colour or gradient start. */
  color: string;
  /** Gradient end colour (#rrggbb). */
  color2: string;
  icon: MenuIconName;
};

export type MenuSubLink = { id: string; label: L10n; href: string };

/** A column in a dropdown: either a list of links or a picture with a link. */
export type MenuColumn = {
  id: string;
  kind: "links" | "image";
  title: L10n;
  href: string;
  links: MenuSubLink[];
  image: string;
};

export type MenuItemKind = "link" | "dropdown";

export type MenuItem = {
  id: string;
  kind: MenuItemKind;
  label: L10n;
  /** For "link": where it goes. For "dropdown": optional "Виж всички" link. */
  href: string;
  appearance: MenuAppearance;
  columns: MenuColumn[];
};

export type MenuConfig = {
  categories: { show: boolean; label: L10n; color: string };
  items: MenuItem[];
};

/** Palette colours (storefront "Sport Orange", globals.css) for admin colour pickers and defaults. */
export const BRAND_COLOR = "#cc3300";
export const INK = "#111111";
export const ACCENT_COLOR = "#ff4410";
export const SALE_COLOR = "#c81e1e";

export const COLOR_PRESETS = [
  "#cc3300", "#a82a00", "#ff4410", "#e63a0a", "#c81e1e", "#1a7f37", "#b45309", "#1d5fa8", "#7552f5", "#111111", "#666666", "#ffffff",
];

/**
 * Colours saved with the store's first palette (pine / volt, before the "Sport Orange" restyle) → their
 * counterparts in the current palette. The storefront passes admin-chosen menu colours through this, so a menu saved
 * with the old defaults matches the new look without touching the stored settings; any other colour is kept.
 */
const LEGACY_PALETTE: Record<string, string> = {
  "#0a6b5e": BRAND_COLOR,
  "#07524a": "#a82a00",
  "#c8f135": ACCENT_COLOR,
  "#a9d11a": "#e63a0a",
  "#d7263d": SALE_COLOR,
  "#0f1a17": INK,
  "#5b6b66": "#666666",
  "#18803f": "#1a7f37",
};
export function paletteColor(c: string): string {
  return LEGACY_PALETTE[c.trim().toLowerCase()] ?? c;
}

export const DEFAULT_APPEARANCE: MenuAppearance = { style: "plain", color: BRAND_COLOR, color2: "#1d5fa8", icon: "none" };

/**
 * Goal pages linked from the default "Цели" dropdown. The slugs match the built-in goals (GOALS in
 * lib/taxonomy.ts) — the fitness goals with the most products (the shop imports sports nutrition only); the admin
 * can change the links in Admin → Меню.
 */
export const DEFAULT_GOAL_LINKS: { slug: string; label: L10n }[] = [
  { slug: "muskulna-masa", label: { bg: "Мускулна маса", en: "Muscle gain" } },
  { slug: "otslabvane", label: { bg: "Отслабване", en: "Weight loss" } },
  { slug: "energia-i-izdrazhlivost", label: { bg: "Енергия и издръжливост", en: "Energy & endurance" } },
  { slug: "vazstanovyavane", label: { bg: "Възстановяване", en: "Recovery" } },
  { slug: "imunitet", label: { bg: "Имунитет", en: "Immunity" } },
  { slug: "zdrave-i-dalgoletie", label: { bg: "Витамини за всеки ден", en: "Everyday vitamins" } },
];

export const DEFAULT_MENU: MenuConfig = {
  categories: { show: true, label: { bg: "Всички категории", en: "All categories" }, color: BRAND_COLOR },
  items: [
    {
      id: "m1",
      kind: "link",
      label: { bg: "Промоции", en: "Sale" },
      href: "/promotsii",
      appearance: { ...DEFAULT_APPEARANCE, style: "text", color: SALE_COLOR, icon: "percent" },
      columns: [],
    },
    { id: "m2", kind: "link", label: { bg: "Нови", en: "New" }, href: "/novi", appearance: DEFAULT_APPEARANCE, columns: [] },
    { id: "m3", kind: "link", label: { bg: "Марки", en: "Brands" }, href: "/marki", appearance: DEFAULT_APPEARANCE, columns: [] },
    {
      id: "m4",
      kind: "dropdown",
      label: { bg: "Цели", en: "Goals" },
      href: "/tseli",
      appearance: DEFAULT_APPEARANCE,
      columns: [
        {
          id: "c1",
          kind: "links",
          title: { bg: "Пазарувай по цел", en: "Shop by goal" },
          href: "/tseli",
          image: "",
          links: DEFAULT_GOAL_LINKS.map((g, i) => ({ id: `g${i + 1}`, label: g.label, href: `/tsel/${g.slug}` })),
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Colours typed by the admin: "#0a6b5e", "0a6b5e", "#0a6", "rgb(10, 107, 94)" or "10, 107, 94".

export function parseColor(input: string): string | null {
  const v = input.trim().toLowerCase();
  let m = v.match(/^#?([0-9a-f]{6})$/);
  if (m) return `#${m[1]}`;
  m = v.match(/^#?([0-9a-f])([0-9a-f])([0-9a-f])$/);
  if (m) return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`;
  m = v.match(/^(?:rgba?\s*\(\s*)?(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*(?:[,/]\s*[\d.]+%?\s*)?\)?$/);
  if (m) {
    const parts = [m[1], m[2], m[3]].map(Number);
    if (parts.some((n) => n > 255)) return null;
    return `#${parts.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
  }
  return null;
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = parseColor(hex) ?? INK;
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

/** White or dark text, whichever reads better on the given background. */
export function contrastText(bg: string): string {
  const [r, g, b] = hexToRgb(bg).map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.45 ? INK : "#ffffff";
}
