import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getDict } from "@/i18n";
import { isLang, type Lang } from "@/i18n/config";
import { clientAddressFrom, requestIsHttps } from "@/lib/client-ip";
import { getCustomer } from "@/lib/customer-auth";
import { getChatSettings } from "@/lib/settings";
import { rateLimited } from "@/lib/rate-limit";
import {
  CHAT_COOKIE,
  CHAT_COOKIE_MAX_AGE,
  CHAT_LIMITS,
  addMessage,
  adminOnline,
  cleanText,
  conversationByToken,
  conversationFor,
  hasContact,
  markReadByVisitor,
  messageCount,
  messagesAfter,
  setVisitorContact,
  startConversation,
  updateVisitorContext,
} from "@/lib/chat";

// The chat bubble's endpoint (visitor side). GET polls for new messages; POST sends a message or the visitor's contact
// details. The conversation is identified by the httpOnly cookie "sp_chat" (path /api/chat, 90 days); a conversation
// that belongs to a customer account is only used while that customer is signed in (lib/chat.ts conversationFor) —
// anyone else on the browser starts a new one. Errors come back as { error: code, message } in the visitor's language
// (?lang= / "lang" in the body).

type ErrorCode = keyof ReturnType<typeof getDict>["chat"]["errors"];

const noStore = { "Cache-Control": "no-store" };

function fail(lang: Lang, error: ErrorCode, status = 400) {
  return NextResponse.json({ error, message: getDict(lang).chat.errors[error] }, { status, headers: noStore });
}

/** Only the shop's own pages may post (browsers always send Origin on POST requests). */
function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === (req.headers.get("x-forwarded-host") ?? req.headers.get("host"));
  } catch {
    return false;
  }
}

/** A storefront path ("/produkt/x", "/en/blog/y"), or null. */
function pagePath(v: unknown): string | null {
  return typeof v === "string" && /^\/(?!\/)[^\s<>"'\\]{0,300}$/.test(v) ? v : null;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const lang: Lang = isLang(sp.get("lang")) ? (sp.get("lang") as Lang) : "bg";
  if (await rateLimited("chat-poll", 120)) return fail(lang, "rateLimited", 429);
  const customer = await getCustomer();
  const conv = conversationFor((await cookies()).get(CHAT_COOKIE)?.value, customer?.id ?? null);
  const online = adminOnline();
  if (!conv) return NextResponse.json({ online, conversation: false, messages: [], unread: 0 }, { headers: noStore });
  const after = Math.max(0, parseInt(sp.get("after") ?? "0", 10) || 0);
  // The panel is open, so whatever arrives now is read.
  const read = sp.get("read") === "1";
  if (read) markReadByVisitor(conv.id);
  return NextResponse.json(
    { online, conversation: true, messages: messagesAfter(conv.id, after), unread: read ? 0 : conv.unreadVisitor, hasContact: hasContact(conv) },
    { headers: noStore },
  );
}

export async function POST(req: NextRequest) {
  let input: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    input = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    input = {};
  }
  const lang: Lang = isLang(input.lang) ? input.lang : "bg";
  if (!sameOrigin(req)) return fail(lang, "forbidden", 403);
  if (!getChatSettings().enabled) return fail(lang, "disabled", 403);
  if (await rateLimited("chat-send", 15)) return fail(lang, "tooFast", 429);
  if (!Object.keys(input).length) return fail(lang, "invalid");

  const jar = await cookies();
  const customer = await getCustomer();
  let conv = conversationFor(jar.get(CHAT_COOKIE)?.value, customer?.id ?? null);

  if (input.action === "contact") {
    if (!conv) return fail(lang, "noConversation");
    const name = cleanText(input.name, CHAT_LIMITS.name).replace(/\n/g, " ");
    const contact = cleanText(input.contact, CHAT_LIMITS.contact).replace(/\n/g, " ");
    if (!contact) return fail(lang, "contactRequired");
    setVisitorContact(conv.id, name, contact);
    return NextResponse.json({ ok: true }, { headers: noStore });
  }

  const body = cleanText(input.body, CHAT_LIMITS.body);
  if (!body) return fail(lang, "empty");
  const page = pagePath(input.page);
  // A new conversation, or one the shop had closed, counts as a new chat (the bubble asks for contact details again).
  const fresh = !conv || conv.status === "closed";
  if (!conv) {
    if (await rateLimited("chat-new", 5, 60 * 60_000)) return fail(lang, "tooManyChats", 429);
    const { ip } = clientAddressFrom(req.headers);
    const started = startConversation({ page, ip, userAgent: (req.headers.get("user-agent") ?? "").slice(0, 200), locale: lang, customerId: customer?.id ?? null });
    jar.set(CHAT_COOKIE, started.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: requestIsHttps(req.headers),
      path: "/api/chat",
      maxAge: CHAT_COOKIE_MAX_AGE,
    });
    conv = conversationByToken(started.token);
  } else {
    updateVisitorContext(conv.id, { page, locale: lang, customerId: customer?.id ?? null });
    conv = conversationFor(jar.get(CHAT_COOKIE)?.value, customer?.id ?? null) ?? conv;
  }
  if (!conv) return fail(lang, "generic", 500);
  if (messageCount(conv.id) >= CHAT_LIMITS.messagesPerConversation) return fail(lang, "tooLong");
  const message = addMessage(conv.id, "visitor", body);
  return NextResponse.json({ ok: true, message, fresh, hasContact: hasContact(conv) }, { headers: noStore });
}
