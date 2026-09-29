import {
  Bell,
  BookOpen,
  Crown,
  Dumbbell,
  Flame,
  Gift,
  Heart,
  Leaf,
  Moon,
  Percent,
  Pill,
  Shield,
  Snowflake,
  Sparkles,
  Star,
  Sun,
  Tag,
  Target,
  Trophy,
  Truck,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { MenuIconName } from "@/lib/settings-types";

/** lucide icon of every name the admin can pick for a menu item (MENU_ICONS in settings-types.ts). */
export const MENU_ICON_COMPONENTS: Record<Exclude<MenuIconName, "none">, LucideIcon> = {
  gift: Gift,
  percent: Percent,
  tag: Tag,
  star: Star,
  sparkles: Sparkles,
  flame: Flame,
  heart: Heart,
  dumbbell: Dumbbell,
  zap: Zap,
  leaf: Leaf,
  pill: Pill,
  shield: Shield,
  moon: Moon,
  sun: Sun,
  trophy: Trophy,
  target: Target,
  crown: Crown,
  snowflake: Snowflake,
  truck: Truck,
  bell: Bell,
  book: BookOpen,
};

/** The icon in front of a top-menu item (nothing for "none"). Decorative: the label says what it is. */
export function MenuIcon({ name, className, style }: { name: MenuIconName; className?: string; style?: React.CSSProperties }) {
  if (name === "none") return null;
  const Icon = MENU_ICON_COMPONENTS[name];
  return Icon ? <Icon className={className} style={style} strokeWidth={2} aria-hidden /> : null;
}
