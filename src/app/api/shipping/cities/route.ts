// Owner: D (ported from /web by F).
import { rateLimited } from "@/lib/rate-limit";
import { NextResponse, type NextRequest } from "next/server";
import { searchCities } from "@/lib/shipping";

// Town / village search for address delivery. Credentials never leave the server.
export async function GET(req: NextRequest) {
  if (await rateLimited("cities", 120)) return NextResponse.json({ error: "too many requests" }, { status: 429 });
  const courier = req.nextUrl.searchParams.get("courier");
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 60);
  if (courier !== "econt" && courier !== "speedy") return NextResponse.json({ error: "bad courier" }, { status: 400 });
  try {
    const cities = await searchCities(courier, q);
    return NextResponse.json({ cities }, { headers: { "Cache-Control": "public, max-age=3600" } });
  } catch (e) {
    console.error("[shipping] cities:", (e as Error).message);
    return NextResponse.json({ cities: [], error: "unavailable" }, { status: 503 });
  }
}
