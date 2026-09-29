import "server-only";
import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { DATA_DIR } from "./db";
import { getSettings } from "./settings";
import { slugify } from "./slug";

// Outgoing e-mail (order confirmations, password reset, welcome, withdrawal acknowledgements).
// With SMTP_HOST set, messages go out through that SMTP server. Without it (development) each message is
// written to data/outbox/<time>-<subject>.eml (open it in any mail program) and a one-line summary is logged.
//
// A message the SMTP server refuses (or that can't reach it) is never lost: its .eml goes to data/outbox/failed/
// with a .json marker (recipients, attempts, last error) and is sent again later — right after the next message
// that does go out, and from the scheduler (retryFailedMail) — with growing pauses, up to MAX_ATTEMPTS times.
// recentMailFailures() counts what is still waiting (admin dashboard warning). Copies older than 30 days are
// deleted (they hold personal data; the order itself is in the admin panel).

export const OUTBOX_DIR = path.join(DATA_DIR, "outbox");
/** Undelivered messages: <name>.eml (the full message) + <name>.json (FailedMeta). */
export const FAILED_DIR = path.join(OUTBOX_DIR, "failed");

export type MailMessage = {
  to: string | string[];
  subject: string;
  /** Plain-text version (always send one: some people read mail as text). */
  text: string;
  /** Optional HTML version; escape every inserted value with escapeHtml() from lib/html. */
  html?: string;
  replyTo?: string;
};

/** `queued`: the SMTP send failed and the message waits in data/outbox/failed/ for a retry. */
export type MailResult = { ok: true; via: "smtp" | "outbox"; file?: string } | { ok: false; error: string; queued?: string };

type FailedMeta = {
  subject: string;
  /** SMTP envelope (what the retry sends to / from). */
  envelope: { from: string; to: string[] };
  attempts: number;
  firstFailedAt: string;
  lastFailedAt: string;
  lastError: string;
  /** null = no more automatic attempts (MAX_ATTEMPTS reached). */
  nextAttemptAt: string | null;
};

const MAX_ATTEMPTS = 8;
/** Pause before attempt n+1 (after n failures): 5 min, 15 min, 1 h, 3 h, 6 h, 12 h, 24 h. */
const BACKOFF_MIN = [5, 15, 60, 180, 360, 720, 1440];
const KEEP_FAILED_MS = 30 * 86400_000;

const g = globalThis as unknown as { __smtp?: Transporter; __eml?: Transporter; __mailRetry?: Promise<void> | null; __mailRetryAt?: number };

function smtp(): Transporter {
  if (!g.__smtp) {
    const port = Number(process.env.SMTP_PORT) || 587;
    const user = process.env.SMTP_USER;
    g.__smtp = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: user ? { user, pass: process.env.SMTP_PASS ?? "" } : undefined,
      // Fail within a minute instead of nodemailer's 2-minute defaults (the message is then queued for a retry).
      connectionTimeout: 20_000,
      greetingTimeout: 15_000,
      socketTimeout: 45_000,
    });
  }
  return g.__smtp;
}

/** Builds the raw message (.eml) without sending it. */
function emlBuilder(): Transporter {
  if (!g.__eml) g.__eml = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
  return g.__eml;
}

/** "Dilon Nutrition <shop@…>": SMTP_FROM, else the store name and e-mail from Настройки. */
function sender(): string {
  if (process.env.SMTP_FROM) return process.env.SMTP_FROM;
  const s = getSettings();
  return `"${s.name.replace(/["\\]/g, "")}" <${s.email}>`;
}

const stampName = (subject: string) => `${new Date().toISOString().replace(/[:.]/g, "-")}-${slugify(subject, 50) || "mail"}`;

type Built = { message: Buffer; envelope: { from: string | false; to: string[] } };

