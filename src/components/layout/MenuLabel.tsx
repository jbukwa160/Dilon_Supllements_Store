import clsx from "clsx";
import { contrastText, paletteColor, type MenuAppearance } from "@/lib/settings-types";
import { MenuIcon } from "./MenuIcon";

// The look of a top-menu item, chosen in Admin → Меню (same five styles as /web, in the shop's palette).
// Also used by the admin's menu preview, so: no hooks, no server-only code.

/** Classes + inline style for a top-menu item's outer element (link or button). `active` = open / current. */
export function menuItemProps(a: MenuAppearance, active = false): { className: string; style: React.CSSProperties } {
  // Uppercase, extra-bold labels on square-cornered targets (GymBeam-style nav bar). Colours saved with the old
  // palette are mapped to the current one (paletteColor).
  const base =
    "flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-md)] px-3 py-2 text-[0.9rem] font-extrabold uppercase tracking-[0.01em] transition";
  const color = paletteColor(a.color);
  switch (a.style) {
    case "text":
      return { className: clsx(base, "hover:bg-canvas", active && "bg-canvas"), style: { color } };
    case "pill":
      return { className: clsx(base, "hover:brightness-110", active && "brightness-110"), style: { background: color, color: contrastText(color) } };
    case "outline":
      return { className: clsx(base, "border-[1.5px] hover:bg-canvas", active && "bg-canvas"), style: { borderColor: color, color } };
    case "gradient":
      return { className: clsx(base, "hover:bg-canvas", active && "bg-canvas"), style: {} };
    default:
      return { className: clsx(base, "text-ink hover:text-primary", active && "text-primary"), style: {} };
  }
}

/** Icon + text of a menu item, coloured according to its appearance. */
export function MenuLabel({ label, appearance: a }: { label: string; appearance: MenuAppearance }) {
  // Other styles colour the icon through the parent's text colour.
  const iconColor = a.style === "gradient" ? paletteColor(a.color) : undefined;
  return (
    <>
      <MenuIcon name={a.icon} className="h-[1.1rem] w-[1.1rem] shrink-0" style={iconColor ? { color: iconColor } : undefined} />
      {a.style === "gradient" ? (
        <span style={{ backgroundImage: `linear-gradient(90deg, ${paletteColor(a.color)}, ${paletteColor(a.color2)})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
          {label}
        </span>
      ) : (
        <span>{label}</span>
      )}
    </>
  );
}
