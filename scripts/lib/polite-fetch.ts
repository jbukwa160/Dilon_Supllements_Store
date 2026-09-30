// Polite HTTP for scripts/fetch-images.ts: identifies itself, obeys robots.txt (User-agent: * and our own token),
// keeps ≤ 2 requests in flight per host with a pause between them, and caches text responses on disk so reruns
// do not hit the brand sites again.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createHash } from "node:crypto";

export const USER_AGENT = "DilonImageCollector/1.0 (retailer syncing official manufacturer packshots; low-rate)";
const UA_TOKEN = "dilonimagecollector";

export type FetchOpts = { ttlDays?: number; headers?: Record<string, string>; ignoreRobots?: boolean; accept?: string };

let cacheDir = "";
let refresh = false;
const stats = { network: 0, cached: 0, blocked: 0, failed: 0 };
export function fetchStats() {
  return { ...stats };
}

export function initFetch(dir: string, opts: { refresh?: boolean } = {}) {
  cacheDir = dir;
  refresh = !!opts.refresh;
  fs.mkdirSync(path.join(cacheDir, "http"), { recursive: true });
}

// ---------------------------------------------------------------------------
// Per-host queue

type Host = { active: number; last: number; waiting: (() => void)[]; delayMs: number; max: number };
const hosts = new Map<string, Host>();
const DEFAULT_DELAY = 700;

/** Slower pace for a host (e.g. robots.txt Crawl-delay). */
export function setHostPace(host: string, delayMs: number, max = 2) {
  const h = hostOf(host);
  h.delayMs = Math.max(h.delayMs, delayMs);
  h.max = Math.min(h.max, Math.max(1, max));
}

function hostOf(host: string): Host {
  let h = hosts.get(host);
  if (!h) {
    h = { active: 0, last: 0, waiting: [], delayMs: DEFAULT_DELAY, max: 2 };
    hosts.set(host, h);
  }
  return h;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function slot<T>(host: string, fn: () => Promise<T>): Promise<T> {
  const h = hostOf(host);
  while (h.active >= h.max) await new Promise<void>((r) => h.waiting.push(r));
  h.active++;
  try {
    const wait = h.last + h.delayMs + Math.random() * 300 - Date.now();
    h.last = Date.now() + Math.max(0, wait);
    if (wait > 0) await sleep(wait);
    return await fn();
  } finally {
    h.active--;
    h.waiting.shift()?.();
  }
}

// ---------------------------------------------------------------------------
// robots.txt

type Rule = { allow: boolean; re: RegExp; len: number };
const robots = new Map<string, Promise<Rule[]>>();

function ruleRe(p: string): RegExp {
  const anchored = p.endsWith("$");
  const body = (anchored ? p.slice(0, -1) : p)
    .split("*")
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp("^" + body + (anchored ? "$" : ""));
}

function parseRobots(txt: string, host: string): Rule[] {
  // Groups: consecutive User-agent lines followed by rules. Use our own group when present, else "*".
  const groups: { agents: string[]; rules: Rule[]; delay?: number }[] = [];
  let cur: { agents: string[]; rules: Rule[]; delay?: number } | null = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], rules: [] };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (key === "disallow" && val) cur.rules.push({ allow: false, re: ruleRe(val), len: val.length });
    else if (key === "allow" && val) cur.rules.push({ allow: true, re: ruleRe(val), len: val.length });
    else if (key === "crawl-delay") cur.delay = Number(val) || undefined;
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && UA_TOKEN.includes(a)));
  const chosen = mine.length ? mine : groups.filter((g) => g.agents.includes("*"));
  const rules = chosen.flatMap((g) => g.rules);
  const delay = Math.max(0, ...chosen.map((g) => g.delay ?? 0));
  if (delay) setHostPace(host, Math.min(delay, 10) * 1000, 1);
  return rules;
}

async function robotsFor(origin: string): Promise<Rule[]> {
  let p = robots.get(origin);
  if (!p) {
    p = (async () => {
      const host = new URL(origin).host;
      const r = await rawGet(`${origin}/robots.txt`, { ttlDays: 7, ignoreRobots: true }).catch(() => null);
      if (!r || r.status >= 400 || !r.body) return [];
      return parseRobots(r.body.toString("utf8"), host);
    })();
    robots.set(origin, p);
  }
  return p;
}

