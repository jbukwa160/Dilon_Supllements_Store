// GET ?lang=bg|en -> { mode, headline, tiers: PublicGiftTier[] }: the active purchase-threshold gifts for the milestone
// bar and the gift picker (tiers = [] when the campaign is off). Stock is fresh on every call. Owner: D.
import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LANG, isLang } from "@/i18n/config";
import { getGiftTiersPayload } from "@/lib/cart-gifts";
import { rateLimited } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  if (await rateLimited("gift-tiers", 120)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });
  }
  const raw = req.nextUrl.searchParams.get("lang");
  const lang = isLang(raw) ? raw : DEFAULT_LANG;
  return NextResponse.json(getGiftTiersPayload(lang), { headers: { "Cache-Control": "no-store" } });
}
