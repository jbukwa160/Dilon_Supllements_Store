import "server-only";
import { isLang, type Lang } from "@/i18n/config";
import { isConfirmedSql } from "@/lib/newsletter";
import { adminStoreDb } from "./orders";

// Admin → Поръчки → Абонати: the CONFIRMED newsletter addresses (double opt-in, lib/newsletter.ts) — from the footer /
// home form or the marketing tick in a customer account. A consent that was never confirmed (pending row, or
// customers.marketing_consent_at alone) is not a subscriber. One row per e-mail.

export const SUBSCRIBERS_PER_PAGE = 50;

export type Subscriber = {
  email: string;
  name: string;
  locale: Lang;
  /** Always true (kept for the CSV "source" column). */
  newsletter: boolean;
  /** A customer account with this e-mail and marketing consent. */
  customerId: number | null;
  /** When the subscription was confirmed. */
  since: string;
};

type Row = { email: string; name: string | null; locale: string; newsletter: number; customer_id: number | null; since: string };

// Confirmed newsletter rows, with the matching customer account (name) when there is one.
const MERGED = `
  SELECT n.email AS email, TRIM(c.first_name || ' ' || c.last_name) AS name, n.locale AS locale, 1 AS newsletter,
    CASE WHEN c.marketing_consent_at IS NOT NULL THEN c.id END AS customer_id, n.confirmed_at AS since
  FROM newsletter n LEFT JOIN customers c ON c.email = n.email
  WHERE ${isConfirmedSql("n")}`;

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function toSubscriber(r: Row): Subscriber {
  return {
    email: r.email,
    name: r.name ?? "",
    locale: isLang(r.locale) ? r.locale : "bg",
    newsletter: !!r.newsletter,
    customerId: r.customer_id,
    since: r.since,
  };
}

function filter(q: string | null | undefined): { sql: string; params: string[] } {
  const t = (q ?? "").trim().slice(0, 100);
  if (!t) return { sql: "", params: [] };
  const like = `%${likeEscape(t.toLowerCase())}%`;
  return { sql: "WHERE ulower(email) LIKE ? ESCAPE '\\' OR ulower(COALESCE(name, '')) LIKE ? ESCAPE '\\'", params: [like, like] };
}

/** Newest first. */
export function listSubscribers(opts: { q?: string | null; page?: number }): { items: Subscriber[]; total: number; page: number; pageCount: number } {
  const db = adminStoreDb();
  const f = filter(opts.q);
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM (${MERGED}) ${f.sql}`).get(...f.params) as { n: number }).n;
  const pageCount = Math.max(1, Math.ceil(total / SUBSCRIBERS_PER_PAGE));
  const page = Math.min(Math.max(1, Math.floor(opts.page ?? 1) || 1), pageCount);
  const rows = db
    .prepare(`SELECT * FROM (${MERGED}) ${f.sql} ORDER BY since DESC LIMIT ? OFFSET ?`)
    .all(...f.params, SUBSCRIBERS_PER_PAGE, (page - 1) * SUBSCRIBERS_PER_PAGE) as Row[];
  return { items: rows.map(toSubscriber), total, page, pageCount };
}

export function subscribersCount(): number {
  return (adminStoreDb().prepare(`SELECT COUNT(*) AS n FROM (${MERGED})`).get() as { n: number }).n;
}

/** Every subscriber, oldest first (CSV export). */
export function allSubscribers(): Subscriber[] {
  return (adminStoreDb().prepare(`SELECT * FROM (${MERGED}) ORDER BY since`).all() as Row[]).map(toSubscriber);
}

/** Unsubscribe an e-mail everywhere (newsletter row + the account's marketing consent). */
export function unsubscribe(email: string): boolean {
  const e = email.trim().toLowerCase().slice(0, 200);
  if (!e) return false;
  const db = adminStoreDb();
  return db.transaction(() => {
    const a = db.prepare("DELETE FROM newsletter WHERE ulower(email) = ?").run(e).changes;
    const b = db.prepare("UPDATE customers SET marketing_consent_at = NULL WHERE ulower(email) = ? AND marketing_consent_at IS NOT NULL").run(e).changes;
    return a + b > 0;
  })();
}

/** One CSV cell (also used by the price export in lib/admin/prices.ts). */
export const csvCell = (v: string) => {
  // Spreadsheet formula injection: a cell starting with = + - @ is shown as text.
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV (UTF-8 with BOM so Excel opens Cyrillic correctly): e-mail, name, language, source, date. */
export function subscribersCsv(): string {
  const rows = allSubscribers();
  const lines = [
    ["email", "name", "language", "source", "confirmed_at"].join(","),
    ...rows.map((s) =>
      [s.email, s.name, s.locale, s.customerId ? "newsletter+account" : "newsletter", s.since].map(csvCell).join(","),
    ),
  ];
  return `﻿${lines.join("\r\n")}\r\n`;
}
