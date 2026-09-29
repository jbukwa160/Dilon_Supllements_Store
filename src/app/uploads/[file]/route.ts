import fs from "node:fs";
import path from "node:path";
import { CONTENT_TYPES, UPLOAD_DIR, UPLOAD_NAME_RE } from "@/lib/uploads";

// Public: pictures uploaded in the admin panel (banners, product photos).
export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  if (!UPLOAD_NAME_RE.test(file)) return new Response("Not found", { status: 404 });
  const full = path.join(UPLOAD_DIR, file);
  if (!fs.existsSync(full)) return new Response("Not found", { status: 404 });
  const ext = file.split(".").pop()!;
  return new Response(fs.readFileSync(full), {
    headers: {
      "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
