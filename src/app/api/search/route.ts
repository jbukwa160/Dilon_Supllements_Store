// Search-as-you-type suggestions: GET /api/search?q=…&lang=bg|en → { products, total, categories, brands }.
// The language comes from the query (route handlers can't use next/root-params).
import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LANG, isLang } from "@/i18n/config";
import { rateLimited } from "@/lib/rate-limit";
import { suggest } from "@/lib/search";

export async function GET(req: NextRequest) {
  if (await rateLimited("search", 120)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });
  }
  const sp = req.nextUrl.searchParams;
  const langParam = sp.get("lang");
  const lang = isLang(langParam) ? langParam : DEFAULT_LANG;
  const q = (sp.get("q") ?? "").trim().slice(0, 100);
  const s = suggest(lang, q);
  return NextResponse.json(s, { headers: { "Cache-Control": "public, max-age=60" } });
}
