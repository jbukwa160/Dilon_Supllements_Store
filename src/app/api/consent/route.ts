// Proof of cookie consent: POST { version, lang, consent: { preferences, analytics, marketing } } -> { ok: true }.
// Anonymous on purpose (no IP, no identifier — the choice itself lives in the visitor's `sp_consent` cookie); the
// log only shows which choices were made under which policy version and when. Rate-limited per IP.
import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LANG, isLang } from "@/i18n/config";
import { storeDb } from "@/lib/db";
import { rateLimited } from "@/lib/rate-limit";
import { sameOrigin } from "@/app/api/newsletter/same-origin";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (await rateLimited("consent", 20, 10 * 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const body = (await req.json().catch(() => null)) as { version?: unknown; lang?: unknown; consent?: Record<string, unknown> } | null;
  const version = typeof body?.version === "number" && Number.isInteger(body.version) && body.version >= 0 && body.version < 1e6 ? body.version : null;
  const c = body?.consent;
  if (version === null || !c || typeof c !== "object") return NextResponse.json({ error: "invalid" }, { status: 400 });
  const consent = { necessary: true, preferences: c.preferences === true, analytics: c.analytics === true, marketing: c.marketing === true };
  const lang = isLang(body?.lang) ? body.lang : DEFAULT_LANG;
  storeDb()
    .prepare("INSERT INTO consent_log (consent, version, locale, created_at) VALUES (?, ?, ?, ?)")
    .run(JSON.stringify(consent), version, lang, new Date().toISOString());
  return NextResponse.json({ ok: true });
}
