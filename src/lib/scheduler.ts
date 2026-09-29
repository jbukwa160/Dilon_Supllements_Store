// Background jobs of the running site, started once per server process from src/instrumentation.ts (`next start` and
// `next dev`; not during `next build`). Everything runs on a timer, outside shop requests:
//   - at every promotion / sale start or end (meta next_price_change_at), and at least every minute: recompute prices
//     when due and refresh the cached pages (pricing-rules.ts runDuePrices);
//   - every minute: retry e-mails that could not be sent (mail.ts);
//   - a few minutes after start-up, then daily: prune the price history, delete personal data whose retention period is
//     over (retention.ts), reload the courier office / town lists (shipping).
import "server-only";
import { catalogDb, storeDb } from "./db";
import { retryFailedMail } from "./mail";
import { prunePriceHistory } from "./price-history";
import { nextPriceChangeAt, runDuePrices } from "./pricing-rules";
import { purgeExpiredData } from "./retention";
import { warmCourierCaches } from "./shipping";

const MAX_SLEEP_MS = 60_000;
const DAILY_MS = 24 * 60 * 60 * 1000;
/** First daily run after start-up: not while the server is still warming up. */
const DAILY_FIRST_DELAY_MS = 2 * 60_000;
const STARTUP_DELAY_MS = 5_000;

type Scheduler = { replan(): void; stop(): void };
const g = globalThis as unknown as { __spScheduler?: Scheduler; __spPriceScheduler?: { replan(): void } };

function logError(job: string, e: unknown) {
  console.error(`[scheduler] ${job} failed: ${e instanceof Error ? e.message : String(e)}`);
}

/** Price history older than 60 days (keeping what running reductions still need), expired personal data, courier lists. */
async function daily() {
  const started = performance.now();
  const parts: string[] = [];
  try {
    const reduced = catalogDb().prepare("SELECT sku, discount_since FROM products WHERE discount_since IS NOT NULL").all() as { sku: string; discount_since: string }[];
    const pruned = prunePriceHistory(storeDb(), new Map(reduced.map((r) => [r.sku, r.discount_since])));
    if (pruned) parts.push(`price history −${pruned} rows`);
  } catch (e) {
    logError("price history pruning", e);
  }
  const purged = purgeExpiredData();
  const purgedRows = Object.values(purged).reduce((a, b) => a + b, 0);
  if (purgedRows) parts.push(`expired personal data −${purgedRows} rows`);
  if (parts.length) console.log(`[scheduler] daily clean-up: ${parts.join(", ")} (${Math.round(performance.now() - started)} ms)`);
  // Network: never holds up the price timer.
  warmCourierCaches({ force: true }).catch((e) => logError("courier lists", e));
}

/**
 * Start the jobs (idempotent per process: a second call — e.g. instrumentation re-registered after a dev reload —
 * replaces the running timer instead of adding one).
 */
export function startScheduler(): void {
  const restarted = !!g.__spScheduler;
  g.__spScheduler?.stop();

  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let stopped = false;
  let nextDaily = Date.now() + DAILY_FIRST_DELAY_MS;

  // Next wake-up: the next price boundary, the daily jobs, or a minute from now, whichever comes first. Re-planned by
  // pricing-rules.ts after every recompute (an admin may have just scheduled a promotion starting in a few seconds).
  const plan = () => {
    if (stopped || running) return;
    if (timer) clearTimeout(timer);
    const now = Date.now();
    let wake = Math.min(now + MAX_SLEEP_MS, nextDaily);
    try {
      const next = nextPriceChangeAt();
      if (next !== null) wake = Math.min(wake, next);
    } catch (e) {
      logError("reading the next price change", e);
    }
    // setTimeout fires a little early at times: never before the boundary itself.
    timer = setTimeout(tick, Math.max(0, wake - now) + 50);
    timer.unref?.();
  };

  const tick = async () => {
    timer = null;
    if (stopped || running) return;
    running = true;
    try {
      await runDuePrices();
    } catch (e) {
      logError("price update", e);
    }
    retryFailedMail().catch((e) => logError("e-mail retry", e));
    if (Date.now() >= nextDaily) {
      nextDaily = Date.now() + DAILY_MS;
      await daily().catch((e) => logError("daily clean-up", e));
    }
    running = false;
    plan();
  };

  const scheduler: Scheduler = {
    replan: plan,
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (g.__spPriceScheduler === scheduler) delete g.__spPriceScheduler;
    },
  };
  g.__spScheduler = scheduler;
  g.__spPriceScheduler = scheduler;
  // Start-up: apply anything that became due while the site was down — once the server listens (the cached pages
  // are refreshed through its own /api/internal/revalidate).
  timer = setTimeout(tick, STARTUP_DELAY_MS);
  timer.unref?.();
  console.log(`[scheduler] ${restarted ? "restarted" : "started"}: scheduled price changes, e-mail retries, daily clean-up`);
}
