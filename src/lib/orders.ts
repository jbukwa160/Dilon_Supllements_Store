import "server-only";
import { randomBytes } from "node:crypto";
import { isLang, type Lang } from "@/i18n/config";
import { parseJson, storeDb } from "./db";
import type { OrderDelivery, OrderLine, OrderStatus, PaymentKey } from "./checkout";

// Orders in store.db. Written by the placeOrder Server Action (after priceCart), read by the order confirmation
// page, the account area (E) and the admin (H, with lib/admin/orders.ts). Owner: D.

/** Admin labels (Bulgarian) and pill colours (admin tokens). The shop uses dict.order.status[status]. */
export const ORDER_STATUSES: Record<OrderStatus, { label: string; color: string }> = {
  new: { label: "Нова", color: "bg-sun-soft text-ink" },
  confirmed: { label: "Потвърдена", color: "bg-sky-soft text-sky" },
  shipped: { label: "Изпратена", color: "bg-grape-soft text-grape" },
  delivered: { label: "Доставена", color: "bg-mint-soft text-mint" },
  cancelled: { label: "Отказана", color: "bg-line text-muted" },
  returned: { label: "Върната", color: "bg-brand-soft text-brand-dark" },
};

export function isOrderStatus(v: unknown): v is OrderStatus {
  return typeof v === "string" && v in ORDER_STATUSES;
}

export type OrderCustomer = { firstName: string; lastName: string; phone: string; email: string };

export type Order = {
  id: string;
  number: number;
  createdAt: string;
  status: OrderStatus;
  customer: OrderCustomer;
  delivery: OrderDelivery;
  payment: PaymentKey;
  /** Paid lines and gift lines (kind "gift"). */
  items: OrderLine[];
  subtotal: number;
  shipping: number;
  total: number;
  note: string | null;
  adminNote: string | null;
  customerId: number | null;
  email: string;
  locale: Lang;
  checkoutToken: string | null;
};

/** What placeOrder stores (everything already priced and validated by priceCart). */
export type NewOrder = Pick<Order, "customer" | "delivery" | "payment" | "items" | "subtotal" | "shipping" | "total" | "note" | "customerId" | "locale" | "checkoutToken">;

type OrderRow = {
  id: string;
  number: number;
  created_at: string;
  status: string;
  customer: string;
  delivery: string;
  payment: string;
  items: string;
  subtotal: number;
  shipping: number;
  total: number;
  note: string | null;
  admin_note: string | null;
  customer_id: number | null;
  email: string | null;
  locale: string;
  checkout_token: string | null;
};

function toOrder(r: OrderRow): Order {
  const customer = parseJson<OrderCustomer>(r.customer) ?? { firstName: "", lastName: "", phone: "", email: "" };
  // Lines saved without "kind" are paid lines.
  const items = (parseJson<OrderLine[]>(r.items) ?? []).map((l) => ({ ...l, kind: l.kind ?? "item" }));
  return {
    id: r.id,
    number: r.number,
    createdAt: r.created_at,
    status: isOrderStatus(r.status) ? r.status : "new",
    customer,
    delivery: parseJson<OrderDelivery>(r.delivery) ?? { method: "", label: "", city: "", address: "" },
    payment: r.payment === "bank" ? "bank" : "cod",
    items,
    subtotal: r.subtotal,
    shipping: r.shipping,
    total: r.total,
    note: r.note,
    adminNote: r.admin_note,
    customerId: r.customer_id,
    email: r.email ?? customer.email,
    locale: isLang(r.locale) ? r.locale : "bg",
    checkoutToken: r.checkout_token,
  };
}

const INSERT_SQL = `INSERT INTO orders (id, number, created_at, status, customer, delivery, payment, items, subtotal, shipping, total, note,
                                        customer_id, email, locale, checkout_token)
                    VALUES (?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const isUniqueError = (e: unknown) => (e as { code?: string })?.code === "SQLITE_CONSTRAINT_UNIQUE" || (e as { code?: string })?.code === "SQLITE_CONSTRAINT_PRIMARYKEY";

/**
 * Stores a new order with the next number (from 100001) in one immediate transaction (BEGIN IMMEDIATE, so two
 * processes cannot take the same number). Idempotent: a second call with the same checkoutToken returns the
 * existing order (`existing: true`). A lost race on the number or the token is retried once.
 */
export function createOrder(input: NewOrder): { id: string; number: number; existing: boolean } {
  const db = storeDb();
  const insert = db.transaction((): { id: string; number: number; existing: boolean } => {
    if (input.checkoutToken) {
      const dup = db.prepare("SELECT id, number FROM orders WHERE checkout_token = ?").get(input.checkoutToken) as { id: string; number: number } | undefined;
      if (dup) return { ...dup, existing: true };
    }
    const last = db.prepare("SELECT MAX(number) AS n FROM orders").get() as { n: number | null };
    const number = Math.max(100000, last.n ?? 0) + 1;
    // 96 random bits: the id is also what the confirmation URL contains.
    const id = randomBytes(12).toString("base64url");
    db.prepare(INSERT_SQL).run(
      id,
      number,
      new Date().toISOString(),
      JSON.stringify(input.customer),
      JSON.stringify(input.delivery),
      input.payment,
      JSON.stringify(input.items),
      input.subtotal,
      input.shipping,
      input.total,
      input.note || null,
      input.customerId,
      input.customer.email.trim().toLowerCase(),
      input.locale,
      input.checkoutToken,
    );
    return { id, number, existing: false };
  });
  try {
    return insert.immediate();
  } catch (e) {
    if (!isUniqueError(e)) throw e;
    // Another process took the number (or stored the same token) between our read and write: once more.
    return insert.immediate();
  }
}

/** The order placed with this checkout token (idempotent retries of placeOrder), or null. */
export function getOrderByToken(token: string): Order | null {
  if (!token) return null;
  const row = storeDb().prepare("SELECT * FROM orders WHERE checkout_token = ?").get(token) as OrderRow | undefined;
  return row ? toOrder(row) : null;
}

export function getOrder(id: string): Order | null {
  if (!id || id.length > 64) return null;
  const row = storeDb().prepare("SELECT * FROM orders WHERE id = ?").get(id) as OrderRow | undefined;
  return row ? toOrder(row) : null;
}

/** A customer's orders, newest first. */
export function listCustomerOrders(customerId: number, page: number, perPage = 10): { items: Order[]; total: number; page: number; pageCount: number } {
  const db = storeDb();
  const total = (db.prepare("SELECT COUNT(*) AS n FROM orders WHERE customer_id = ?").get(customerId) as { n: number }).n;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const p = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const rows = db
    .prepare("SELECT * FROM orders WHERE customer_id = ? ORDER BY number DESC LIMIT ? OFFSET ?")
    .all(customerId, perPage, (p - 1) * perPage) as OrderRow[];
  return { items: rows.map(toOrder), total, page: p, pageCount };
}
