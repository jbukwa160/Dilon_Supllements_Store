import "server-only";
import { cache } from "react";
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { clientAddressFrom, requestIsHttps } from "./client-ip";
import { storeDb } from "./db";
import { loginContext, loginFailed, loginSucceeded, loginWait, waitTextBg } from "./login-guard";
import { verifyPassword } from "./password";

export const SESSION_COOKIE = "sp_admin";
const SHORT_SESSION_MS = 12 * 60 * 60 * 1000; // 12 hours
const LONG_SESSION_MS = 30 * 24 * 60 * 60 * 1000; // "remember me": 30 days
// Wrong passwords: see lib/login-guard.ts (per address lock, per username growing wait, known devices).

export type Admin = { id: number; username: string };

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

async function requestInfo() {
  const h = await headers();
  return { ip: clientAddressFrom(h).ip, userAgent: (h.get("user-agent") ?? "").slice(0, 200), secure: requestIsHttps(h) };
}

/** The logged-in admin for this request, or null. Checked against the DB every time. */
export const getAdmin = cache(async (): Promise<Admin | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length < 20) return null;
  const db = storeDb();
  const row = db
    .prepare(
      `SELECT u.id, u.username, s.expires_at, s.last_seen_at FROM admin_sessions s JOIN admin_users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
    )
    .get(sha256(token)) as { id: number; username: string; expires_at: string; last_seen_at: string } | undefined;
  if (!row) return null;
  const now = Date.now();
  if (Date.parse(row.expires_at) <= now) {
    db.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").run(sha256(token));
    return null;
  }
  if (now - Date.parse(row.last_seen_at) > 60_000) {
    db.prepare("UPDATE admin_sessions SET last_seen_at = ? WHERE token_hash = ?").run(new Date(now).toISOString(), sha256(token));
  }
  return { id: row.id, username: row.username };
});

/** Use at the top of every admin page and server action. Redirects to the login page if not signed in. */
export async function requireAdmin(): Promise<Admin> {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

export function hasAdminUsers(): boolean {
  return !!storeDb().prepare("SELECT 1 FROM admin_users LIMIT 1").get();
}

type LoginResult = { ok: true } | { ok: false; error: string };

export async function login(username: string, password: string, remember: boolean): Promise<LoginResult> {
  const db = storeDb();
  const { ip, userAgent, secure } = await requestInfo();
  const now = Date.now();

  const user = db.prepare("SELECT id, username, password_hash FROM admin_users WHERE username = ?").get(username) as
    | { id: number; username: string; password_hash: string }
    | undefined;
  const guard = await loginContext("admin", username.toLowerCase(), user?.password_hash ?? null);
  const wait = loginWait(guard, now);
  if (wait > 0) return { ok: false, error: `Твърде много неуспешни опити. Опитайте отново след ${waitTextBg(wait)}` };

  // Verify even for unknown users so response time doesn't reveal which usernames exist.
  const valid = verifyPassword(password, user?.password_hash ?? "scrypt$16384$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "==") && !!user;

  if (!valid || !user) {
    const next = loginFailed(guard, now);
    return {
      ok: false,
      error:
        next > 0
          ? `Грешно потребителско име или парола. Следващ опит след ${waitTextBg(next)}`
          : "Грешно потребителско име или парола.",
    };
  }

  await loginSucceeded(guard, user.password_hash);
  db.prepare("DELETE FROM admin_sessions WHERE expires_at < ?").run(new Date(now).toISOString());

  const token = randomBytes(32).toString("base64url");
  const ttl = remember ? LONG_SESSION_MS : SHORT_SESSION_MS;
  const expires = new Date(now + ttl);
  db.prepare(
    "INSERT INTO admin_sessions (token_hash, user_id, created_at, expires_at, last_seen_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(sha256(token), user.id, new Date(now).toISOString(), expires.toISOString(), new Date(now).toISOString(), ip, userAgent);
  db.prepare("UPDATE admin_users SET last_login_at = ? WHERE id = ?").run(new Date(now).toISOString(), user.id);

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/admin",
    ...(remember ? { expires } : {}),
  });
  return { ok: true };
}

export async function logout() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) storeDb().prepare("DELETE FROM admin_sessions WHERE token_hash = ?").run(sha256(token));
  store.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/admin", maxAge: 0 });
}

/** Sign out every other device of this admin (after a password change). */
export async function endOtherSessions(userId: number) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  storeDb().prepare("DELETE FROM admin_sessions WHERE user_id = ? AND token_hash <> ?").run(userId, sha256(token));
}
