import Link from "next/link";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react";

// Building blocks of Admin → Табло (server components, /web's dashboard look).

export function StatTile({ label, value, sub, href, tone }: { label: string; value: string; sub?: React.ReactNode; href: string; tone?: "attention" }) {
  return (
    <Link
      href={href}
      className={clsx(
        "rounded-3xl border p-5 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]",
        tone === "attention" ? "border-sun bg-sun-soft" : "border-line bg-white",
      )}
    >
      <div className="text-sm font-bold text-muted">{label}</div>
      <div className="mt-1 text-3xl font-black">{value}</div>
      {sub ? <div className="text-sm text-ink-soft">{sub}</div> : null}
    </Link>
  );
}

/** Coloured banner, optionally with an action: brand = needs attention now, sun = warning. */
export function DashboardBanner({ icon: Icon, tone, children, href, action }: { icon: LucideIcon; tone: "brand" | "sun"; children: React.ReactNode; href?: string; action?: string }) {
  return (
    <div className={clsx("mb-4 flex flex-wrap items-center gap-3 rounded-3xl border-2 p-5", tone === "brand" ? "border-brand bg-brand-soft" : "border-sun bg-sun-soft")} role={tone === "brand" ? "alert" : undefined}>
      <Icon className={clsx("h-6 w-6 shrink-0", tone === "brand" && "text-brand")} />
      <div className="min-w-0 flex-1 basis-60 font-bold">{children}</div>
      {href && action ? (
        <Link href={href} className="btn btn-primary h-11 px-5 !shadow-none">
          {action}
        </Link>
      ) : null}
    </div>
  );
}

export function QuickAction({ href, icon: Icon, title, text }: { href: string; icon: LucideIcon; title: string; text: string }) {
  return (
    <Link href={href} className="group flex items-start gap-3 rounded-3xl border border-line bg-white p-5 transition hover:border-ink xl:flex-col">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block font-black">{title}</span>
        <span className="text-sm text-ink-soft">{text}</span>
      </span>
    </Link>
  );
}

export function SectionTitle({ children, href, link }: { children: React.ReactNode; href?: string; link?: string }) {
  return (
    <div className="mb-3 mt-8 flex items-end justify-between gap-3">
      <h2 className="text-xl font-black">{children}</h2>
      {href && link ? (
        <Link href={href} className="text-sm font-extrabold text-brand hover:underline">
          {link} →
        </Link>
      ) : null}
    </div>
  );
}

export function StatusPill({ on, children }: { on: boolean | "warn"; children: React.ReactNode }) {
  return (
    <span className={clsx("rounded-full px-3 py-1 text-xs font-extrabold", on === "warn" ? "bg-sun-soft text-ink" : on ? "bg-mint-soft text-mint" : "bg-line text-muted")}>{children}</span>
  );
}
