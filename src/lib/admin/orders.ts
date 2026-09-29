import "server-only";
import type Database from "better-sqlite3";
import { storeDb } from "@/lib/db";
import { getOrder, isOrderStatus, ORDER_STATUSES, type Order } from "@/lib/orders";
import type { OrderStatus } from "@/lib/checkout";

// Admin → Поръчки: list with status chips and search, one order, status + internal note. Orders are read through
// lib/orders.ts (D); this module only adds the admin's queries. Owner: H.

export { ORDER_STATUSES };
export const ORDERS_PER_PAGE = 30;

const withFns = new WeakSet<Database.Database>();

/**
 * store.db with ulower(): SQLite's LOWER() only folds ASCII, so a search for "иван" would miss "Иван". Registered once
 * per connection (admin searches in orders, customers and subscribers).
 */
export function adminStoreDb(): Database.Database {
  const db = storeDb();
  if (!withFns.has(db)) {
    db.function("ulower", { deterministic: true }, (v: unknown) => (typeof v === "string" ? v.toLowerCase() : v) as string | null);
    withFns.add(db);
  }
  return db;
}

export type OrderListFilter = { status?: string | null; q?: string | null; page?: number; customerId?: number | null };

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** WHERE clause for the list: status, a customer, and a search by number, name, phone or e-mail. */
function where(f: OrderListFilter): { sql: string; params: (string | number)[] } {
  const parts: string[] = [];
  const params: (string | number)[] = [];
  if (f.status && isOrderStatus(f.status)) {
    parts.push("status = ?");
    params.push(f.status);
  }
  if (f.customerId) {
    parts.push("customer_id = ?");
    params.push(f.customerId);
  }
  const q = (f.q ?? "").trim().slice(0, 100);
  if (q) {
    const or: string[] = [];
    const number = q.replace(/^[№#\s]+/, "").replace(/\s+/g, "");
    if (/^\d{1,12}$/.test(number)) {
      or.push("number = ?");
      params.push(Number(number));
    }
    const digits = q.replace(/\D/g, "");
    if (digits.length >= 4) {
      // Phones are stored as typed ("+359 88 …", "0888-…"): compare digits only, with or without the country code.
      const local = digits.replace(/^359/, "").replace(/^0/, "");
      or.push(
        "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(json_extract(customer, '$.phone'), ' ', ''), '-', ''), '+', ''), '(', ''), ')', '') LIKE ? ESCAPE '\\'",
      );
      params.push(`%${likeEscape(local || digits)}%`);
    }
    const text = `%${likeEscape(q.toLowerCase())}%`;
    or.push(
      "ulower(COALESCE(email, json_extract(customer, '$.email'), '')) LIKE ? ESCAPE '\\'",
      "ulower(json_extract(customer, '$.firstName') || ' ' || json_extract(customer, '$.lastName')) LIKE ? ESCAPE '\\'",
      "ulower(json_extract(customer, '$.lastName') || ' ' || json_extract(customer, '$.firstName')) LIKE ? ESCAPE '\\'",
    );
    params.push(text, text, text);
    parts.push(`(${or.join(" OR ")})`);
  }
  return { sql: parts.length ? `WHERE ${parts.join(" AND ")}` : "", params };
}

export type OrderRowSummary = Pick<Order, "id" | "number" | "createdAt" | "status" | "customer" | "total" | "payment" | "customerId" | "locale"> & {
  deliveryLabel: string;
  city: string;
  items: number;
  gifts: number;
  withdrawals: number;
};

/** One page of orders (newest first). */
export function listOrders(f: OrderListFilter): { items: OrderRowSummary[]; total: number; page: number; pageCount: number } {
  const db = adminStoreDb();
  const w = where(f);
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM orders ${w.sql}`).get(...w.params) as { n: number }).n;
  const pageCount = Math.max(1, Math.ceil(total / ORDERS_PER_PAGE));
  const page = Math.min(Math.max(1, Math.floor(f.page ?? 1) || 1), pageCount);
  const ids = db
    .prepare(`SELECT id FROM orders ${w.sql} ORDER BY number DESC LIMIT ? OFFSET ?`)
    .all(...w.params, ORDERS_PER_PAGE, (page - 1) * ORDERS_PER_PAGE) as { id: string }[];
  const withdrawalCounts = new Map<string, number>();
  if (ids.length) {
    const rows = db
      .prepare(`SELECT order_id, COUNT(*) AS n FROM withdrawals WHERE order_id IN (${ids.map(() => "?").join(",")}) GROUP BY order_id`)
      .all(...ids.map((r) => r.id)) as { order_id: string; n: number }[];
    for (const r of rows) withdrawalCounts.set(r.order_id, r.n);
  }
  const items = ids
    .map((r) => getOrder(r.id))
    .filter((o): o is Order => !!o)
    .map((o) => ({
      id: o.id,
      number: o.number,
      createdAt: o.createdAt,
      status: o.status,
      customer: o.customer,
      total: o.total,
      payment: o.payment,
      customerId: o.customerId,
      locale: o.locale,
      deliveryLabel: o.delivery.label,
      city: o.delivery.city,
      items: o.items.filter((l) => l.kind !== "gift").reduce((n, l) => n + l.qty, 0),
      gifts: o.items.filter((l) => l.kind === "gift").length,
      withdrawals: withdrawalCounts.get(o.id) ?? 0,
    }));
  return { items, total, page, pageCount };
}

/** Orders per status (+ "all"), for the status chips. */
export function orderCounts(): Record<OrderStatus | "all", number> {
  const rows = storeDb().prepare("SELECT status, COUNT(*) AS n FROM orders GROUP BY status").all() as { status: string; n: number }[];
  const out: Record<OrderStatus | "all", number> = { all: 0, new: 0, confirmed: 0, shipped: 0, delivered: 0, cancelled: 0, returned: 0 };
  for (const r of rows) {
    if (isOrderStatus(r.status)) out[r.status] += r.n;
    out.all += r.n;
  }
  return out;
}

/** Status and the internal note (≤ 2000 characters). false when there is no such order. */
export function updateOrderStatus(id: string, status: OrderStatus, note: string): boolean {
  const r = storeDb()
    .prepare("UPDATE orders SET status = ?, admin_note = ? WHERE id = ?")
    .run(status, note.replace(/\r\n?/g, "\n").trim().slice(0, 2000) || null, id);
  return r.changes > 0;
}

/** The customer's other orders count (for "Регистриран клиент" / "N поръчки от този имейл"). */
export function ordersByEmailCount(email: string): number {
  const e = email.trim().toLowerCase();
  if (!e) return 0;
  return (storeDb().prepare("SELECT COUNT(*) AS n FROM orders WHERE email = ?").get(e) as { n: number }).n;
}
