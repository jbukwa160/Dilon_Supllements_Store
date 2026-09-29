import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { site } from "@/config/site";
import { INTL_LOCALE, isLang, type Lang } from "@/i18n/config";
import { parseJson, storeDb } from "./db";
import { formatDate, fromCents, toCents } from "./format";
import { getOrder, type Order } from "./orders";

// Withdrawal statements sent through the withdrawal function „Откажете се от договора тук“ (/otkaz-ot-dogovor;
// ЗИД на ЗЗП, ДВ бр. 87/2026 — Directive (EU) 2023/2673, new Art. 11a of Directive 2011/83/EU). Each statement is a
// row in store.db `withdrawals`; the admin order page shows them via listWithdrawalsForOrder(). Owner: I.
//
// Storage: `items` is a JSON array of the withdrawn order lines ({ line, qty } + a snapshot of the line). An empty
// array means the WHOLE order (schema convention, see store-schema.ts); readers get it resolved to all lines.

/** A line of the order the customer withdraws from. */
export type WithdrawalLine = {
  /** Index of the line in the order's items (order lines never change after the order is placed). */
  line: number;
  kind: "item" | "gift";
  sku: string;
  name: string;
  variant: string | null;
  /** Quantity withdrawn from. */
  qty: number;
  /** Quantity on the order. */
  ordered: number;
  /** Unit price paid (0 for gifts). */
  price: number;
};

export type Withdrawal = {
  id: number;
  orderId: string | null;
  orderNumber: number | null;
  /** E-mail the acknowledgement was sent to (the order's e-mail). */
  email: string;
  /** The statement covers the whole order. */
  wholeOrder: boolean;
  /** The withdrawn lines (all lines of the order when wholeOrder). */
  items: WithdrawalLine[];
  reason: string | null;
  locale: Lang;
  ip: string | null;
  /** ISO timestamp (UTC) of receipt. */
  createdAt: string;
};

/**
 * Extra days after the withdrawal period (counted from the order date, as the delivery date is not recorded) before
 * the function says "the period has expired". Generous on purpose: accepting a late statement is harmless (the shop
 * reviews it), refusing a timely one is not. [ЮРИСТ]
 */
export const WITHDRAWAL_GRACE_DAYS = 30;

type Row = {
  id: number;
  order_id: string | null;
  order_number: number | null;
  email: string;
  items: string;
  reason: string | null;
  locale: string;
  ip: string | null;
  created_at: string;
};

type StoredLine = Pick<WithdrawalLine, "line" | "qty"> & Partial<Omit<WithdrawalLine, "line" | "qty">>;

function orderLines(order: Order): WithdrawalLine[] {
  return order.items.map((l, i) => ({
    line: i,
    kind: l.kind === "gift" ? "gift" : "item",
    sku: l.sku,
    name: l.name,
    variant: l.variant,
    qty: l.qty,
    ordered: l.qty,
    price: l.kind === "gift" ? 0 : l.price,
  }));
}

function toWithdrawal(r: Row, order: Order | null): Withdrawal {
  const stored = (parseJson<StoredLine[]>(r.items) ?? []).filter((l) => l && Number.isInteger(l.line) && l.qty > 0);
  const whole = stored.length === 0;
  let items: WithdrawalLine[];
  if (whole) items = order ? orderLines(order) : [];
  else
    items = stored.map((s) => {
      const o = order?.items[s.line];
      return {
        line: s.line,
        kind: (s.kind ?? o?.kind) === "gift" ? "gift" : "item",
        sku: s.sku ?? o?.sku ?? "",
        name: s.name ?? o?.name ?? "",
        variant: s.variant ?? o?.variant ?? null,
        qty: s.qty,
        ordered: s.ordered ?? o?.qty ?? s.qty,
        price: s.price ?? (o && o.kind !== "gift" ? o.price : 0),
      };
    });
  return {
    id: r.id,
    orderId: r.order_id,
    orderNumber: r.order_number,
    email: r.email,
    wholeOrder: whole,
    items,
    reason: r.reason,
    locale: isLang(r.locale) ? r.locale : "bg",
    ip: r.ip,
    createdAt: r.created_at,
  };
}

/** Withdrawal statements of an order, newest first (admin order page, withdrawal function). */
export function listWithdrawalsForOrder(orderId: string): Withdrawal[] {
  const rows = storeDb().prepare("SELECT * FROM withdrawals WHERE order_id = ? ORDER BY id DESC").all(orderId) as Row[];
  if (!rows.length) return [];
  const order = getOrder(orderId);
  return rows.map((r) => toWithdrawal(r, order));
}

const sha = (s: string) => createHash("sha256").update(s).digest();
const normEmail = (e: string) => e.trim().toLowerCase().slice(0, 200);
// Compared when no order has that number, so a wrong number takes as long as a wrong e-mail.
const DUMMY = sha("withdrawal:no-such-order");

