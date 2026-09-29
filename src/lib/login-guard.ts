import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { clientAddressFrom, requestIsHttps, type ClientAddress } from "./client-ip";
import { storeDb } from "./db";

// Brute-force protection for the admin and customer sign-in (lib/auth.ts, lib/customer-auth.ts), in login_attempts:
//   - per visitor address (client-ip.ts): 10 failures in 15 min lock that address for 15 min, whichever accounts
//     were tried (password spraying);
//   - per account: no hard lock (a stranger could otherwise lock the owner out), but a growing wait between tries
//     after 5 failures in 24 h — 2 s, 4 s, 8 s … up to 15 min — so guessing stays impossibly slow;
//   - a "known device" (this browser signed in to this account before: signed cookie, invalid after a password
//     change) skips both and only has its own counter (10 failures → that browser waits 15 min).
// A successful sign-in clears the account's and the device's counters, never the address's.

export type GuardScope = "admin" | "customer";

const IP_MAX = 10;
const IP_WINDOW = 15 * 60_000;
const IP_LOCK = 15 * 60_000;
const DEVICE_MAX = 10;
const DEVICE_LOCK = 15 * 60_000;
const USER_FREE = 5;
const USER_WINDOW = 24 * 60 * 60_000;
const USER_MAX_WAIT = 15 * 60_000;

/** Wait after the Nth failure of an account (0 below USER_FREE). */
export function accountDelay(failures: number): number {
  if (failures < USER_FREE) return 0;
  return Math.min(USER_MAX_WAIT, 1000 * 2 ** (failures - USER_FREE + 1));
}

/** Known-device cookies (listed in the Cookie Policy, components/info/legal/cookie-names.ts). */
export const DEVICE_COOKIES = { customer: "sp_dev", admin: "sp_admin_dev" } as const;
const DEVICE_COOKIE: Record<GuardScope, { name: string; path: string }> = {
  admin: { name: DEVICE_COOKIES.admin, path: "/admin" },
  customer: { name: DEVICE_COOKIES.customer, path: "/" },
};
const DEVICE_MAX_AGE = 365 * 24 * 60 * 60; // seconds
const DEVICE_MAX_ACCOUNTS = 5;

// Keys in login_attempts. The account keys keep their old shape ("user:<name>", "c:user:<e-mail>"): account deletion
// and password reset clear them by that name.
const ipKey = (scope: GuardScope, addr: ClientAddress) => `${scope === "admin" ? "a" : "c"}:ip:${addr.key}`;
export const accountKey = (scope: GuardScope, name: string) => (scope === "admin" ? `user:${name}` : `c:user:${name}`);
const deviceKey = (scope: GuardScope, id: string) => `${scope === "admin" ? "a" : "c"}:dev:${id}`;

type Attempt = { failures: number; first_at: string; locked_until: string | null };

function attempt(key: string): Attempt | undefined {
  return storeDb().prepare("SELECT failures, first_at, locked_until FROM login_attempts WHERE key = ?").get(key) as Attempt | undefined;
}

function waitOf(key: string, now: number): number {
  const a = attempt(key);
  const until = a?.locked_until ? Date.parse(a.locked_until) : 0;
  return until > now ? until - now : 0;
}

/** Counts a failure of `key` within `window`; `lockFor(failures)` gives how long the key must then wait. */
function countFailure(key: string, window: number, now: number, lockFor: (failures: number) => number): number {
  const a = attempt(key);
  const fresh = !a || now - Date.parse(a.first_at) > window;
  const failures = fresh ? 1 : a.failures + 1;
  const wait = lockFor(failures);
  storeDb()
    .prepare(
      `INSERT INTO login_attempts (key, failures, first_at, locked_until) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET failures = excluded.failures, first_at = excluded.first_at, locked_until = excluded.locked_until`,
    )
    .run(key, failures, fresh ? new Date(now).toISOString() : a.first_at, wait > 0 ? new Date(now + wait).toISOString() : null);
  return wait;
}

// ---------------------------------------------------------------------------------------------------------------
// Known devices: cookie "<device id>:<sig>~<sig>…" — one random id per browser and an HMAC per account it signed in to.

const g = globalThis as unknown as { __deviceKey?: Buffer };

/** HMAC key derived from the server secret in store.db (settings "_secret", shared with lib/order-access.ts). */
function deviceSecret(): Buffer {
  if (!g.__deviceKey) {
    const db = storeDb();
    db.prepare("INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('_secret', ?, ?)").run(
      JSON.stringify(randomBytes(32).toString("base64url")),
      new Date().toISOString(),
    );
    const row = db.prepare("SELECT value FROM settings WHERE key = '_secret'").get() as { value: string };
    const base = process.env.ORDER_VIEW_SECRET && process.env.ORDER_VIEW_SECRET.length >= 16 ? process.env.ORDER_VIEW_SECRET : (JSON.parse(row.value) as string);
    g.__deviceKey = createHmac("sha256", base).update("known-device").digest();
  }
  return g.__deviceKey;
}

