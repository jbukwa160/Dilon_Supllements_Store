import "server-only";
import { hidesNoImage, shopVisibleSql } from "@/lib/catalog";
import { catalogDb, parseJson, storeDb } from "@/lib/db";
import { getGiftTiers, getSettings } from "@/lib/settings";
import { isOrderStatus } from "@/lib/orders";
import { parseWhen } from "@/lib/price-engine";
import { loc } from "@/lib/l10n";
import { recentMailFailures } from "@/lib/mail";
import { formatPrice } from "@/lib/format";
import type { OrderStatus } from "@/lib/checkout";

// Admin → Табло: read-only numbers from both databases. Every block is computed on its own and falls back to empty
// values, so one missing table (a module that hasn't stored anything yet) never breaks the dashboard.

const SOFIA_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Sofia", year: "numeric", month: "2-digit", day: "2-digit" });

/** Today's date in Bulgaria ("2026-09-29"). */
export function sofiaToday(now = new Date()): string {
  return SOFIA_DAY.format(now);
}

/** Start of the Bulgarian day `days` days before today, as an ISO instant. */
function dayStart(days: number, now = new Date()): string {
  const d = new Date(`${sofiaToday(now)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return (parseWhen(d.toISOString().slice(0, 10)) ?? now).toISOString();
}

function safe<T>(fallback: T, fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    console.error("[admin] dashboard:", (e as Error).message);
    return fallback;
  }
}

export type Period = { count: number; revenue: number };
export type RecentOrder = { id: string; number: number; createdAt: string; name: string; total: number; status: OrderStatus; items: number };

export type DashboardData = {
  orders: { today: Period; week: Period; month: Period; toHandle: number; total: number; recent: RecentOrder[] };
  customers: { total: number; new30: number };
  /**
   * Product counts (SKUs). "In the shop" = what visitors can find: not hidden by the admin and — while Настройки →
   * "Скрий продукти без снимка" is on — with a picture (the same rule as the storefront, catalog.shopVisibleSql).
   * sale / demo count products in the shop; noImage / demoAll / custom count the whole catalogue (like the admin
   * filters the dashboard links to).
   */
  products: {
    total: number;
    inShop: number;
    inShopInStock: number;
    /** Switched off by the admin ("Скрит"). */
    hiddenByAdmin: number;
    /** Not hidden by the admin, but left out of the shop because they have no picture (0 while the setting is off). */
    noImageOut: number;
    noImage: number;
    sale: number;
    demo: number;
    demoAll: number;
    custom: number;
  };
  promotions: { active: number; scheduled: number; activeNames: string[] };
  giftTiers: {
    enabled: boolean;
    /** Enabled and inside its date window. */
    running: boolean;
    window: string | null;
    mode: "perTier" | "single";
    tiers: { id: string; threshold: number; title: string; gifts: number; available: number; enabled: boolean }[];
    /** Enabled tiers a customer can reach but gets no gift for (no products, or all out of stock). */
    empty: number;
  };
  freeShippingOver: number | null;
  chats: { unread: number; latest: { id: number; name: string; at: string; text: string }[] };
  /** E-mails the SMTP server refused in the last 30 days that are still unsent (lib/mail retries them). */
  mail: { failed: number; lastAt: string | null };
};

const CANCELLED = "('cancelled', 'returned')";

function ordersBlock(): DashboardData["orders"] {
  const db = storeDb();
  const period = (from: string): Period => {
    const r = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS s FROM orders WHERE created_at >= ? AND status NOT IN ${CANCELLED}`).get(from) as { n: number; s: number };
    return { count: r.n, revenue: Math.round(r.s * 100) / 100 };
  };
  const recent = (db.prepare("SELECT id, number, created_at, status, customer, items, total FROM orders ORDER BY number DESC LIMIT 6").all() as {
    id: string;
    number: number;
    created_at: string;
    status: string;
    customer: string;
    items: string;
    total: number;
  }[]).map((o) => {
    const c = parseJson<{ firstName?: string; lastName?: string }>(o.customer);
    const lines = parseJson<{ qty?: number; kind?: string }[]>(o.items) ?? [];
    return {
      id: o.id,
      number: o.number,
      createdAt: o.created_at,
      name: [c?.firstName, c?.lastName].filter(Boolean).join(" ") || "—",
      total: o.total,
      status: isOrderStatus(o.status) ? o.status : "new",
      items: lines.filter((l) => l.kind !== "gift").reduce((n, l) => n + (Number(l.qty) || 0), 0),
    };
  });
  return {
    today: period(dayStart(0)),
    week: period(dayStart(6)),
    month: period(dayStart(29)),
    toHandle: (db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status = 'new'").get() as { n: number }).n,
    total: (db.prepare("SELECT COUNT(*) AS n FROM orders").get() as { n: number }).n,
    recent,
  };
}

