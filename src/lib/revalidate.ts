// Refresh the cached (static / ISR) storefront pages from outside a Server Action: the price scheduler (a timer in
// src/instrumentation.ts) and CLI scripts such as `npm run import` POST to /api/internal/revalidate, whose route
// handler runs revalidatePath("/", "layout") (Next only allows that inside a request).
//
// The request carries a token: REVALIDATE_SECRET from the environment, or one derived from the random server secret
// kept in data/store.db (settings "_secret", also used to sign the order cookie), so the site and the scripts on the
// same machine agree without configuration.
//
// No "server-only" and no lib/db.ts import: CLI scripts run this outside Next.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

type DB = Database.Database;

export const REVALIDATE_ROUTE = "/api/internal/revalidate";

/** The server secret in store.db (created once, like lib/order-access.ts does). */
function storeSecret(store: DB): string {
  // INSERT OR IGNORE + read back: two processes starting at once end up with the same secret.
  store
    .prepare("INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('_secret', ?, ?)")
    .run(JSON.stringify(randomBytes(32).toString("base64url")), new Date().toISOString());
  const row = store.prepare("SELECT value FROM settings WHERE key = '_secret'").get() as { value: string };
  return JSON.parse(row.value) as string;
}

/** The token a revalidation request must carry. */
export function revalidateToken(store: DB): string {
  const env = process.env.REVALIDATE_SECRET?.trim();
  if (env && env.length >= 16) return env;
  // Derived, so the raw cookie-signing secret never travels in a request.
  return createHmac("sha256", storeSecret(store)).update("site-revalidate").digest("base64url");
}

/** Constant-time check of a presented token. */
export function isRevalidateToken(store: DB, presented: string | null | undefined): boolean {
  if (!presented) return false;
  const a = createHmac("sha256", "cmp").update(presented).digest();
  const b = createHmac("sha256", "cmp").update(revalidateToken(store)).digest();
  // Comparing fixed-length digests: no early exit and no length leak.
  return timingSafeEqual(a, b);
}

/** Base address of the running site as seen from this machine. */
export function siteInternalUrl(): string {
  const configured = process.env.SITE_INTERNAL_URL?.trim().replace(/\/+$/, "");
  // Inside the Next server process PORT is the port it listens on; CLI scripts default to `next start`'s 3000.
  return configured || `http://localhost:${process.env.PORT || 3000}`;
}

function defaultStorePath(): string | null {
  const dir = process.env.DATA_DIR ? path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR) : path.join(process.cwd(), "data");
  const file = path.join(dir, "store.db");
  return fs.existsSync(file) ? file : null;
}

/**
 * Ask the running site to refresh its cached pages (home, brands, blog… in both languages). Never throws:
 * returns false when the site is not running or refused the request (then the pages refresh on their own revalidate
 * interval). `store` is an open store.db connection; without one, DATA_DIR/store.db is opened for the call.
 */
export async function requestSiteRevalidate(opts: { store?: DB; baseUrl?: string; timeoutMs?: number; quiet?: boolean } = {}): Promise<boolean> {
  const url = `${(opts.baseUrl ?? siteInternalUrl()).replace(/\/+$/, "")}${REVALIDATE_ROUTE}`;
  const log = (msg: string) => {
    if (!opts.quiet) console.warn(`[revalidate] ${msg}`);
  };
  let token: string;
  let own: DB | null = null;
  try {
    let store = opts.store;
    if (!store) {
      const file = defaultStorePath();
      if (!file) {
        log("no store.db — nothing to refresh");
        return false;
      }
      own = new Database(file, { fileMustExist: true });
      own.pragma("busy_timeout = 5000");
      store = own;
    }
    token = revalidateToken(store);
  } catch (e) {
    log(`could not read the server secret: ${(e as Error).message}`);
    return false;
  } finally {
    own?.close();
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
    });
    if (res.ok) return true;
    log(`${url} answered ${res.status}`);
  } catch (e) {
    log(`site not reachable at ${url} (${(e as Error).message}); cached pages refresh on their own interval`);
  }
  return false;
}
