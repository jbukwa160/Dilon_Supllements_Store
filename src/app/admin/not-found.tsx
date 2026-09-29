import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LogoMark } from "@/components/layout/Logo";

// Unknown admin addresses (app/admin/[...rest]) and notFound() in admin pages, inside the admin root layout.
export default function AdminNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl border border-line bg-white p-8 text-center shadow-[var(--shadow-card)]">
        <LogoMark className="mx-auto h-14 w-14" />
        <h1 className="mt-4 text-2xl font-black">Страницата не е намерена</h1>
        <p className="mt-2 text-ink-soft">Адресът е грешен или тази страница вече не съществува.</p>
        <Link href="/admin" className="btn btn-primary mt-6 h-12 px-6">
          <ArrowLeft className="h-5 w-5" /> Към таблото
        </Link>
      </div>
    </div>
  );
}
