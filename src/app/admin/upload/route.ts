// Picture upload for every admin editor (banners, promo cards, products, categories, blog): POST multipart "file" →
// { url } | { error }. A route handler rather than a Server Action, so the public Server Actions can keep the small
// 1 MB body limit (next.config.ts) while pictures may be up to 10 MB. Admins only (session checked here — route
// handlers don't go through the panel layout), same-site requests only; the type is sniffed from the bytes
// (lib/uploads.ts), the file name and MIME type sent by the browser are ignored.
import { getAdmin } from "@/lib/auth";
import { MAX_UPLOAD_BYTES, readUploadedFile, sameSiteUpload, saveUpload } from "@/lib/uploads";

const json = (data: { url?: string; error?: string }, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  if (!(await getAdmin())) return json({ error: "Сесията е изтекла. Влезте отново в админ панела." }, 401);
  if (!sameSiteUpload(req)) return json({ error: "Невалидна заявка." }, 403);
  const r = await readUploadedFile(req, MAX_UPLOAD_BYTES, "Снимката е по-голяма от 10 MB. Намалете я и опитайте пак.");
  if ("error" in r) return json({ error: r.error }, r.status);
  const saved = await saveUpload(r.file);
  return "error" in saved ? json({ error: saved.error }, 400) : json({ url: saved.url });
}
