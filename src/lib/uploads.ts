import "server-only";
import path from "node:path";
import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { DATA_DIR } from "./db";

// Uploaded pictures live in data/uploads (not public/, which Next only serves as of build time)
// and are served by app/uploads/[file]/route.ts.
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const UPLOAD_NAME_RE = /^[a-z0-9]{20,40}\.(jpg|png|webp|gif|avif)$/;

export const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};

/** Detect the real image type from the file's first bytes (never trust the file name). Also used by scripts/fetch-images.ts. */
export function sniff(buf: Buffer): keyof typeof CONTENT_TYPES | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  if (buf.subarray(0, 6).toString("ascii") === "GIF87a" || buf.subarray(0, 6).toString("ascii") === "GIF89a") return "gif";
  if (buf.subarray(4, 8).toString("ascii") === "ftyp" && /avi[fs]/.test(buf.subarray(8, 12).toString("ascii"))) return "avif";
  return null;
}

/**
 * The multipart field `field` of an admin upload request (route handlers under /admin, which check the session
 * first). The body is read with a hard cap of `maxBytes` (+ room for the multipart envelope) whether or not the
 * browser sent Content-Length, so an oversized upload is refused without being held in memory.
 */
export async function readUploadedFile(
  req: Request,
  maxBytes: number,
  tooBig: string,
  field = "file",
): Promise<{ file: File } | { error: string; status: number }> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("multipart/form-data")) return { error: "Невалидна заявка.", status: 400 };
  const cap = maxBytes + 64 * 1024;
  if (Number(req.headers.get("content-length") ?? 0) > cap) return { error: tooBig, status: 413 };
  if (!req.body) return { error: "Не е избран файл.", status: 400 };
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = req.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > cap) {
      await reader.cancel().catch(() => {});
      return { error: tooBig, status: 413 };
    }
    chunks.push(value);
  }
  const fd = await new Response(Buffer.concat(chunks), { headers: { "content-type": type } }).formData().catch(() => null);
  const file = fd?.get(field);
  if (!(file instanceof File) || file.size === 0) return { error: "Не е избран файл.", status: 400 };
  if (file.size > maxBytes) return { error: tooBig, status: 413 };
  return { file };
}

/** Same-site request (browsers always send Origin on POST): a cross-site page must not upload with the admin's cookie. */
export function sameSiteUpload(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === (req.headers.get("x-forwarded-host") ?? req.headers.get("host"));
  } catch {
    return false;
  }
}

export async function saveUpload(file: File): Promise<{ url: string } | { error: string }> {
  if (!file || typeof file.arrayBuffer !== "function" || file.size === 0) return { error: "Не е избран файл." };
  if (file.size > MAX_UPLOAD_BYTES) return { error: "Снимката е по-голяма от 10 MB. Намалете я и опитайте пак." };
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = sniff(buf);
  if (!ext) return { error: "Файлът не е снимка. Използвайте JPG, PNG, WEBP, GIF или AVIF." };
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const name = `${randomBytes(12).toString("hex")}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return { url: `/uploads/${name}` };
}
