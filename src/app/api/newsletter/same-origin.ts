import type { NextRequest } from "next/server";

/**
 * Requests from our own pages only (newsletter, consent log): a cross-site page could otherwise post a "simple"
 * text/plain body to these JSON endpoints. Browsers always send Origin on POST; requests without it (curl,
 * server-to-server) are allowed — the endpoints are rate-limited anyway.
 */
export function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
