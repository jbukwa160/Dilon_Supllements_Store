// Price file download for "Цени и промоции → Цени от Excel" (?format=xlsx|csv&kat=&stock=1). Admins only: the session is
// checked here too (route handlers don't go through the panel layout).
import { getAdmin } from "@/lib/auth";
import { exportCategory, exportPricesCsv, exportPricesXlsx } from "@/lib/admin/prices";

export async function GET(req: Request) {
  if (!(await getAdmin())) return new Response("Влезте отново в админ панела.", { status: 401, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const url = new URL(req.url);
  const category = exportCategory(url.searchParams.get("kat") ?? "");
  const csv = url.searchParams.get("format") === "csv";
  // The "Наличност" column only on request: stock comes from the catalogue import.
  const opts = { stock: url.searchParams.get("stock") === "1" };
  const date = new Date().toISOString().slice(0, 10);
  const name = `ceni-${category || "vsichki"}-${date}.${csv ? "csv" : "xlsx"}`;
  const body = csv ? exportPricesCsv(category, opts) : await exportPricesXlsx(category, opts);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": csv ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
