import "server-only";
import { isLang, type Lang } from "@/i18n/config";
import { getCustomerById, type Customer } from "@/lib/customer-auth";
import { countActiveSessions, deleteCustomerAccount, endAllCustomerSessions } from "@/lib/customer-account";
import { listCustomerAddresses, type SavedAddress } from "@/lib/customer-addresses";
import { adminStoreDb } from "./orders";

// Admin → Поръчки → Клиенти: registered customer accounts (list, one customer, sign out everywhere, block, GDPR delete).
// Account data lives in customer-auth.ts / customer-account.ts (E); this module adds the admin's queries. Owner: H.

export const CUSTOMERS_PER_PAGE = 30;

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export type AdminCustomerRow = {
  id: number;
  name: string;
  email: string;
  phone: string;
  locale: Lang;
  createdAt: string;
  lastLoginAt: string | null;
  marketing: boolean;
  blocked: boolean;
  orders: number;
  /** Sum of the customer's orders that were not cancelled / returned. */
  spent: number;
};

type Row = {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  locale: string;
  created_at: string;
  last_login_at: string | null;
  marketing_consent_at: string | null;
  blocked: number;
  orders: number;
  spent: number;
};

const SELECT = `SELECT c.id, c.first_name, c.last_name, c.email, c.phone, c.locale, c.created_at, c.last_login_at, c.marketing_consent_at, c.blocked,
    (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS orders,
    (SELECT COALESCE(SUM(o.total), 0) FROM orders o WHERE o.customer_id = c.id AND o.status NOT IN ('cancelled', 'returned')) AS spent
  FROM customers c`;

function toRow(r: Row): AdminCustomerRow {
  return {
    id: r.id,
    name: `${r.first_name} ${r.last_name}`.trim(),
    email: r.email,
    phone: r.phone,
    locale: isLang(r.locale) ? r.locale : "bg",
    createdAt: r.created_at,
    lastLoginAt: r.last_login_at,
    marketing: !!r.marketing_consent_at,
    blocked: !!r.blocked,
    orders: r.orders,
    spent: Math.round(r.spent * 100) / 100,
  };
}

/** Newest first; `q` searches the name, e-mail and phone. */
export function listCustomers(opts: { q?: string | null; page?: number }): { items: AdminCustomerRow[]; total: number; page: number; pageCount: number } {
  const db = adminStoreDb();
  const q = (opts.q ?? "").trim().slice(0, 100);
  const params: string[] = [];
  let where = "";
  if (q) {
    const text = `%${likeEscape(q.toLowerCase())}%`;
    const or = [
      "ulower(c.email) LIKE ? ESCAPE '\\'",
      "ulower(c.first_name || ' ' || c.last_name) LIKE ? ESCAPE '\\'",
      "ulower(c.last_name || ' ' || c.first_name) LIKE ? ESCAPE '\\'",
    ];
    params.push(text, text, text);
    const digits = q.replace(/\D/g, "");
    if (digits.length >= 4) {
      or.push("REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(c.phone, ' ', ''), '-', ''), '+', ''), '(', ''), ')', '') LIKE ?");
      params.push(`%${digits.replace(/^359/, "").replace(/^0/, "") || digits}%`);
    }
    where = `WHERE ${or.join(" OR ")}`;
  }
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM customers c ${where}`).get(...params) as { n: number }).n;
  const pageCount = Math.max(1, Math.ceil(total / CUSTOMERS_PER_PAGE));
  const page = Math.min(Math.max(1, Math.floor(opts.page ?? 1) || 1), pageCount);
  const rows = db.prepare(`${SELECT} ${where} ORDER BY c.id DESC LIMIT ? OFFSET ?`).all(...params, CUSTOMERS_PER_PAGE, (page - 1) * CUSTOMERS_PER_PAGE) as Row[];
  return { items: rows.map(toRow), total, page, pageCount };
}

export function customersCount(): number {
  return (adminStoreDb().prepare("SELECT COUNT(*) AS n FROM customers").get() as { n: number }).n;
}

export type AdminCustomerDetail = AdminCustomerRow & {
  customer: Customer;
  marketingConsentAt: string | null;
  emailVerifiedAt: string | null;
  activeSessions: number;
  addresses: SavedAddress[];
};

export function getAdminCustomer(id: number): AdminCustomerDetail | null {
  const customer = getCustomerById(id);
  if (!customer) return null;
  const r = adminStoreDb().prepare(`${SELECT} WHERE c.id = ?`).get(id) as Row | undefined;
  if (!r) return null;
  const extra = adminStoreDb().prepare("SELECT marketing_consent_at, email_verified_at FROM customers WHERE id = ?").get(id) as {
    marketing_consent_at: string | null;
    email_verified_at: string | null;
  };
  return {
    ...toRow(r),
    customer,
    marketingConsentAt: extra.marketing_consent_at,
    emailVerifiedAt: extra.email_verified_at,
    activeSessions: countActiveSessions(id),
    addresses: listCustomerAddresses(id),
  };
}

/** Block (signs the customer out everywhere; they can't sign in until unblocked) or unblock an account. */
export function setCustomerBlocked(id: number, blocked: boolean): boolean {
  const db = adminStoreDb();
  const changed = db.transaction(() => {
    const r = db.prepare("UPDATE customers SET blocked = ? WHERE id = ?").run(blocked ? 1 : 0, id);
    if (r.changes && blocked) endAllCustomerSessions(id);
    return r.changes > 0;
  })();
  return changed;
}

/** "Изход от всички устройства". */
export function signOutCustomerEverywhere(id: number): boolean {
  if (!getCustomerById(id)) return false;
  endAllCustomerSessions(id);
  return true;
}

/**
 * GDPR erasure: deletes the account, its sessions, addresses, tokens and newsletter subscription. Orders are kept for
 * the legal retention periods (they keep the name / phone / e-mail used for that order) with customer_id = NULL.
 */
export function deleteCustomer(id: number): { email: string } | null {
  const r = deleteCustomerAccount(id);
  return r ? { email: r.email } : null;
}
