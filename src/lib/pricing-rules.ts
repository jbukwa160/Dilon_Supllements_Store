// Price engine entry points for the site (SPEC §5.5): the engine itself is price-engine.ts (shared with the importer).
// Scheduled promotion / sale starts and ends are applied by runDuePrices(), which the scheduler (lib/scheduler.ts,
// started from src/instrumentation.ts) runs at the boundary — never inside a shop request.
import "server-only";
import { catalogDb, storeDb } from "./db";
import { computePrices, computePricesInSteps, omnibusPrice, promotionsRevision } from "./price-engine";
import { requestSiteRevalidate } from "./revalidate";

/** Same counter as catalog.ts catalogChanged() (kept here to avoid an import cycle). */
const writes = globalThis as unknown as { __catalogWrites?: number };
function catalogWrites() {
  writes.__catalogWrites = (writes.__catalogWrites ?? 0) + 1;
}

/** Set by the running scheduler: re-plans its timer after the next boundary may have moved. */
type SchedulerHook = { replan(): void };
const hooks = globalThis as unknown as { __spPriceScheduler?: SchedulerHook; __pricesCheckedAt?: number; __priceJob?: Promise<{ changed: number }> | null };

/**
 * Recompute effective prices (all products, or the given SKUs) from base prices, manual sales and active promotions;
 * writes the changes and store.db price_history. Returns how many products changed.
 */
export function recomputePrices(opts: { skus?: string[] } = {}): { changed: number } {
  const r = computePrices(catalogDb(), storeDb(), opts);
  if (r.changed) catalogWrites();
  hooks.__spPriceScheduler?.replan();
  return r;
}

function priceMeta(): Map<string, string> {
  const rows = catalogDb().prepare("SELECT key, value FROM meta WHERE key IN ('next_price_change_at', 'promotions_rev')").all() as { key: string; value: string }[];
  return new Map(rows.map((r) => [r.key, r.value]));
}

/** When the next promotion / sale start or end is due (ms since epoch; possibly already past), or null. */
export function nextPriceChangeAt(): number | null {
  const t = Date.parse(priceMeta().get("next_price_change_at") ?? "");
  return Number.isFinite(t) ? t : null;
}

/** A full recompute is due: a promotion / sale boundary has passed, or the promotions changed since the last run. */
export function pricesDue(now = Date.now()): boolean {
  const meta = priceMeta();
  const next = Date.parse(meta.get("next_price_change_at") ?? "");
  return (Number.isFinite(next) && next <= now) || (meta.get("promotions_rev") ?? "") !== promotionsRevision(storeDb());
}

/**
 * The scheduled job: when prices are due, recompute every product and refresh the cached pages (home…:
 * revalidatePath is only allowed inside a request, so this goes through /api/internal/revalidate). One run at a time
 * per process; a call while one is running shares its result.
 */
export function runDuePrices(): Promise<{ changed: number }> {
  if (hooks.__priceJob) return hooks.__priceJob;
  const job = (async () => {
    if (!pricesDue()) return { changed: 0 };
    const started = performance.now();
    // In steps with pauses for shop requests; worked out again if an admin saves a product or promotion meanwhile.
    const version = () => `${writes.__catalogWrites ?? 0}|${promotionsRevision(storeDb())}`;
    const before = version();
    const { changed } = await computePricesInSteps(catalogDb(), storeDb(), () => version() === before);
    if (changed) catalogWrites();
    hooks.__spPriceScheduler?.replan();
    const ms = Math.round(performance.now() - started);
    if (!changed) return { changed };
    const refreshed = await requestSiteRevalidate({ store: storeDb(), quiet: true, timeoutMs: 30_000 });
    console.log(`[prices] scheduled change: ${changed} product prices updated in ${ms} ms; cached pages ${refreshed ? "refreshed" : "NOT refreshed (revalidate route unreachable)"}`);
    return { changed };
  })();
  hooks.__priceJob = job.finally(() => {
    hooks.__priceJob = null;
  });
  return hooks.__priceJob;
}

const CHECK_EVERY_MS = 60_000;

/**
 * Called on shop requests. Cheap and throttled (<= once per 60 s per process): when a promotion / sale boundary has
 * passed and the scheduler hasn't applied it yet, starts runDuePrices() in the background — the request itself is
 * served with the current prices and never waits for the recompute.
 */
export function ensurePricesFresh(): void {
  // `next build` prerenders with the prices as they are; the started server applies anything due (scheduler start-up).
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const now = Date.now();
  if (hooks.__pricesCheckedAt && now - hooks.__pricesCheckedAt < CHECK_EVERY_MS) return;
  hooks.__pricesCheckedAt = now;
  try {
    if (!hooks.__priceJob && pricesDue(now)) {
      setTimeout(() => {
        runDuePrices().catch((e) => console.error("[prices] could not refresh prices", e));
      }, 0);
    }
  } catch (e) {
    console.error("[prices] could not check prices", e);
  }
}

/**
 * Omnibus reference price of a product: when reduced, the lowest price in the 30 days before the reduction started;
 * otherwise the lowest price of the last 30 days including today — what a reduction starting now would be compared
 * with. null for an unknown SKU.
 */
export function lowestPrice30(sku: string): number | null {
  return omnibusPrice(catalogDb(), storeDb(), sku);
}
