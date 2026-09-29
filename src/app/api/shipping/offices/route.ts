// Owner: D (ported from /web by F).
import { rateLimited } from "@/lib/rate-limit";
import { NextResponse, type NextRequest } from "next/server";
import { searchOffices } from "@/lib/shipping";

// Office / locker search for the checkout. Credentials never leave the server.
export async function GET(req: NextRequest) {
  if (await rateLimited("offices", 120)) return NextResponse.json({ error: "too many requests" }, { status: 429 });
  const courier = req.nextUrl.searchParams.get("courier");
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 80);
  if (courier !== "econt" && courier !== "speedy") return NextResponse.json({ error: "bad courier" }, { status: 400 });
  try {
    const offices = await searchOffices(courier, q);
    return NextResponse.json({ offices }, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch (e) {
    console.error("[shipping] offices:", (e as Error).message);
    return NextResponse.json({ offices: [], error: "unavailable" }, { status: 503 });
  }
}
