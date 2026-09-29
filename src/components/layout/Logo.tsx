import Link from "next/link";
import clsx from "clsx";

/**
 * The monogram: a capsule-shaped "D" split into a deep and a hot orange half (the same drawing is the favicon,
 * app/icon.svg). The counter is white, so it also reads on the black footer and on the admin's navy sidebar.
 */
export function LogoMark({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path d="M6 14a8 8 0 0 1 8-8h9v36h-9a8 8 0 0 1-8-8Z" fill="#CC3300" />
      <path d="M25 6h1a18 18 0 0 1 0 36h-1Z" fill="#FF4410" />
      <path d="M14 15h12a9 9 0 0 1 0 18H14Z" fill="#fff" />
    </svg>
  );
}

/**
 * Mark + wordmark. The first word of the store name is the big wordmark (Inter Black italic, "DILON"), the rest a
 * small spaced line under it (Inter 700, "NUTRITION"). `variant="dark"` for dark bands (footer, top bar).
 * `href` must already be localized; `label` is the accessible name (e.g. "Dilon Nutrition — начало").
 */
export function Logo({
  name = "Dilon Nutrition",
  href = "/",
  label,
  variant = "light",
  className,
}: {
  name?: string;
  href?: string;
  label?: string;
  variant?: "light" | "dark";
  className?: string;
}) {
  const [first, ...rest] = name.trim().split(/\s+/);
  const dark = variant === "dark";
  return (
    <Link href={href} aria-label={label ?? name} className={clsx("flex shrink-0 items-center gap-2", className)}>
      <LogoMark className="h-9 w-9 md:h-10 md:w-10" />
      <span className="flex flex-col leading-none" aria-hidden>
        <span className={clsx("font-display text-[1.45rem] font-black uppercase italic tracking-[-0.035em] md:text-[1.7rem]", dark ? "text-white" : "text-ink")}>
          {first}
        </span>
        {rest.length ? (
          <span className={clsx("mt-0.5 text-[0.6rem] font-bold uppercase tracking-[0.24em] md:text-[0.64rem]", dark ? "text-accent" : "text-primary")}>
            {rest.join(" ")}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