function productsBlock(): DashboardData["products"] {
  const shop = `(${shopVisibleSql("p")})`;
  const r = catalogDb()
    .prepare(
      `SELECT COUNT(*) AS total, COALESCE(SUM(${shop}), 0) AS inShop, COALESCE(SUM(${shop} AND p.stock > 0), 0) AS inShopInStock,
         COALESCE(SUM(p.hidden = 1), 0) AS hiddenByAdmin, COALESCE(SUM(p.hidden = 0 AND p.image IS NULL), 0) AS noImageOut,
         COALESCE(SUM(p.image IS NULL), 0) AS noImage, COALESCE(SUM(${shop} AND p.price < p.base_price - 0.001), 0) AS sale,
         COALESCE(SUM(${shop} AND p.demo_price = 1), 0) AS demo, COALESCE(SUM(p.demo_price = 1), 0) AS demoAll,
         COALESCE(SUM(p.custom), 0) AS custom
       FROM products p`,
    )
    .get() as DashboardData["products"];
  return { ...r, noImageOut: hidesNoImage() ? r.noImageOut : 0 };
}

function promotionsBlock(now = new Date()): DashboardData["promotions"] {
  const rows = storeDb().prepare("SELECT name, percent, starts_at, ends_at FROM promotions WHERE enabled = 1 ORDER BY percent DESC").all() as {
    name: string;
    percent: number;
    starts_at: string | null;
    ends_at: string | null;
  }[];
  let active = 0;
  let scheduled = 0;
  const activeNames: string[] = [];
  for (const p of rows) {
    const start = parseWhen(p.starts_at);
    const end = parseWhen(p.ends_at, true);
    if (end && end <= now) continue;
    if (start && start > now) scheduled++;
    else {
      active++;
      if (activeNames.length < 3) activeNames.push(`${p.name} −${p.percent}%`);
    }
  }
  return { active, scheduled, activeNames };
}

function giftTiersBlock(): DashboardData["giftTiers"] {
  const g = getGiftTiers();
  const today = sofiaToday();
  const inWindow = (!g.startsAt || g.startsAt <= today) && (!g.endsAt || g.endsAt >= today);
  const skus = [...new Set(g.tiers.flatMap((t) => t.skus))];
  const stock = new Map<string, number>();
  if (skus.length) {
    const rows = catalogDb()
      .prepare(`SELECT sku, stock FROM products WHERE sku IN (${skus.map(() => "?").join(",")})`)
      .all(...skus) as { sku: string; stock: number }[];
    for (const r of rows) stock.set(r.sku, r.stock);
  }
  const tiers = g.tiers.map((t) => {
    const known = t.skus.filter((s) => stock.has(s));
    return {
      id: t.id,
      threshold: t.threshold,
      title: loc(t.title, "bg").replace("{amount}", formatPrice(t.threshold, "bg")),
      gifts: known.length,
      available: known.filter((s) => (stock.get(s) ?? 0) > 0).length,
      enabled: t.enabled,
    };
  });
  const window = g.startsAt || g.endsAt ? [g.startsAt ? `от ${g.startsAt.split("-").reverse().join(".")}` : "", g.endsAt ? `до ${g.endsAt.split("-").reverse().join(".")}` : ""].filter(Boolean).join(" ") : null;
  return {
    enabled: g.enabled,
    running: g.enabled && inWindow && tiers.some((t) => t.enabled),
    window,
    mode: g.mode,
    tiers,
    empty: tiers.filter((t) => t.enabled && t.available === 0).length,
  };
}

function chatsBlock(): DashboardData["chats"] {
  const db = storeDb();
  const unread = (db.prepare("SELECT COUNT(*) AS n FROM chat_conversations WHERE unread_admin > 0").get() as { n: number }).n;
  const latest = (db
    .prepare(
      `SELECT c.id, c.name, c.last_message_at AS at,
         (SELECT m.body FROM chat_messages m WHERE m.conversation_id = c.id AND m.sender = 'visitor' ORDER BY m.id DESC LIMIT 1) AS text
       FROM chat_conversations c WHERE c.unread_admin > 0 ORDER BY c.last_message_at DESC LIMIT 3`,
    )
    .all() as { id: number; name: string | null; at: string; text: string | null }[]).map((c) => ({
    id: c.id,
    name: c.name?.trim() || "Посетител",
    at: c.at,
    text: (c.text ?? "").replace(/\s+/g, " ").slice(0, 120),
  }));
  return { unread, latest };
}

export function getDashboardData(): DashboardData {
  const emptyPeriod = { count: 0, revenue: 0 };
  return {
    orders: safe({ today: emptyPeriod, week: emptyPeriod, month: emptyPeriod, toHandle: 0, total: 0, recent: [] }, ordersBlock),
    customers: safe({ total: 0, new30: 0 }, () => {
      const r = storeDb().prepare("SELECT COUNT(*) AS n, COALESCE(SUM(created_at >= ?), 0) AS m FROM customers").get(dayStart(29)) as { n: number; m: number };
      return { total: r.n, new30: r.m };
    }),
    products: safe({ total: 0, inShop: 0, inShopInStock: 0, hiddenByAdmin: 0, noImageOut: 0, noImage: 0, sale: 0, demo: 0, demoAll: 0, custom: 0 }, productsBlock),
    promotions: safe({ active: 0, scheduled: 0, activeNames: [] }, () => promotionsBlock()),
    giftTiers: safe({ enabled: false, running: false, window: null, mode: "perTier", tiers: [], empty: 0 }, giftTiersBlock),
    freeShippingOver: safe(null, () => getSettings().shipping.freeOver),
    chats: safe({ unread: 0, latest: [] }, chatsBlock),
    mail: safe({ failed: 0, lastAt: null }, () => {
      const r = recentMailFailures();
      return { failed: r.count, lastAt: r.lastAt };
    }),
  };
}
