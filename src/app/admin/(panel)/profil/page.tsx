import type { Metadata } from "next";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { LogOut, Monitor, Smartphone } from "lucide-react";
import { SESSION_COOKIE, requireAdmin } from "@/lib/auth";
import { storeDb } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { endOtherSessionsAction } from "@/app/admin/_actions/profile";
import { PageHeader } from "@/components/admin/PageHeader";
import { PasswordForm } from "@/components/admin/PasswordForm";

export const metadata: Metadata = { title: "Профил и парола" };

type SessionRow = { token_hash: string; created_at: string; last_seen_at: string; ip: string | null; user_agent: string | null };

/** "Chrome · Windows" from a user-agent string (good enough to recognise one's own devices). */
function device(ua: string | null): { label: string; phone: boolean } {
  const s = ua ?? "";
  const browser = /Edg\//.test(s) ? "Edge" : /OPR\//.test(s) ? "Opera" : /Firefox\//.test(s) ? "Firefox" : /Chrome\//.test(s) ? "Chrome" : /Safari\//.test(s) ? "Safari" : "Браузър";
  const os = /Android/.test(s) ? "Android" : /iPhone|iPad/.test(s) ? "iPhone / iPad" : /Windows/.test(s) ? "Windows" : /Mac OS X/.test(s) ? "Mac" : /Linux/.test(s) ? "Linux" : "";
  return { label: os ? `${browser} · ${os}` : browser, phone: /Android|iPhone|iPad|Mobile/.test(s) };
}

export default async function ProfileAdminPage() {
  const admin = await requireAdmin();
  const db = storeDb();
  const user = db.prepare("SELECT created_at, last_login_at FROM admin_users WHERE id = ?").get(admin.id) as { created_at: string; last_login_at: string | null };
  const sessions = db
    .prepare("SELECT token_hash, created_at, last_seen_at, ip, user_agent FROM admin_sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_seen_at DESC")
    .all(admin.id, new Date().toISOString()) as SessionRow[];
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  const current = createHash("sha256").update(token).digest("hex");
  const others = sessions.filter((s) => s.token_hash !== current).length;
  // This device first, then the most recently used ones.
  const shown = [...sessions].sort((a, b) => Number(b.token_hash === current) - Number(a.token_hash === current)).slice(0, 8);

  return (
    <>
      <PageHeader title="Профил и парола" description="Сменете паролата си и вижте от кои устройства сте влезли в админ панела." />
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_360px]">
        <PasswordForm />
        <div className="space-y-5">
          <section className="rounded-3xl border border-line bg-white p-6">
            <h2 className="text-lg font-black">Вашият профил</h2>
            <dl className="mt-3 space-y-2 text-[0.95rem]">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Потребител</dt>
                <dd className="font-bold">{admin.username}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Създаден</dt>
                <dd className="font-bold">{formatDateTime(user.created_at, "bg")}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Последен вход</dt>
                <dd className="font-bold">{user.last_login_at ? formatDateTime(user.last_login_at, "bg") : "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Активни устройства</dt>
                <dd className="font-bold">{sessions.length}</dd>
              </div>
            </dl>
            <p className="mt-4 text-sm text-muted">При смяна на паролата всички други устройства се изписват автоматично.</p>
          </section>

          <section className="rounded-3xl border border-line bg-white p-6">
            <h2 className="text-lg font-black">Влезли устройства</h2>
            <ul className="mt-3 divide-y divide-line">
              {shown.map((s) => {
                const d = device(s.user_agent);
                const Icon = d.phone ? Smartphone : Monitor;
                const mine = s.token_hash === current;
                return (
                  <li key={s.token_hash} className="flex items-start gap-3 py-2.5">
                    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="flex flex-wrap items-center gap-2 font-bold">
                        {d.label}
                        {mine ? <span className="rounded-full bg-mint-soft px-2 py-0.5 text-[0.7rem] font-bold text-mint">това устройство</span> : null}
                      </span>
                      <span className="block text-muted">
                        {s.ip && s.ip !== "local" ? `IP ${s.ip} · ` : ""}последно: {formatDateTime(s.last_seen_at, "bg")}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
            {sessions.length > shown.length ? <p className="text-sm text-muted">…и още {sessions.length - shown.length}</p> : null}
            {others ? (
              <form action={endOtherSessionsAction} className="mt-3">
                <button type="submit" className="btn btn-ghost h-11 px-4 text-sm">
                  <LogOut className="h-4 w-4" /> Изход от другите устройства ({others})
                </button>
              </form>
            ) : (
              <p className="mt-3 text-sm text-muted">Няма други влезли устройства.</p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
