// Catalogue types shared by the storefront, the admin panel, the cart and the importer (SPEC §5.3).
// Field names are binding; only optional fields may be added.

/** Physical form of a product (listing facet "Форма"). */
export type ProductForm = "powder" | "capsules" | "tablets" | "softgels" | "liquid" | "bar" | "gummies" | "drink" | "food" | "accessory" | "other";

/** One card in a listing: the primary product of a family (or a standalone product). */
export type ProductCard = {
  id: number;
  sku: string;
  slug: string;
  /** Localized (name_en when lang = en and set). */
  name: string;
  /** Localized label of THIS variant, e.g. "Шоколад · 1 кг". */
  variantLabel: string | null;
  brand: string | null;
  brandSlug: string | null;
  image: string | null;
  price: number;
  oldPrice: number | null;
  /** Omnibus: lowest price in the 30 days before the discount. */
  lowest30: number | null;
  /** Family variants have different prices -> render "от 24,90 €". */
  priceFrom: boolean;
  stock: number;
  inStockAny: boolean;
  groupId: number | null;
  variantCount: number;
  flavourCount: number;
  categorySlug: string | null;
  form: ProductForm | null;
  isNew: boolean;
  isBestseller: boolean;
  promoLabel: string | null;
  /** Net quantity of THIS variant in grams or millilitres (unit price "€/кг", "€/л"); null / absent when unknown or counted (capsules…). */
  sizeValue?: number | null;
  sizeUnit?: "g" | "ml" | null;
  /** 18+ product (high caffeine): "18+" badge on the card. */
  adultOnly?: boolean;
};

export type ProductVariant = {
  id: number;
  sku: string;
  slug: string;
  flavour: string | null;
  size: string | null;
  label: string;
  price: number;
  oldPrice: number | null;
  lowest30: number | null;
  stock: number;
  image: string | null;
};

export type NutritionRow = { name: string; perServing: string; per100: string; nrv: string };

export type ProductKind = "supplement" | "sports-food" | "food" | "non-food";

/** Label information required for food supplements (SPEC §11b). */
export type SupplementInfo = {
  isSupplement: boolean;
  kind: ProductKind;
  adultOnly: boolean;
  regNo: string;
  form: ProductForm | null;
  servings: number | null;
  servingSize: string;
  netQuantity: string;
  ingredients: string;
  nutrition: NutritionRow[];
  directions: string;
  warnings: string;
  allergens: string;
  storage: string;
};

export type ManufacturerInfo = { name: string; address: string; country: string; email: string; website: string; importer: string };

export type ProductDetail = ProductCard & {
  ean: string | null;
  images: string[];
  description: string;
  category: { slug: string; name: string } | null;
  parentCategory: { slug: string; name: string } | null;
  goals: { slug: string; name: string }[];
  /** Diet keys: vegan, sugar-free, gluten-free, lactose-free, keto. */
  diets: string[];
  /** Whole family incl. this product; [] for standalone. */
  variants: ProductVariant[];
  supplement: SupplementInfo;
  manufacturer: ManufacturerInfo | null;
  weightKg: number | null;
  hidden: boolean;
  updatedAt: string;
};

export type CategoryNode = {
  slug: string;
  name: string;
  tagline: string;
  icon: string;
  color: string;
  image: string | null;
  count: number;
  hidden: boolean;
  children: CategoryNode[];
};

export type BrandInfo = { slug: string; name: string; count: number; inStock: number };

export type GoalInfo = { slug: string; name: string; description: string; icon: string; image: string | null; count: number };

export type ListingScope =
  | { kind: "all" }
  | { kind: "category"; slug: string }
  | { kind: "brand"; slug: string }
  | { kind: "goal"; slug: string }
  | { kind: "sale" }
  | { kind: "new" }
  | { kind: "search"; q: string }
  | { kind: "skus"; skus: string[] };

export type ListingFilters = {
  brands: string[];
  price: string | null;
  inStock: boolean;
  sale: boolean;
  category: string | null;
  goal: string | null;
  forms: string[];
  flavours: string[];
  diets: string[];
};

export const EMPTY_FILTERS: ListingFilters = {
  brands: [],
  price: null,
  inStock: false,
  sale: false,
  category: null,
  goal: null,
  forms: [],
  flavours: [],
  diets: [],
};

export type ListingSort = "popular" | "relevance" | "new" | "price-asc" | "price-desc" | "discount";

export type Facet = { value: string; label: string; count: number; selected: boolean };

export type ListingResult = {
  items: ProductCard[];
  total: number;
  page: number;
  pageCount: number;
  facets: {
    categories: Facet[];
    brands: Facet[];
    prices: Facet[];
    goals: Facet[];
    forms: Facet[];
    flavours: Facet[];
    diets: Facet[];
    inStock: number;
    sale: number;
  };
};

/** Fresh data for a cart / wishlist line (GET /api/products, priceCart). */
export type CartSnapshot = {
  id: number;
  sku: string;
  slug: string;
  groupId: number | null;
  name: string;
  variant: string | null;
  brand: string | null;
  brandSlug: string | null;
  image: string | null;
  price: number;
  oldPrice: number | null;
  stock: number;
  hidden: boolean;
  weightKg: number | null;
  adultOnly: boolean;
};
