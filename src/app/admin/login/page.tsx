import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { getAdmin, hasAdminUsers } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { LogoMark } from "@/components/layout/Logo";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Вход" };

export default async function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  if (await getAdmin()) redirect("/admin");
  const { next } = await searchParams;
  const s = getSettings();
  const ready = hasAdminUsers();
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <LogoMark className="h-16 w-16" />
          <h1 className="mt-3 text-2xl font-black">{s.name}</h1>
          <p className="flex items-center gap-1.5 font-bold text-muted">
            <Lock className="h-4 w-4" /> Админ панел
          </p>
        </div>
        <div className="rounded-3xl border border-line bg-white p-6 shadow-[var(--shadow-card)] md:p-8">
          {ready ? (
            <LoginForm next={typeof next === "string" ? next : ""} />
          ) : (
            <div className="space-y-3 text-ink-soft">
              <p className="font-bold text-ink">Все още няма създаден администратор.</p>
              <p>Помолете техническия човек да изпълни в папката на сайта:</p>
              <pre className="overflow-x-auto rounded-xl bg-ink p-3 text-sm text-white">npm run admin:user -- --user admin</pre>
              <p>Командата ще покаже потребителското име и паролата за вход.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
