import "server-only";
import { isIP } from "node:net";
import { headers } from "next/headers";
import { site } from "@/config/site";

// Who is asking: the visitor's IP address for rate limits, sign-in locks and the few places that store one
// (sessions, chat, withdrawal statements). Use this module everywhere; never read X-Forwarded-For yourself.
//
// Why: Next.js puts the TCP peer address into `x-forwarded-for` ONLY when the request has no such header, so a
// visitor who talks to `next start` directly can write any address there. Forwarding headers are therefore only
// believed when a reverse proxy we trust sets them — TRUST_PROXY (see README → Security):
//   unset       auto: trusted (1 proxy) when NEXT_PUBLIC_SITE_URL is https:// — HTTPS always means nginx / Caddy /
//               IIS / a tunnel terminates TLS in front of `next start`; not trusted otherwise (local development)
//   0 / false   never trusted
//   1 … 5       that many proxies in front: the client is the Nth address from the RIGHT of X-Forwarded-For
//               (each proxy appends the address it saw; whatever the visitor sent stays further left)
//   x-real-ip   the proxy sets X-Real-IP to the peer address (nginx: proxy_set_header X-Real-IP $remote_addr)
// Without a trusted proxy every visitor gets the same key ("direct"), so a forged header gains nothing; limits
// that must hold per person are also counted per e-mail address / order number (rate-limit.ts subjectLimited).

type Trust = { mode: "none" } | { mode: "hops"; hops: number } | { mode: "real-ip" };

let warned = false;

function trust(): Trust {
  const raw = (process.env.TRUST_PROXY ?? "").trim().toLowerCase();
  if (!raw) return site.url.startsWith("https://") ? { mode: "hops", hops: 1 } : { mode: "none" };
  if (["0", "false", "no", "off"].includes(raw)) return { mode: "none" };
  if (["true", "yes", "on"].includes(raw)) return { mode: "hops", hops: 1 };
  if (raw === "x-real-ip") return { mode: "real-ip" };
  const n = Number(raw);
  if (Number.isInteger(n) && n >= 1 && n <= 5) return { mode: "hops", hops: n };
  if (!warned) {
    warned = true;
    console.warn(`[client-ip] TRUST_PROXY="${raw}" is not understood (use 0, 1…5 or x-real-ip); forwarding headers are ignored.`);
  }
  return { mode: "none" };
}

/** "1.2.3.4:5678", "[2001:db8::1]:443", "::ffff:1.2.3.4" → the bare, valid address; null for anything else. */
export function normalizeIp(value: string | null | undefined): string | null {
  let v = (value ?? "").trim().toLowerCase();
  if (!v || v.length > 100) return null;
  const bracket = v.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracket) v = bracket[1];
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(v)) v = v.slice(0, v.lastIndexOf(":"));
  v = v.replace(/%.*$/, ""); // IPv6 zone ("fe80::1%eth0")
  if (v.startsWith("::ffff:") && isIP(v.slice(7)) === 4) v = v.slice(7);
  return isIP(v) ? v : null;
}

/** The first four groups of an IPv6 address: one household / server usually owns a whole /64. */
function ipv6Prefix64(ip: string): string {
  const [head, tail] = ip.split("::");
  const h = head ? head.split(":") : [];
  const t = tail === undefined ? null : tail ? tail.split(":") : [];
  const groups = t === null ? h : [...h, ...Array<string>(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t];
  return `${groups
    .slice(0, 4)
    .map((g) => (parseInt(g, 16) || 0).toString(16))
    .join(":")}::/64`;
}

export type ClientAddress = {
  /** The visitor's address when a trusted proxy reported it (for storing); null when it is not known. */
  ip: string | null;
  /** Key for per-visitor limits: the IPv4 address, the IPv6 /64, or "direct" when no trusted proxy tells us. */
  key: string;
};

const DIRECT: ClientAddress = { ip: null, key: "direct" };

/** The client address from request headers (Route Handlers pass `req.headers`). */
export function clientAddressFrom(h: Headers): ClientAddress {
  const t = trust();
  let ip: string | null = null;
  if (t.mode === "real-ip") ip = normalizeIp(h.get("x-real-ip"));
  else if (t.mode === "hops") {
    const chain = (h.get("x-forwarded-for") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    ip = normalizeIp(chain[Math.max(0, chain.length - t.hops)]);
  }
  if (!ip) return DIRECT;
  return { ip, key: isIP(ip) === 6 ? ipv6Prefix64(ip) : ip };
}

/** The client address of the current request (Server Components, Server Actions, Route Handlers). */
export async function clientAddress(): Promise<ClientAddress> {
  return clientAddressFrom(await headers());
}

/** The visitor's IP address for storing, or null when no trusted proxy reported it. */
export async function clientIp(): Promise<string | null> {
  return (await clientAddress()).ip;
}

/**
 * Did the browser use HTTPS (cookies get the Secure flag)? Always when the public address is https://; otherwise
 * the proxy's X-Forwarded-Proto (Next.js sets it from the socket when there is no proxy). A forged value only
 * affects the sender's own cookies.
 */
export function requestIsHttps(h: Headers): boolean {
  if (site.url.startsWith("https://")) return true;
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (proto) return proto === "https";
  return !!h.get("origin")?.startsWith("https:");
}
