import clsx from "clsx";
import { Newspaper } from "lucide-react";
import { THEMES, type ThemeKey } from "@/lib/settings-types";
import { ProductImage } from "@/components/product/ProductImage";

/** The post's own picture, or a gradient (theme) with up to three products from the post. No hooks (admin previews too). */
export function BlogCover({
  cover,
  theme,
  images,
  title,
  size = "card",
  eager = false,
}: {
  cover: string;
  theme: ThemeKey;
  images: string[];
  /** Alt text; "" when the cover is decorative (next to the post's title). */
  title: string;
  size?: "card" | "hero";
  eager?: boolean;
}) {
  if (cover) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={cover} alt={title} loading={eager ? "eager" : "lazy"} referrerPolicy="no-referrer" className="h-full w-full object-cover" />
    );
  }
  const t = THEMES[theme] ?? THEMES.sunrise;
  const hero = size === "hero";
  return (
    <div
      className="relative flex h-full w-full items-center justify-center overflow-hidden"
      style={{ background: t.background }}
      {...(title ? { role: "img", "aria-label": title } : { "aria-hidden": true })}
    >
      <div className={clsx("pointer-events-none absolute -right-10 -top-12 rounded-full", t.dark ? "bg-white/10" : "bg-white/60", hero ? "h-72 w-72" : "h-40 w-40")} />
      <div className={clsx("pointer-events-none absolute -bottom-14 -left-8 rounded-full", t.dark ? "bg-accent/15" : "bg-accent/30", hero ? "h-56 w-56" : "h-32 w-32")} />
      {images.length ? (
        <div className={clsx("relative flex items-end justify-center", hero ? "gap-3 px-6 md:gap-5 md:px-8" : "gap-2.5 px-5")}>
          {images.slice(0, 3).map((src, i) => (
            <span
              key={src}
              className={clsx(
                "block overflow-hidden rounded-lg bg-surface shadow-[var(--shadow-lift)]",
                hero ? "p-2.5 md:p-3" : "p-2",
                i === 1 ? (hero ? "h-32 w-32 md:h-52 md:w-52" : "h-28 w-28") : hero ? "h-24 w-24 md:h-40 md:w-40" : "h-20 w-20",
                i === 0 && "-rotate-6",
                i === 2 && "rotate-6",
              )}
            >
              <ProductImage src={src} alt="" eager={eager} />
            </span>
          ))}
        </div>
      ) : (
        <Newspaper className={clsx("relative", t.dark ? "text-white/80" : "text-ink/25", hero ? "h-24 w-24" : "h-14 w-14")} aria-hidden />
      )}
    </div>
  );
}
