// POST /api/internal/revalidate — refreshes every cached storefront page (both languages) for callers outside a
// Server Action: the price scheduler after a promotion / sale starts or ends, and `npm run import`
// (lib/revalidate.ts requestSiteRevalidate()). Needs "Authorization: Bearer <token>" (lib/revalidate.ts); anything
// else gets the same JSON 404 as an unknown /api address, so the endpoint doesn't advertise itself.
import { revalidatePath } from "next/cache";
import { storeDb } from "@/lib/db";
import { isRevalidateToken } from "@/lib/revalidate";

const notFound = () => Response.json({ error: "Not found" }, { status: 404 });

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!isRevalidateToken(storeDb(), token)) return notFound();
  revalidatePath("/", "layout");
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

export { notFound as GET, notFound as HEAD, notFound as PUT, notFound as PATCH, notFound as DELETE, notFound as OPTIONS };