export async function robotsAllowed(url: string): Promise<boolean> {
  const u = new URL(url);
  const rules = await robotsFor(u.origin);
  const p = u.pathname + u.search;
  let best: Rule | null = null;
  for (const r of rules) if (r.re.test(p) && (!best || r.len > best.len || (r.len === best.len && r.allow))) best = r;
  return !best || best.allow;
}

// ---------------------------------------------------------------------------
// Fetch with disk cache

type Raw = { status: number; body: Buffer | null; url: string; type: string };

function cachePath(url: string, suffix: string) {
  return path.join(cacheDir, "http", createHash("sha1").update(url).digest("hex") + suffix);
}

async function rawGet(url: string, opts: FetchOpts): Promise<Raw> {
  const u = new URL(url);
  if (!opts.ignoreRobots && !(await robotsAllowed(url))) {
    stats.blocked++;
    return { status: 999, body: null, url, type: "" };
  }
  return slot(u.host, async () => {
    for (let attempt = 0; ; attempt++) {
      stats.network++;
      try {
        const res = await fetch(url, {
          headers: { "user-agent": USER_AGENT, accept: opts.accept ?? "*/*", "accept-language": "en,pl;q=0.8,bg;q=0.6", ...opts.headers },
          redirect: "follow",
          signal: AbortSignal.timeout(45_000),
        });
        if ((res.status === 429 || res.status >= 500) && attempt < 2) {
          await sleep(5000 * (attempt + 1));
          continue;
        }
        const body = Buffer.from(await res.arrayBuffer());
        return { status: res.status, body, url: res.url, type: res.headers.get("content-type") ?? "" };
      } catch (e) {
        if (attempt < 1) {
          await sleep(3000);
          continue;
        }
        stats.failed++;
        return { status: 0, body: null, url, type: String((e as Error).message) };
      }
    }
  });
}

/** Text of a URL (gunzipped when needed), cached for `ttlDays` (default 14). Null on errors / 4xx / robots. */
export async function getText(url: string, opts: FetchOpts = {}): Promise<string | null> {
  const file = cachePath(url, ".txt");
  const ttl = (opts.ttlDays ?? 14) * 86400_000;
  if (!refresh && fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < ttl) {
    stats.cached++;
    const t = fs.readFileSync(file, "utf8");
    return t === "\u0000ERR" ? null : t;
  }
  const r = await rawGet(url, opts);
  let text: string | null = null;
  if (r.status >= 200 && r.status < 300 && r.body) {
    let buf = r.body;
    if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
    text = buf.toString("utf8");
  }
  // Remember 404s too (short-lived) so a rerun does not ask again; network failures are not cached.
  if (text !== null) fs.writeFileSync(file, text);
  else if (r.status === 404 || r.status === 410 || r.status === 999) fs.writeFileSync(file, "\u0000ERR");
  return text;
}

export async function getJson<T = unknown>(url: string, opts: FetchOpts = {}): Promise<T | null> {
  const t = await getText(url, { accept: "application/json", ...opts });
  if (!t) return null;
  try {
    return JSON.parse(t) as T;
  } catch {
    return null;
  }
}

/** Binary download (images), cached on disk; refuses bodies over `maxBytes`. */
export async function getBinary(url: string, maxBytes: number, opts: FetchOpts = {}): Promise<{ buf: Buffer; type: string } | { error: string }> {
  const file = cachePath(url, ".bin");
  if (fs.existsSync(file)) {
    stats.cached++;
    return { buf: fs.readFileSync(file), type: "" };
  }
  const r = await rawGet(url, { accept: "image/avif,image/webp,image/png,image/jpeg,*/*;q=0.5", ...opts });
  if (r.status === 999) return { error: "robots.txt disallows" };
  if (!r.body || r.status < 200 || r.status >= 300) return { error: `HTTP ${r.status} ${r.type}`.trim() };
  if (r.body.length > maxBytes) return { error: `too big (${(r.body.length / 1e6).toFixed(1)} MB)` };
  fs.writeFileSync(file, r.body);
  return { buf: r.body, type: r.type };
}
