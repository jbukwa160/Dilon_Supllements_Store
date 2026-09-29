// Browser-side helpers for admin file uploads. NOT Server Actions ("use server" is deliberately absent): Server
// Actions have a 1 MB body limit (next.config.ts, it protects every public form), so files go to route handlers
// under /admin that check the admin session and have their own limits:
//   POST /admin/upload        pictures, up to 10 MB   (app/admin/upload/route.ts)
//   POST /admin/tseni/import  price files, up to 15 MB (app/admin/(panel)/tseni/import/route.ts)
// The names and return shapes are the ones the editors already use (ImageField, ProductForm, BlogEditor).
import type { PricePreview } from "@/lib/admin/prices";

async function postFile<T extends object>(url: string, fd: FormData): Promise<T | { error: string }> {
  try {
    const res = await fetch(url, { method: "POST", body: fd, credentials: "same-origin" });
    const data = (await res.json().catch(() => null)) as T | { error?: string } | null;
    if (data && typeof data === "object" && !("error" in data && data.error)) return data as T;
    if (data && "error" in data && data.error) return { error: data.error };
    if (res.status === 413) return { error: "Файлът е твърде голям." };
    return { error: res.status === 401 ? "Сесията е изтекла. Влезте отново в админ панела." : "Качването не успя. Опитайте пак." };
  } catch {
    return { error: "Качването не успя. Проверете връзката и опитайте пак." };
  }
}

/** Uploads a picture (FormData with "file"); `url` is its /uploads/… address. The type is checked by content. */
export async function uploadImageAction(fd: FormData): Promise<{ url?: string; error?: string }> {
  const r = await postFile<{ url: string }>("/admin/upload", fd);
  return "url" in r ? { url: r.url } : { error: r.error };
}

/** Uploads a price file (FormData with "file") and returns the preview of the changes it would make. */
export function uploadPriceFile(fd: FormData): Promise<PricePreview | { error: string }> {
  return postFile<PricePreview>("/admin/tseni/import", fd);
}
