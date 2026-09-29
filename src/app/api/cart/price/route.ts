// POST { items: [{ id, qty }], gifts: [{ tierId, id }], delivery?: { method, officeId?, cityId? }, payment?, lang } -> PricedCart.
// Prices, gift tiers and shipping always come from priceCart() (the database), never from the browser. Owner: D.
import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LANG, isLang } from "@/i18n/config";
import { isDeliveryKey, isPaymentKey, type PriceRequest } from "@/lib/checkout";
import { normalizeGifts, normalizeItems, priceCart } from "@/lib/pricing";
import { rateLimited } from "@/lib/rate-limit";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
/** Courier office / city ids are short digit strings. */
const courierId = (v: unknown) => (typeof v === "string" && /^[\w-]{1,20}$/.test(v) ? v : undefined);
const MAX_BODY = 32_000;

export async function POST(req: NextRequest) {
  if (await rateLimited("cart-price", 120)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });
  }
  const raw = await req.text().catch(() => "");
  if (!raw || raw.length > MAX_BODY) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!isObj(body) || !Array.isArray(body.items)) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const items = normalizeItems(body.items.slice(0, 200).filter(isObj).map((i) => ({ id: Number(i.id), qty: Number(i.qty) })));
  const gifts = normalizeGifts(
    (Array.isArray(body.gifts) ? body.gifts.slice(0, 20) : []).filter(isObj).map((g) => ({ tierId: String(g.tierId ?? ""), id: Number(g.id) })),
  );
  const delivery = isObj(body.delivery) ? body.delivery : null;
  const method = delivery?.method;
  const request: PriceRequest = {
    items,
    gifts,
    delivery: delivery && isDeliveryKey(method) ? { method, officeId: courierId(delivery.officeId), cityId: courierId(delivery.cityId) } : undefined,
    payment: isPaymentKey(body.payment) ? body.payment : undefined,
    lang: isLang(body.lang) ? body.lang : DEFAULT_LANG,
  };
  try {
    return NextResponse.json(await priceCart(request), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[cart/price]", (e as Error).message);
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