/** "№ 100 123", "#100123", " 100123 " → 100123; null for anything that is not an order number. */
export function parseOrderNumber(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const digits = v.replace(/[\s№#.\-]/g, "");
  if (!/^\d{1,12}$/.test(digits)) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * The order with this number, if `email` is the order's e-mail — or if `customerId` (the signed-in customer) owns it.
 * The e-mail comparison is constant-time and done even when the number does not exist; callers show one generic
 * error for every failure and rate-limit the attempts.
 */
export function findOrderForWithdrawal(number: number, email: string, customerId?: number | null): Order | null {
  const row = storeDb().prepare("SELECT id, email, customer, customer_id FROM orders WHERE number = ?").get(number) as
    | { id: string; email: string | null; customer: string; customer_id: number | null }
    | undefined;
  const stored = row ? normEmail(row.email ?? parseJson<{ email?: string }>(row.customer)?.email ?? "") : "";
  const emailOk = timingSafeEqual(sha(normEmail(email)), row && stored ? sha(stored) : DUMMY) && !!row && !!stored;
  const ownerOk = !!row && customerId != null && row.customer_id === customerId;
  if (!row || !(emailOk || ownerOk)) return null;
  return getOrder(row.id);
}

/** Has the withdrawal period (plus the grace days) passed for a shipped / delivered order? */
export function withdrawalExpired(order: Order, returnDays: number, now = Date.now()): boolean {
  if (order.status === "new" || order.status === "confirmed") return false; // not shipped yet: always possible
  const created = Date.parse(order.createdAt);
  if (Number.isNaN(created)) return false;
  const days = Math.max(14, returnDays) + WITHDRAWAL_GRACE_DAYS;
  return now > created + days * 86_400_000;
}

export type NewWithdrawal = {
  order: Order;
  /** "all" = the whole order; otherwise the chosen lines (index in order.items) and quantities. */
  lines: "all" | { line: number; qty: number }[];
  reason: string;
  locale: Lang;
  ip: string | null;
};

export type CreateWithdrawalResult =
  | { ok: true; withdrawal: Withdrawal; duplicate: boolean }
  | { ok: false; code: "no_items" | "invalid_line" };

/**
 * Stores a withdrawal statement. The chosen lines are validated against the order (quantities clamped to what was
 * ordered); choosing every line in full counts as the whole order. A double submit of the same statement within
 * 10 minutes returns the existing row (`duplicate: true`) instead of a second one.
 */
export function createWithdrawal(input: NewWithdrawal): CreateWithdrawalResult {
  const { order } = input;
  const all = orderLines(order);
  let chosen: WithdrawalLine[];
  if (input.lines === "all") chosen = all;
  else {
    const byLine = new Map<number, number>();
    for (const l of input.lines) {
      if (!Number.isInteger(l.line) || !all[l.line]) return { ok: false, code: "invalid_line" };
      const qty = Math.floor(l.qty);
      if (qty > 0) byLine.set(l.line, Math.min(all[l.line].ordered, (byLine.get(l.line) ?? 0) + qty));
    }
    chosen = [...byLine.entries()].sort((a, b) => a[0] - b[0]).map(([line, qty]) => ({ ...all[line], qty }));
  }
  if (!chosen.length) return { ok: false, code: "no_items" };

  const whole = chosen.length === all.length && chosen.every((l) => l.qty === l.ordered);
  const itemsJson = JSON.stringify(whole ? [] : chosen);
  const reason = input.reason.replace(/\r\n?/g, "\n").trim().slice(0, 1000) || null;
  const db = storeDb();

  return db
    .transaction((): CreateWithdrawalResult => {
      const since = new Date(Date.now() - 10 * 60_000).toISOString();
      const dup = db
        .prepare("SELECT * FROM withdrawals WHERE order_id = ? AND items = ? AND IFNULL(reason, '') = ? AND created_at >= ? ORDER BY id DESC LIMIT 1")
        .get(order.id, itemsJson, reason ?? "", since) as Row | undefined;
      if (dup) return { ok: true, withdrawal: toWithdrawal(dup, order), duplicate: true };
      const createdAt = new Date().toISOString();
      const info = db
        .prepare("INSERT INTO withdrawals (order_id, order_number, email, items, reason, locale, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(order.id, order.number, order.email, itemsJson, reason, input.locale, input.ip, createdAt);
      const row: Row = {
        id: Number(info.lastInsertRowid),
        order_id: order.id,
        order_number: order.number,
        email: order.email,
        items: itemsJson,
        reason,
        locale: input.locale,
        ip: input.ip,
        created_at: createdAt,
      };
      return { ok: true, withdrawal: toWithdrawal(row, order), duplicate: false };
    })
    .immediate();
}

/**
 * What the shop refunds for a statement: the withdrawn paid lines, plus the delivery charge when the whole order is
 * withdrawn (the standard delivery is refunded; ЗЗП чл. 55). [ЮРИСТ] delivery refund on partial withdrawal.
 */
export function withdrawalRefund(w: Withdrawal, order: Order): number {
  let cents = 0;
  for (const l of w.items) if (l.kind === "item") cents += toCents(l.price) * l.qty;
  if (w.wholeOrder) cents += toCents(order.shipping);
  return fromCents(cents);
}

/** Receipt date and time in Bulgarian time: { date: "29 септември 2026 г.", time: "14:05" }. */
export function sofiaDateTime(iso: string, lang: Lang): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: formatDate(d, lang),
    time: d.toLocaleTimeString(INTL_LOCALE[lang], { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: site.timeZone }),
  };
}
