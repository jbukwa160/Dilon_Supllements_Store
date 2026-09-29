// Newsletter sign-up: POST { email, lang, website? } -> { ok: true } | { error: "invalid" | "rate_limited" | "forbidden" }.
// Double opt-in (lib/newsletter.ts): the address is stored as PENDING and gets an e-mail with a confirmation link
// (/byuletin?t=…); only confirmed addresses are subscribers. The answer is the same whether the address was new,
// pending or already confirmed, and the e-mail goes out after the response (no timing difference).
// `website` is a honeypot field that people never see: when a bot fills it in, the answer is "ok" and nothing is stored.
// Without JavaScript the footer form posts here as a normal form: the answer is then a 303 back to the page.
import { after, NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LANG, isLang } from "@/i18n/config";
import { EMAIL_RE } from "@/lib/customer-auth";
import { sendNewsletterConfirmation } from "@/lib/emails/newsletter";
import { requestSubscription } from "@/lib/newsletter";
import { rateLimited } from "@/lib/rate-limit";
import { sameOrigin } from "./same-origin";

type Body = { email?: unknown; lang?: unknown; website?: unknown };

async function readBody(req: NextRequest): Promise<{ body: Body | null; form: boolean }> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
    const fd = await req.formData().catch(() => null);
    return { body: fd ? { email: fd.get("email"), lang: fd.get("lang"), website: fd.get("website") } : null, form: true };
  }
  return { body: (await req.json().catch(() => null)) as Body | null, form: false };
}

/** The page a no-JS form came from (same site only), else the home page of its language. */
function backTo(req: NextRequest, lang: string): URL {
  const ref = req.headers.get("referer");
  try {
    if (ref && new URL(ref).host === req.nextUrl.host) return new URL(ref);
  } catch {
    // Malformed Referer: fall through.
  }
  return new URL(lang === "en" ? "/en" : "/", req.nextUrl);
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const limited = await rateLimited("newsletter", 5, 10 * 60_000);
  const { body, form } = await readBody(req);
  const lang = isLang(body?.lang) ? body.lang : DEFAULT_LANG;
  const reply = (status: number, data: { ok: true } | { error: string }) => (form ? NextResponse.redirect(backTo(req, lang), 303) : NextResponse.json(data, { status }));
  if (limited) return reply(429, { error: "rate_limited" });
  if (typeof body?.website === "string" && body.website.trim()) return reply(200, { ok: true });
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase().slice(0, 200) : "";
  if (!EMAIL_RE.test(email)) return reply(400, { error: "invalid" });
  const r = requestSubscription(email, lang);
  if (r.status === "pending") {
    const token = r.token;
    after(() => sendNewsletterConfirmation(email, lang, token));
  }
  return reply(200, { ok: true });
}
