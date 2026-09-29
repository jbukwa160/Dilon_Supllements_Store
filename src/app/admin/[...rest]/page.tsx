import { notFound } from "next/navigation";

// Without this, /admin/unknown would fall through to the storefront's app/[lang] with lang="admin".
export default function AdminCatchAll() {
  notFound();
}
