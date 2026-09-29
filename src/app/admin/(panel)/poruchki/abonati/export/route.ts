// CSV of the newsletter / marketing subscribers (Поръчки → Абонати → "Изтегли CSV"). Admins only: the session is
// checked here too (route handlers don't go through the panel layout); without it the browser goes to the login page.
import { requireAdmin } from "@/lib/auth";
import { subscribersCsv } from "@/lib/admin/subscribers";

export async function GET() {
  await requireAdmin();
  const date = new Date().toISOString().slice(0, 10);
  return new Response(subscribersCsv(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="abonati-${date}.csv"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
