// Navigation data handed from the Header (server) to the menus (client): already localized, links language-neutral.

export type NavSub = { slug: string; name: string; count: number };

export type NavCategory = {
  slug: string;
  name: string;
  tagline: string;
  /** lucide icon name (CategoryIcon). */
  icon: string;
  /** Tile background and text / icon colour. */
  color: string;
  accent: string;
  image: string | null;
  count: number;
  subs: NavSub[];
  /** Most stocked brands of the category. */
  brands: { slug: string; name: string }[];
};

export type NavGoal = { slug: string; name: string; icon: string; count: number };