/**
 * Signature of "this device signed in to this account". `passwordHash` makes it account-state bound: a password
 * change or reset turns every known device of the account into an unknown one.
 */
function deviceSig(scope: GuardScope, name: string, deviceId: string, passwordHash: string): string {
  const stamp = createHash("sha256").update(passwordHash).digest("base64url").slice(0, 16);
  return createHmac("sha256", deviceSecret()).update(`${scope}|${name}|${deviceId}|${stamp}`).digest("base64url").slice(0, 27);
}

type DeviceCookie = { id: string; sigs: string[] };

async function readDevice(scope: GuardScope): Promise<DeviceCookie | null> {
  const raw = (await cookies()).get(DEVICE_COOKIE[scope].name)?.value ?? "";
  const m = raw.match(/^([A-Za-z0-9_-]{22}):([A-Za-z0-9_~-]{0,200})$/);
  if (!m) return null;
  return { id: m[1], sigs: m[2].split("~").filter((s) => /^[A-Za-z0-9_-]{27}$/.test(s)).slice(0, DEVICE_MAX_ACCOUNTS) };
}

function sameSig(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export type LoginContext = {
  scope: GuardScope;
  /** Lower-cased user name / e-mail. */
  name: string;
  addr: ClientAddress;
  /** The browser's device id when it is a known device of this account. */
  knownDevice: string | null;
  deviceId: string | null;
  secure: boolean;
};

/**
 * Everything the guard needs about this sign-in attempt. `passwordHash` is the account's current hash (null for an
 * unknown account — then no device is "known").
 */
export async function loginContext(scope: GuardScope, name: string, passwordHash: string | null): Promise<LoginContext> {
  const h = await headers();
  const device = await readDevice(scope);
  let knownDevice: string | null = null;
  if (device && passwordHash) {
    const sig = deviceSig(scope, name, device.id, passwordHash);
    if (device.sigs.some((s) => sameSig(s, sig))) knownDevice = device.id;
  }
  return { scope, name, addr: clientAddressFrom(h), knownDevice, deviceId: device?.id ?? null, secure: requestIsHttps(h) };
}

/** Milliseconds this attempt must wait before the password is even checked (0 = go ahead). */
export function loginWait(ctx: LoginContext, now = Date.now()): number {
  if (ctx.knownDevice) return waitOf(deviceKey(ctx.scope, ctx.knownDevice), now);
  return Math.max(waitOf(ipKey(ctx.scope, ctx.addr), now), waitOf(accountKey(ctx.scope, ctx.name), now));
}

/** Records a wrong password; returns how long the next attempt from here must wait (0 = none). */
export function loginFailed(ctx: LoginContext, now = Date.now()): number {
  if (ctx.knownDevice) return countFailure(deviceKey(ctx.scope, ctx.knownDevice), DEVICE_LOCK, now, (n) => (n >= DEVICE_MAX ? DEVICE_LOCK : 0));
  const ipWait = countFailure(ipKey(ctx.scope, ctx.addr), IP_WINDOW, now, (n) => (n >= IP_MAX ? IP_LOCK : 0));
  const userWait = countFailure(accountKey(ctx.scope, ctx.name), USER_WINDOW, now, accountDelay);
  return Math.max(ipWait, userWait);
}

/**
 * A correct password: clears the account's and this device's counters and remembers the browser as a known device
 * of the account (Server Actions / Route Handlers only — it sets a cookie).
 */
export async function loginSucceeded(ctx: LoginContext, passwordHash: string): Promise<void> {
  const db = storeDb();
  db.prepare("DELETE FROM login_attempts WHERE key = ?").run(accountKey(ctx.scope, ctx.name));
  if (ctx.knownDevice) db.prepare("DELETE FROM login_attempts WHERE key = ?").run(deviceKey(ctx.scope, ctx.knownDevice));
  const device = await readDevice(ctx.scope);
  const id = device?.id ?? randomBytes(16).toString("base64url");
  const sig = deviceSig(ctx.scope, ctx.name, id, passwordHash);
  const sigs = [sig, ...(device?.sigs ?? []).filter((s) => s !== sig)].slice(0, DEVICE_MAX_ACCOUNTS);
  const c = DEVICE_COOKIE[ctx.scope];
  (await cookies()).set(c.name, `${id}:${sigs.join("~")}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: ctx.secure,
    path: c.path,
    maxAge: DEVICE_MAX_AGE,
  });
}

/** "2 мин." / "30 сек." for the admin messages. */
export function waitTextBg(ms: number): string {
  return ms >= 60_000 ? `${Math.ceil(ms / 60_000)} мин.` : `${Math.max(1, Math.ceil(ms / 1000))} сек.`;
}
