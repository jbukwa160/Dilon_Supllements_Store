import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { isLang, type Lang } from "@/i18n/config";
import { storeDb } from "./db";

// Chat bubble: a visitor's conversation is found by a random token kept in an httpOnly cookie (only its hash is
// stored). The admin answers from Admin → Чат. Each conversation remembers the visitor's language (staff reply in
// it) and, when the visitor is signed in, their customer account.
//
// Privacy on shared computers: a conversation that belongs to a customer account is only shown to that signed-in
// customer (conversationFor), it is never moved to another account, and signing in / out drops the cookie
// (lib/customer-auth.ts). Deleting the account deletes its conversations (lib/customer-account.ts).

export const CHAT_COOKIE = "sp_chat";
export const CHAT_COOKIE_MAX_AGE = 90 * 24 * 60 * 60; // seconds
export const CHAT_LIMITS = { body: 1000, name: 60, contact: 100, messagesPerConversation: 400 };

export type ChatSender = "visitor" | "admin";
export type ChatMessage = { id: number; sender: ChatSender; body: string; createdAt: string };
export type ChatStatus = "open" | "closed";

export type ChatConversation = {
  id: number;
  name: string | null;
  contact: string | null;
  page: string | null;
  userAgent: string | null;
  status: ChatStatus;
  createdAt: string;
  lastMessageAt: string;
  unreadAdmin: number;
  unreadVisitor: number;
  locale: Lang;
  customerId: number | null;
  /** The signed-in customer's account (admin side only; null for guests or a deleted account). */
  customer: { id: number; name: string; email: string; phone: string } | null;
};

export type ChatSummary = ChatConversation & { lastMessage: { sender: ChatSender; body: string } | null; messageCount: number };

type ConvRow = {
  id: number;
  name: string | null;
  contact: string | null;
  page: string | null;
  user_agent: string | null;
  status: string;
  created_at: string;
  last_message_at: string;
  unread_admin: number;
  unread_visitor: number;
  locale: string;
  customer_id: number | null;
  c_first: string | null;
  c_last: string | null;
  c_email: string | null;
  c_phone: string | null;
};

const CONV_SELECT = `SELECT cv.*, cu.first_name AS c_first, cu.last_name AS c_last, cu.email AS c_email, cu.phone AS c_phone
  FROM chat_conversations cv LEFT JOIN customers cu ON cu.id = cv.customer_id`;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const nowIso = () => new Date().toISOString();

function toConversation(r: ConvRow): ChatConversation {
  return {
    id: r.id,
    name: r.name,
    contact: r.contact,
    page: r.page,
    userAgent: r.user_agent,
    status: r.status === "closed" ? "closed" : "open",
    createdAt: r.created_at,
    lastMessageAt: r.last_message_at,
    unreadAdmin: r.unread_admin,
    unreadVisitor: r.unread_visitor,
    locale: isLang(r.locale) ? r.locale : "bg",
    customerId: r.customer_id,
    customer:
      r.customer_id && r.c_email
        ? { id: r.customer_id, name: `${r.c_first ?? ""} ${r.c_last ?? ""}`.trim(), email: r.c_email, phone: r.c_phone ?? "" }
        : null,
  };
}

/** Keeps the text as typed (line breaks included) but drops control characters and trims it to `max`. */
export function cleanText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

// ---------------------------------------------------------------------------
// Visitor side

export function conversationByToken(token: string | undefined): ChatConversation | null {
  if (!token || token.length < 20 || token.length > 100) return null;
  const r = storeDb().prepare(`${CONV_SELECT} WHERE cv.token_hash = ?`).get(sha256(token)) as ConvRow | undefined;
  return r ? toConversation(r) : null;
}

/**
 * The cookie's conversation, if this visitor may see it: a guest conversation to whoever holds the cookie, a
 * customer's conversation only to that customer while signed in (not to a guest or another account on the same
 * browser).
 */
export function conversationFor(token: string | undefined, customerId: number | null): ChatConversation | null {
  const conv = conversationByToken(token);
  if (!conv) return null;
  return conv.customerId == null || conv.customerId === customerId ? conv : null;
}