/** Keeps a copy of a message the SMTP server did not take, for a later retry. Returns the .eml path (null if even that failed). */
function queueFailed(built: Built, subject: string, error: string): string | null {
  try {
    fs.mkdirSync(FAILED_DIR, { recursive: true });
    let base = path.join(FAILED_DIR, stampName(subject));
    if (fs.existsSync(`${base}.eml`)) base += `-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date();
    const meta: FailedMeta = {
      subject,
      envelope: { from: built.envelope.from || "", to: built.envelope.to },
      attempts: 1,
      firstFailedAt: now.toISOString(),
      lastFailedAt: now.toISOString(),
      lastError: error.slice(0, 500),
      nextAttemptAt: new Date(now.getTime() + BACKOFF_MIN[0] * 60_000).toISOString(),
    };
    fs.writeFileSync(`${base}.eml`, built.message);
    fs.writeFileSync(`${base}.json`, JSON.stringify(meta, null, 2));
    return `${base}.eml`;
  } catch (e) {
    console.error(`[mail] could not keep a copy of the failed message: ${(e as Error).message}`);
    return null;
  }
}

/** Sends an e-mail. Never throws: a failed e-mail must not fail the order that triggered it (errors are logged). */
export async function sendMail(msg: MailMessage): Promise<MailResult> {
  const mail = { from: sender(), to: msg.to, subject: msg.subject, text: msg.text, html: msg.html, replyTo: msg.replyTo };
  const to = Array.isArray(msg.to) ? msg.to.join(", ") : msg.to;
  let built: Built | null = null;
  try {
    built = (await emlBuilder().sendMail(mail)) as unknown as Built;
    if (process.env.SMTP_HOST) {
      await smtp().sendMail({ envelope: { from: built.envelope.from || undefined, to: built.envelope.to }, raw: built.message });
      // The server takes mail again: send what failed earlier now (in the background).
      if (hasFailedFiles()) void retryFailedMail({ force: true });
      return { ok: true, via: "smtp" };
    }
    fs.mkdirSync(OUTBOX_DIR, { recursive: true });
    const file = path.join(OUTBOX_DIR, `${stampName(msg.subject)}.eml`);
    fs.writeFileSync(file, built.message);
    console.info(`[mail] not sent (no SMTP_HOST) → ${path.relative(process.cwd(), file)} · to: ${to} · "${msg.subject}"`);
    return { ok: true, via: "outbox", file };
  } catch (e) {
    const error = (e as Error).message;
    const queued = built && process.env.SMTP_HOST ? queueFailed(built, msg.subject, error) : null;
    console.error(`[mail] sending to ${to} failed: ${error}${queued ? ` — kept in ${path.relative(process.cwd(), queued)}, will retry` : ""}`);
    return queued ? { ok: false, error, queued } : { ok: false, error };
  }
}

function hasFailedFiles(): boolean {
  try {
    return fs.readdirSync(FAILED_DIR).some((f) => f.endsWith(".json"));
  } catch {
    return false;
  }
}

function readFailed(): { base: string; meta: FailedMeta }[] {
  let names: string[];
  try {
    names = fs.readdirSync(FAILED_DIR).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const out: { base: string; meta: FailedMeta }[] = [];
  for (const name of names) {
    const base = path.join(FAILED_DIR, name.slice(0, -5));
    try {
      const meta = JSON.parse(fs.readFileSync(`${base}.json`, "utf8")) as FailedMeta;
      if (meta && typeof meta.lastFailedAt === "string" && Array.isArray(meta.envelope?.to)) out.push({ base, meta });
    } catch {
      // A half-written marker: skipped (and counted again once it is complete).
    }
  }
  return out;
}

function dropFailed(base: string) {
  for (const ext of [".eml", ".json"]) fs.rmSync(`${base}${ext}`, { force: true });
}

/**
 * Sends the messages waiting in data/outbox/failed/ whose next attempt is due (with `force`: every one not given
 * up), deletes the ones delivered and those older than 30 days. Safe to call often (from the scheduler, e.g. every
 * minute): one run at a time, at most one run a minute unless forced, nothing to send without SMTP_HOST.
 */
export function retryFailedMail(opts: { force?: boolean } = {}): Promise<void> {
  if (g.__mailRetry) return g.__mailRetry;
  if (!opts.force && g.__mailRetryAt && Date.now() - g.__mailRetryAt < 60_000) return Promise.resolve();
  g.__mailRetryAt = Date.now();
  const run = (async () => {
    const now = Date.now();
    for (const { base, meta } of readFailed()) {
      try {
        if (now - Date.parse(meta.firstFailedAt || meta.lastFailedAt) > KEEP_FAILED_MS) {
          dropFailed(base);
          continue;
        }
        if (!process.env.SMTP_HOST) continue;
        // Given up (MAX_ATTEMPTS) = waits for the 30-day clean-up; `force` (the server just took a message) skips the pauses.
        if (meta.nextAttemptAt === null || (!opts.force && Date.parse(meta.nextAttemptAt) > now)) continue;
        const raw = fs.readFileSync(`${base}.eml`);
        try {
          await smtp().sendMail({ envelope: { from: meta.envelope.from || undefined, to: meta.envelope.to }, raw });
          dropFailed(base);
          console.info(`[mail] sent on attempt ${meta.attempts + 1}: "${meta.subject}" → ${meta.envelope.to.join(", ")}`);
        } catch (e) {
          const attempts = meta.attempts + 1;
          const pause = BACKOFF_MIN[Math.min(attempts - 1, BACKOFF_MIN.length - 1)];
          const next: FailedMeta = {
            ...meta,
            attempts,
            lastFailedAt: new Date().toISOString(),
            lastError: (e as Error).message.slice(0, 500),
            nextAttemptAt: attempts >= MAX_ATTEMPTS ? null : new Date(Date.now() + pause * 60_000).toISOString(),
          };
          fs.writeFileSync(`${base}.json`, JSON.stringify(next, null, 2));
          console.error(`[mail] retry ${attempts} of "${meta.subject}" failed: ${next.lastError}${next.nextAttemptAt ? "" : " — giving up (see data/outbox/failed/)"}`);
          // No SMTP answer at all (connection refused, timeout): the server is still down — don't hammer it with the
          // rest of the queue now. A refusal of this one message (e.g. 550 unknown recipient) doesn't hold up the others.
          if (!opts.force && !(e as { responseCode?: number }).responseCode) break;
        }
      } catch (e) {
        console.error(`[mail] retry of ${path.basename(base)} failed: ${(e as Error).message}`);
      }
    }
  })().finally(() => {
    g.__mailRetry = null;
  });
  g.__mailRetry = run;
  return run;
}

/**
 * E-mails that could not be sent and are still undelivered (waiting for a retry, or given up) in the last 30 days,
 * and when the latest failure happened — for the admin dashboard warning. { count: 0, lastAt: null } = all fine.
 */
export function recentMailFailures(): { count: number; lastAt: string | null } {
  const since = Date.now() - KEEP_FAILED_MS;
  let count = 0;
  let lastAt: string | null = null;
  for (const { meta } of readFailed()) {
    if (Date.parse(meta.lastFailedAt) < since) continue;
    count++;
    if (!lastAt || meta.lastFailedAt > lastAt) lastAt = meta.lastFailedAt;
  }
  return { count, lastAt };
}

/** Where new-order notifications go: SHOP_NOTIFY_EMAIL, else the store e-mail from Настройки. */
export function shopNotifyEmail(): string {
  return process.env.SHOP_NOTIFY_EMAIL || getSettings().email;
}
