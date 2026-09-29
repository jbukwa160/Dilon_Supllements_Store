// GET /api/account/export -> the signed-in customer's data as a JSON download ("Изтегли моите данни", GDPR
// art. 15 / 20). 401 JSON when nobody is signed in. Read-only; the SameSite=Lax session cookie plus CORS keep
// other sites from reading it.
import { NextResponse } from "next/server";
import { getCustomer } from "@/lib/customer-auth";
import { exportCustomerData } from "@/lib/customer-account";
import { rateLimited } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { slugify } from "@/lib/slug";

export async function GET() {
  const c = await getCustomer();
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  if (await rateLimited("account-export", 20, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "600", "Cache-Control": "private, no-store" } });
  }
  const store = getSettings().name;
  const data = exportCustomerData(c.id, store);
  if (!data) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  const file = `${slugify(store, 40) || "account"}-data-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
