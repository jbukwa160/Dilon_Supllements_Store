import clsx from "clsx";

// Square-cornered badges (product cards, product page, cart), GymBeam-style: sale = red, deal = orange, new = black,
// bestseller = hot orange with ink text, low stock = outline, out of stock = grey. Short texts only; they come from
// the dictionaries (uppercase is applied here).
const TONES = {
  sale: "bg-sale text-white",
  deal: "bg-primary text-white",
  new: "bg-ink text-white",
  bestseller: "bg-accent text-ink",
  outline: "border border-ink/25 bg-surface text-ink",
  muted: "bg-line text-ink-soft",
  success: "bg-primary-50 text-success",
  info: "bg-primary-50 text-primary-700",
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({ tone = "muted", children, className, title }: { tone?: BadgeTone; children: React.ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={clsx(
        "inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-1.5 py-[0.2rem] text-[0.7rem] font-extrabold uppercase leading-tight tracking-[0.03em] tabular-nums",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
