import "server-only";
import { storeDb } from "./db";
import { purgeRateLimits } from "./rate-limit";

// Deletes or blanks personal data whose retention period is over (GDPR art. 5(1)(e)), as promised in the privacy
// policy. Run by the scheduler once a day and at start-up (src/instrumentation.ts); safe to run at any time and as
// often as wanted — every statement only touches rows that are already past their period.
//
// RETENTION is the single source of these periods: LEGAL_POLICY in src/components/info/legal-context.ts (quoted by the
// privacy texts) is built from it, so changing a number here changes the policy text too.
// Orders and invoices are NOT deleted here: they are kept for the accounting / limitation periods (5–10 years) and
// removed by hand when a lawyer confirms the period.

export const RETENTION = {
  /** Orders and invoice data (ЗЗД чл. 110 limitation period) — quoted by the policy, NOT purged here. */
  ordersYears: 5,
  /** Security logs: sign-in attempts, IP addresses and browsers of sessions and chats (LEGAL_POLICY.logsMonths). */
  logsMonths: 6,
  /** Chat conversations without activity (LEGAL_POLICY.chatMonths). */
  chatMonths: 12,
  /** Withdrawal statements keep the sender's IP address this long (LEGAL_POLICY.casesYears). */
  casesYears: 3,
  /** Anonymous cookie-consent log entries (LEGAL_POLICY.consentProofYears). */
  consentProofYears: 3,
  /** Newsletter sign-ups whose address was never confirmed. */
  pendingNewsletterDays: 7,
  /** Used / expired one-time links (password reset). */
  tokenDays: 1,
  /** Failed sign-in counters (the longest window in login-guard.ts is 24 hours). */
  loginAttemptDays: 2,
} as const;

export type PurgeReport = Record<string, number>;

const DAY = 24 * 60 * 60 * 1000;
const monthsAgo = (now: number, m: number) => {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - m);
  return d.toISOString();
};
const yearsAgo = (now: number, y: number) => monthsAgo(now, 12 * y);
const daysAgo = (now: number, d: number) => new Date(now - d * DAY).toISOString();

/**
 * Removes expired personal data from store.db and returns how many rows each step touched. Never throws (a failed
 * purge is logged and retried on the next run).
 */
export function purgeExpiredData(now = Date.now()): PurgeReport {
  const report: PurgeReport = {};
  const nowIso = new Date(now).toISOString();
  const logsCutoff = monthsAgo(now, RETENTION.logsMonths);
  try {
    const db = storeDb();
    const run = (name: string, sql: string, ...params: unknown[]) => {
      const n = db.prepare(sql).run(...params).changes;
      if (n) report[name] = (report[name] ?? 0) + n;
    };
    db.transaction(() => {
      // Sign-in counters and rate-limit windows that are over.
      run(
        "login_attempts",
        "DELETE FROM login_attempts WHERE first_at < ? AND (locked_until IS NULL OR locked_until < ?)",
        daysAgo(now, RETENTION.loginAttemptDays),
        nowIso,
      );
      // Sessions: expired ones go; long-lived "remember me" sessions forget the address they started from.
      run("admin_sessions", "DELETE FROM admin_sessions WHERE expires_at < ?", nowIso);
      run("customer_sessions", "DELETE FROM customer_sessions WHERE expires_at < ?", nowIso);
      run(
        "admin_sessions_ip",
        "UPDATE admin_sessions SET ip = NULL, user_agent = NULL WHERE created_at < ? AND (ip IS NOT NULL OR user_agent IS NOT NULL)",
        logsCutoff,
      );
      run(
        "customer_sessions_ip",
        "UPDATE customer_sessions SET ip = NULL, user_agent = NULL WHERE created_at < ? AND (ip IS NOT NULL OR user_agent IS NOT NULL)",
        logsCutoff,
      );
      // One-time links that were used or have expired.
      run("customer_tokens", "DELETE FROM customer_tokens WHERE expires_at < ?", daysAgo(now, RETENTION.tokenDays));
      // Chat: the visitor's address / browser after the log period; whole conversations after the chat period.
      run(
        "chat_ip",
        "UPDATE chat_conversations SET ip = NULL, user_agent = NULL WHERE created_at < ? AND (ip IS NOT NULL OR user_agent IS NOT NULL)",
        logsCutoff,
      );
      const chatCutoff = monthsAgo(now, RETENTION.chatMonths);
      run("chat_messages", "DELETE FROM chat_messages WHERE conversation_id IN (SELECT id FROM chat_conversations WHERE last_message_at < ?)", chatCutoff);
      run("chat_conversations", "DELETE FROM chat_conversations WHERE last_message_at < ?", chatCutoff);
      // Withdrawal statements keep the IP address as long as the case may be disputed.
      run("withdrawals_ip", "UPDATE withdrawals SET ip = NULL WHERE created_at < ? AND ip IS NOT NULL", yearsAgo(now, RETENTION.casesYears));
      // Newsletter sign-ups that were never confirmed (no consent was ever proven).
      run(
        "newsletter_pending",
        "DELETE FROM newsletter WHERE confirmed_at IS NULL AND COALESCE(confirm_sent_at, created_at) < ?",
        daysAgo(now, RETENTION.pendingNewsletterDays),
      );
      run("consent_log", "DELETE FROM consent_log WHERE created_at < ?", yearsAgo(now, RETENTION.consentProofYears));
    })();
    const limits = purgeRateLimits(now);
    if (limits) report.rate_limits = limits;
    const summary = Object.entries(report)
      .map(([k, n]) => `${k} ${n}`)
      .join(", ");
    if (summary) console.info(`[retention] purged: ${summary}`);
  } catch (e) {
    console.error("[retention] purge failed:", (e as Error).message);
  }
  return report;
}
