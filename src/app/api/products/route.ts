// Fresh product data for the cart and the wishlist: GET /api/products?ids=12,34&lang=bg|en → CartSnapshot[].
// Hidden products come back with `hidden: true` (the cart shows them as no longer available); unknown ids are left out.
import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LANG, isLang } from "@/i18n/config";
import { rateLimited } from "@/lib/rate-limit";
import { getSnapshots } from "@/lib/catalog";

const MAX_IDS = 100;

export async function GET(req: NextRequest) {
  if (await rateLimited("products", 120)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });
  }
  const sp = req.nextUrl.searchParams;
  const langParam = sp.get("lang");
  const lang = isLang(langParam) ? langParam : DEFAULT_LANG;
  const ids = (sp.get("ids") ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, MAX_IDS);
  const items = ids.length ? getSnapshots(lang, ids, { includeHidden: true }) : [];
  return NextResponse.json(items, { headers: { "Cache-Control": "no-store" } });
}
