// Title block of a listing page: plain (all products, new, search), tinted with the category / goal colours, or a
// dark band (sale). `children` go under the title (subcategory chips). No hooks.
import clsx from "clsx";

export function ListingHeader({
  title,
  subtitle,
  eyebrow,
  icon,
  tone = "plain",
  color,
  accent,
  children,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  icon?: React.ReactNode;
  tone?: "plain" | "tint" | "dark";
  /** Background of the tinted panel (#rrggbb). */
  color?: string;
  /** Icon / title colour on the tinted panel. */
  accent?: string;
  children?: React.ReactNode;
}) {
  if (tone === "plain") {
    return (
      <header className="mb-6 md:mb-8">
        {eyebrow ? <p className="mb-2 text-sm font-semibold uppercase tracking-[0.08em] text-muted">{eyebrow}</p> : null}
        <h1 className="h-display text-[1.6rem] md:text-[2.1rem]">{title}</h1>
        {subtitle ? <p className="mt-2 max-w-3xl text-[0.95rem] text-muted md:text-base">{subtitle}</p> : null}
        {children ? <div className="mt-4">{children}</div> : null}
      </header>
    );
  }
  // "tint" (category / goal pages): GymBeam-style plain white header — the icon sits on a small tile in the
  // category's colour, the title stays black. "dark" (sale): a black band.
  const dark = tone === "dark";
  return (
    <header className={clsx("mb-6 md:mb-8", dark && "on-dark overflow-hidden rounded-[var(--radius-xl)] bg-ink px-5 py-6 text-white md:px-8 md:py-8")}>
      <div className="flex items-center gap-3.5 md:gap-4">
        {icon ? (
          <span
            className={clsx(
              "grid h-12 w-12 shrink-0 place-items-center rounded-[var(--radius-lg)] md:h-14 md:w-14 [&>svg]:h-6 [&>svg]:w-6 md:[&>svg]:h-7 md:[&>svg]:w-7",
              dark ? "bg-accent text-ink" : "",
            )}
            style={dark ? undefined : { background: color || "var(--color-canvas)", color: accent || "var(--color-ink)" }}
          >
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          {eyebrow ? (
            <p className={clsx("mb-0.5 text-[0.78rem] font-bold uppercase tracking-[0.06em]", dark ? "text-white/80" : "text-muted")}>{eyebrow}</p>
          ) : null}
          <h1 className="h-display text-[1.5rem] md:text-[2.1rem]">{title}</h1>
          {subtitle ? <p className={clsx("mt-1 text-[0.95rem] md:text-base", dark ? "text-white/85" : "text-muted")}>{subtitle}</p> : null}
        </div>
      </div>
      {children ? <div className="mt-4 md:mt-5">{children}</div> : null}
    </header>
  );
}