export function startConversation(meta: { page: string | null; ip: string | null; userAgent: string; locale: Lang; customerId: number | null }): { id: number; token: string } {
  const token = randomBytes(24).toString("base64url");
  const t = nowIso();
  const r = storeDb()
    .prepare(
      `INSERT INTO chat_conversations (token_hash, page, ip, user_agent, created_at, last_message_at, locale, customer_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(sha256(token), meta.page, meta.ip, meta.userAgent, t, t, meta.locale, meta.customerId);
  return { id: Number(r.lastInsertRowid), token };
}

export function messageCount(conversationId: number): number {
  return (storeDb().prepare("SELECT COUNT(*) AS n FROM chat_messages WHERE conversation_id = ?").get(conversationId) as { n: number }).n;
}

/** Adds a message and updates the unread counters. A visitor's message re-opens a closed conversation. */
export function addMessage(conversationId: number, sender: ChatSender, body: string): ChatMessage {
  const db = storeDb();
  const t = nowIso();
  return db.transaction(() => {
    const r = db.prepare("INSERT INTO chat_messages (conversation_id, sender, body, created_at) VALUES (?, ?, ?, ?)").run(conversationId, sender, body, t);
    if (sender === "visitor") {
      db.prepare("UPDATE chat_conversations SET last_message_at = ?, unread_admin = unread_admin + 1, status = 'open' WHERE id = ?").run(t, conversationId);
    } else {
      db.prepare("UPDATE chat_conversations SET last_message_at = ?, unread_visitor = unread_visitor + 1, unread_admin = 0 WHERE id = ?").run(t, conversationId);
    }
    return { id: Number(r.lastInsertRowid), sender, body, createdAt: t };
  })();
}

export function messagesAfter(conversationId: number, afterId = 0, limit = 300): ChatMessage[] {
  const rows = storeDb()
    .prepare("SELECT id, sender, body, created_at FROM chat_messages WHERE conversation_id = ? AND id > ? ORDER BY id LIMIT ?")
    .all(conversationId, afterId, limit) as { id: number; sender: string; body: string; created_at: string }[];
  return rows.map((r) => ({ id: r.id, sender: r.sender === "admin" ? "admin" : "visitor", body: r.body, createdAt: r.created_at }));
}

export function markReadByVisitor(conversationId: number) {
  storeDb().prepare("UPDATE chat_conversations SET unread_visitor = 0 WHERE id = ? AND unread_visitor > 0").run(conversationId);
}

/**
 * Where the visitor is now: the page they last wrote from and their language. A guest conversation continued while
 * signed in is linked to that account; a conversation that already has an account is never moved to another one.
 */
export function updateVisitorContext(conversationId: number, ctx: { page: string | null; locale: Lang; customerId: number | null }) {
  storeDb()
    .prepare("UPDATE chat_conversations SET page = COALESCE(?, page), locale = ?, customer_id = COALESCE(customer_id, ?) WHERE id = ?")
    .run(ctx.page, ctx.locale, ctx.customerId, conversationId);
}

export function setVisitorContact(conversationId: number, name: string, contact: string) {
  storeDb().prepare("UPDATE chat_conversations SET name = ?, contact = ? WHERE id = ?").run(name || null, contact || null, conversationId);
}

/** The visitor left a way to be reached (typed a contact, or is a signed-in customer). */
export function hasContact(c: ChatConversation): boolean {
  return !!(c.name || c.contact || c.customerId);
}

// ---------------------------------------------------------------------------
// "On line" = the admin panel was open in the last 90 seconds (it checks for new messages every 15 s).

const g = globalThis as unknown as { __chatAdminSeen?: number };

export function touchAdminPresence() {
  g.__chatAdminSeen = Date.now();
}

export function adminOnline(): boolean {
  return Date.now() - (g.__chatAdminSeen ?? 0) < 90_000;
}

// ---------------------------------------------------------------------------
// Admin side

export type ChatFilter = "open" | "closed" | "all";

export function listConversations(filter: ChatFilter, limit = 200): ChatSummary[] {
  const where = filter === "all" ? "" : "WHERE cv.status = ?";
  const rows = storeDb()
    .prepare(
      `SELECT * FROM (
         SELECT cv.*, cu.first_name AS c_first, cu.last_name AS c_last, cu.email AS c_email, cu.phone AS c_phone,
           (SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id = cv.id) AS message_count,
           (SELECT sender || char(31) || body FROM chat_messages m WHERE m.conversation_id = cv.id ORDER BY m.id DESC LIMIT 1) AS last_message
         FROM chat_conversations cv LEFT JOIN customers cu ON cu.id = cv.customer_id
         ${where}
       ) WHERE message_count > 0
       ORDER BY unread_admin > 0 DESC, last_message_at DESC LIMIT ?`,
    )
    .all(...(filter === "all" ? [] : [filter]), limit) as (ConvRow & { message_count: number; last_message: string | null })[];
  return rows.map((r) => {
    const [sender, ...rest] = (r.last_message ?? "").split("\u001f");
    return {
      ...toConversation(r),
      messageCount: r.message_count,
      lastMessage: r.last_message ? { sender: sender === "admin" ? "admin" : "visitor", body: rest.join("\u001f").slice(0, 160) } : null,
    };
  });
}

export function getConversation(id: number): ChatConversation | null {
  const r = storeDb().prepare(`${CONV_SELECT} WHERE cv.id = ?`).get(id) as ConvRow | undefined;
  return r ? toConversation(r) : null;
}

export function markReadByAdmin(id: number) {
  storeDb().prepare("UPDATE chat_conversations SET unread_admin = 0 WHERE id = ? AND unread_admin > 0").run(id);
}

export function setConversationStatus(id: number, status: ChatStatus) {
  storeDb().prepare("UPDATE chat_conversations SET status = ? WHERE id = ?").run(status, id);
}

export function deleteConversation(id: number) {
  const db = storeDb();
  db.transaction(() => {
    db.prepare("DELETE FROM chat_messages WHERE conversation_id = ?").run(id);
    db.prepare("DELETE FROM chat_conversations WHERE id = ?").run(id);
  })();
}

/** Conversations with messages the admin hasn't read yet (for the menu badge). */
export function unreadConversationCount(): number {
  return (storeDb().prepare("SELECT COUNT(*) AS n FROM chat_conversations WHERE unread_admin > 0").get() as { n: number }).n;
}

/** A customer's conversations (admin customer page). */
export function conversationsOfCustomer(customerId: number): { id: number; lastMessageAt: string; status: ChatStatus; messageCount: number }[] {
  return (
    storeDb()
      .prepare(
        `SELECT cv.id, cv.last_message_at, cv.status, (SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id = cv.id) AS n
         FROM chat_conversations cv WHERE cv.customer_id = ? ORDER BY cv.last_message_at DESC LIMIT 50`,
      )
      .all(customerId) as { id: number; last_message_at: string; status: string; n: number }[]
  ).map((r) => ({ id: r.id, lastMessageAt: r.last_message_at, status: r.status === "closed" ? "closed" : "open", messageCount: r.n }));
}
