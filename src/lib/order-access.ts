import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { storeDb } from "./db";
import { getAdmin } from "./auth";
import { getCustomer } from "./customer-auth";

// Who may see an order's details (/porachka/[id]): the browser that placed it, the customer who owns it, or an
// admin. The order id in the URL alone is NOT enough (it ends up in browser history, screenshots, shared links).
// The browser proves possession with the "sp_orders" cookie: up to 10 "id.signature" entries, HMAC-signed with a
// server secret, so a cookie with someone else's order id cannot be forged.

export const ORDERS_COOKIE = "sp_orders";
const MAX_ENTRIES = 10;
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // seconds

const g = globalThis as unknown as { __orderViewSecret?: string };

/** ORDER_VIEW_SECRET from the environment, else a random secret generated once and kept in store.db (settings "_secret"). */
function secret(): string {
  const env = process.env.ORDER_VIEW_SECRET;
  if (env && env.length >= 16) return env;
  if (!g.__orderViewSecret) {
    const db = storeDb();
    // INSERT OR IGNORE + read back: two processes starting at once end up with the same secret.
    db.prepare("INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('_secret', ?, ?)").run(
      JSON.stringify(randomBytes(32).toString("base64url")),
      new Date().toISOString(),
    );
    const row = db.prepare("SELECT value FROM settings WHERE key = '_secret'").get() as { value: string };
    g.__orderViewSecret = JSON.parse(row.value) as string;
  }
  return g.__orderViewSecret;
}

const sign = (id: string) => createHmac("sha256", secret()).update(`order:${id}`).digest("base64url").slice(0, 22);

function sameString(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Order ids with a valid signature in this browser's cookie (newest first). */
async function signedIds(): Promise<string[]> {
  const raw = (await cookies()).get(ORDERS_COOKIE)?.value ?? "";
  const ids: string[] = [];
  for (const entry of raw.split("~").slice(0, MAX_ENTRIES)) {
    const dot = entry.lastIndexOf(".");
    if (dot <= 0) continue;
    const id = entry.slice(0, dot);
    if (/^[\w-]{1,64}$/.test(id) && sameString(entry.slice(dot + 1), sign(id))) ids.push(id);
  }
  return ids;
}

/** Remember that this browser placed `orderId`. Call from the placeOrder Server Action (it sets a cookie). */
export async function rememberOrder(orderId: string): Promise<void> {
  const ids = [orderId, ...(await signedIds()).filter((id) => id !== orderId)].slice(0, MAX_ENTRIES);
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? (h.get("origin")?.startsWith("https:") ? "https" : "http");
  (await cookies()).set(ORDERS_COOKIE, ids.map((id) => `${id}.${sign(id)}`).join("~"), {
    httpOnly: true,
    sameSite: "lax",
    secure: proto === "https",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

/**
 * May this request see the full order? True for the browser that placed it (signed cookie), the signed-in
 * customer who owns it, or an admin (the admin cookie only reaches /admin/** URLs). Otherwise show only
 * "Поръчка №N е приета" without personal data.
 */
export async function canViewOrder(orderId: string): Promise<boolean> {
  if (!orderId) return false;
  if ((await signedIds()).includes(orderId)) return true;
  const customer = await getCustomer();
  if (customer) {
    const row = storeDb().prepare("SELECT customer_id FROM orders WHERE id = ?").get(orderId) as { customer_id: number | null } | undefined;
    if (row && row.customer_id === customer.id) return true;
  }
  return !!(await getAdmin());
}
