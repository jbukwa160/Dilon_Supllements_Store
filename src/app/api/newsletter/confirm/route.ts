// Newsletter confirmation (double opt-in): the button on /byuletin?t=… posts { t, lang } here as a plain form. The
// link in the e-mail only opens that page — a GET never confirms, so mail scanners that open links don't subscribe
// anybody. Answers with a 303 back to /byuletin?status=ok|invalid (/en/byuletin for English).
import { NextResponse, type NextRequest } from "next/server";
import { isLang } from "@/i18n/config";
import { localizeHref } from "@/lib/links";
import { confirmSubscription } from "@/lib/newsletter";
import { rateLimited } from "@/lib/rate-limit";
import { sameOrigin } from "../same-origin";

export async function POST(req: NextRequest) {
  const fd = await req.formData().catch(() => null);
  const langValue = fd?.get("lang");
  const lang = isLang(langValue) ? langValue : "bg";
  // A relative Location: never built from the (forgeable) Host header.
  const back = (status: "ok" | "invalid") =>
    new Response(null, { status: 303, headers: { Location: localizeHref(`/byuletin?status=${status}`, lang), "Cache-Control": "no-store" } });
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (await rateLimited("newsletter-confirm", 20, 10 * 60_000)) return back("invalid");
  const token = fd?.get("t");
  const done = typeof token === "string" ? confirmSubscription(token) : null;
  return back(done ? "ok" : "invalid");
}
