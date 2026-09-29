// Price file preview for "Цени и промоции → Цени от Excel": POST multipart "file" (.xlsx / .csv, up to 15 MB) →
// PricePreview | { error }. The file of the whole catalogue is ≈2 MB as .xlsx and ≈5 MB as .csv, above the 1 MB body
// limit of Server Actions (next.config.ts), so it is uploaded here. Admins only (session checked here), same-site
// requests only. Applying the previewed changes stays the Server Action applyPriceFileAction.
import { getAdmin } from "@/lib/auth";
import { previewPriceFile } from "@/lib/admin/prices";
import { readUploadedFile, sameSiteUpload } from "@/lib/uploads";

const MAX_FILE = 15 * 1024 * 1024;
const noStore = { "Cache-Control": "no-store" };

export async function POST(req: Request) {
  if (!(await getAdmin())) return Response.json({ error: "Сесията е изтекла. Влезте отново в админ панела." }, { status: 401, headers: noStore });
  if (!sameSiteUpload(req)) return Response.json({ error: "Невалидна заявка." }, { status: 403, headers: noStore });
  const r = await readUploadedFile(req, MAX_FILE, "Файлът е твърде голям (максимум 15 MB).");
  if ("error" in r) return Response.json({ error: r.error === "Не е избран файл." ? "Изберете файл." : r.error }, { status: r.status, headers: noStore });
  const preview = await previewPriceFile(Buffer.from(await r.file.arrayBuffer()), r.file.name);
  return Response.json(preview, { headers: noStore });
}
