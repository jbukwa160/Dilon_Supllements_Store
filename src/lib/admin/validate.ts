// Checks for what the admin types into Продукти (the product editor, the inline table edits). Pure — shared by the
// Server Actions and the client editor (live "what is missing on the label" list), so no server-only imports here.
import type { NutritionRow, ProductForm, ProductKind } from "@/lib/catalog-types";
import type { ProductEditData } from "@/lib/catalog-sync";

// ---------------------------------------------------------------------------
// Choices

export const PRODUCT_KINDS: { key: ProductKind; label: string; hint: string }[] = [
  { key: "supplement", label: "Хранителна добавка", hint: "Капсули, таблетки, прахове и течности с витамини, минерали, билки и други активни вещества." },
  { key: "sports-food", label: "Храна за спортисти", hint: "Протеини, гейнъри, барове, изотонични напитки и заместители на храна." },
  { key: "food", label: "Храна", hint: "Ядкови масла, снаксове, подсладители, чайове, суперхрани." },
  { key: "non-food", label: "Нехранителен продукт", hint: "Шейкъри, бутилки, аксесоари — без етикет на храна." },
];
export const KIND_LABELS = Object.fromEntries(PRODUCT_KINDS.map((k) => [k.key, k.label])) as Record<ProductKind, string>;
export const isProductKind = (v: unknown): v is ProductKind => typeof v === "string" && v in KIND_LABELS;

export const FORM_LABELS: Record<ProductForm, string> = {
  powder: "Прах",
  capsules: "Капсули",
  tablets: "Таблетки",
  softgels: "Софтгел капсули",
  gummies: "Желирани бонбони",
  liquid: "Течност",
  drink: "Напитка",
  bar: "Бар",
  food: "Храна",
  accessory: "Аксесоар",
  other: "Друго",
};
export const isProductForm = (v: unknown): v is ProductForm => typeof v === "string" && v in FORM_LABELS;

// ---------------------------------------------------------------------------
// Parsing

/**
 * An amount typed by a person or written by a spreadsheet → euros rounded to cents; null when empty or not a number.
 * "12,99" / "12.99" / "1 234,50 €" / "1.234,50" / "1,234.50" / "1'234.50". With both "," and "." the last one is the
 * decimal separator; a lone separator followed by exactly three digits ("1,299", "12.500") or used more than once
 * ("1.234.567") separates thousands. (The price upload preview flags big changes, in case a file meant otherwise.)
 */
export function parseMoney(v: string | number | null | undefined): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  if (v == null) return null;
  let t = String(v)
    .replace(/[€\s'’]/g, "") // \s covers no-break spaces too
    .replace(/(eur|евро|лв)\.?$/i, "")
    .replace(/[.,]$/, "");
  if (!t) return null;
  const lastComma = t.lastIndexOf(",");
  const lastDot = t.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? "," : ".";
    t = t
      .split(decimal === "," ? "." : ",")
      .join("")
      .replace(decimal, ".");
  } else if (lastComma >= 0 || lastDot >= 0) {
    const parts = t.split(lastComma >= 0 ? "," : ".");
    const thousands = parts.length > 2 || (parts[1].length === 3 && /^-?[1-9]\d{0,2}$/.test(parts[0]));
    t = parts.join(thousands ? "" : ".");
  }
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** A whole number ("1 200" → 1200); null when empty or not a whole number. */
export function parseCount(v: string | number | null | undefined): number | null {
  if (typeof v === "number") return Number.isInteger(v) ? v : null;
  if (v == null) return null;
  const t = String(v).replace(/[\s ]/g, "");
  if (!/^-?\d+$/.test(t)) return null;
  return Number(t);
}

/** Price for an input field: 12.5 → "12,50", null → "". */
export const moneyText = (n: number | null | undefined) => (n == null ? "" : n.toFixed(2).replace(".", ","));

/** An uploaded picture (/uploads/…) or an http(s) address. */
export function isImageUrl(u: string): boolean {
  return /^\/uploads\/[a-z0-9]+\.[a-z]+$/.test(u) || /^https?:\/\/[^\s<>"']+$/i.test(u);
}

/** Sale end as the admin enters it: Bulgarian local "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm". */
export const SALE_END_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;

const line = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
/** Multi-line text: trimmed, clipped, at most two empty lines in a row. */
const text = (v: unknown, max: number) =>
  String(v ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);

// ---------------------------------------------------------------------------
// The product editor

/** What the product editor sends (numbers as typed, so "12,99" works). */
export type ProductPayload = {
  name: string;
  nameEn: string;
  brand: string;
  /** Top or sub category slug. */
  category: string;
  ean: string;
  kind: ProductKind;
  /** "" = not set. */
  form: ProductForm | "";
  featured: boolean;
  hidden: boolean;
  /** Shipping weight in kg, "" = unknown. */
  weightKg: string;
  price: string;
  salePrice: string;
  /** "" = until changed; "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm" Bulgarian time. */
  saleEndsAt: string;
  stock: string;
  adultOnly: boolean;
  regNo: string;
  servingSize: string;
  servings: string;
  netQuantity: string;
  ingredients: string;
  allergens: string;
  nutrition: NutritionRow[];
  directions: string;
  warnings: string;
  storage: string;
  description: string;
  descriptionEn: string;
  images: string[];
  flavour: string;
  flavourEn: string;
  size: string;
  /** Family: null = automatic, "" = on its own, anything else = the key of the family it joins. */
  groupKey: string | null;
  /** Name of the family card set by hand; "" = automatic (the members' name without flavour / size). */
  familyName: string;
  goals: string[];
  diets: string[];
};

/** Every field of the editor, validated, in the shape the catalogue writes take. */
export type ValidProduct = Required<Omit<ProductEditData, "form">> & { form?: ProductForm; familyName: string };

export type ValidationContext = {
  /** Every top and sub category slug (as edited in Admin → Категории). */
  categories: Set<string>;
  goals: Set<string>;
  diets: Set<string>;
};

export const LIMITS = {
  name: 300,
  brand: 80,
  images: 20,
  description: 20000,
  ingredients: 10000,
  directions: 5000,
  warnings: 5000,
  allergens: 2000,
  storage: 1000,
  short: 120,
  flavour: 80,
  size: 60,
  familyName: 200,
  nutritionRows: 60,
  nutritionCell: 80,
} as const;

/** Nutrition table rows: trimmed, empty rows dropped. Returns an error text for a row with numbers but no name. */
export function cleanNutrition(rows: unknown): { rows: NutritionRow[]; error?: string } {
  const list = Array.isArray(rows) ? rows : [];
  const out: NutritionRow[] = [];
  let error: string | undefined;
  for (const r of list) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const row = {
      name: line(o.name, LIMITS.nutritionCell),
      perServing: line(o.perServing, LIMITS.nutritionCell),
      per100: line(o.per100, LIMITS.nutritionCell),
      nrv: line(o.nrv, LIMITS.nutritionCell),
    };
    if (!row.name && !row.perServing && !row.per100 && !row.nrv) continue;
    if (!row.name) error = "Всеки ред от таблицата трябва да има име на съставката (напр. „Витамин C“).";
    out.push(row);
  }
  if (out.length > LIMITS.nutritionRows) error = `Таблицата може да има до ${LIMITS.nutritionRows} реда.`;
  return { rows: out.filter((r) => r.name).slice(0, LIMITS.nutritionRows), error };
}

export function validateProduct(p: ProductPayload, ctx: ValidationContext): { value?: ValidProduct; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  const name = line(p.name, 1000);
  if (!name) errors.name = "Въведете име на продукта.";
  else if (name.length > LIMITS.name) errors.name = `Името е твърде дълго (до ${LIMITS.name} символа).`;
  const nameEn = line(p.nameEn, 1000);
  if (nameEn.length > LIMITS.name) errors.nameEn = `Името на английски е твърде дълго (до ${LIMITS.name} символа).`;

  const brand = line(p.brand, 200);
  if (brand.length > LIMITS.brand) errors.brand = `Марката е твърде дълга (до ${LIMITS.brand} символа).`;

  const category = String(p.category ?? "");
  if (!ctx.categories.has(category)) errors.category = "Изберете категория.";

  const ean = String(p.ean ?? "").replace(/\s/g, "");
  if (ean && !/^\d{8,14}$/.test(ean)) errors.ean = "Баркодът трябва да е от 8 до 14 цифри (или оставете полето празно).";

  if (!isProductKind(p.kind)) errors.kind = "Изберете вид на продукта.";
  const form = isProductForm(p.form) ? p.form : undefined;

  let weightKg: number | null = null;
  if (String(p.weightKg ?? "").trim()) {
    const w = parseMoney(p.weightKg);
    if (w == null || w <= 0 || w > 100) errors.weightKg = "Въведете тегло в килограми, напр. 1,2 (или оставете празно).";
    else weightKg = w;
  }

  const price = parseMoney(p.price);
  if (price == null || price <= 0) errors.price = "Въведете цена, по-голяма от 0 (напр. 24,90).";
  else if (price > 100000) errors.price = "Цената е твърде голяма.";

  let salePrice: number | null = null;
  if (String(p.salePrice ?? "").trim()) {
    const s = parseMoney(p.salePrice);
    if (s == null || s <= 0) errors.salePrice = "Невалидна промо цена (напр. 19,90).";
    else if (price != null && s >= price) errors.salePrice = "Промо цената трябва да е по-ниска от редовната цена — иначе оставете полето празно.";
    else salePrice = s;
  }
  const saleEnds = String(p.saleEndsAt ?? "").trim();
  if (saleEnds && !SALE_END_RE.test(saleEnds)) errors.saleEndsAt = "Невалидна дата.";
  const saleEndsAt = salePrice != null && saleEnds && SALE_END_RE.test(saleEnds) ? saleEnds : null;

  const stock = parseCount(p.stock);
  if (stock == null || stock < 0) errors.stock = "Въведете брой — 0 или повече.";
  else if (stock > 1_000_000) errors.stock = "Твърде голямо число.";

  let servings: number | null = null;
  if (String(p.servings ?? "").trim()) {
    const s = parseCount(p.servings);
    if (s == null || s < 1 || s > 10000) errors.servings = "Броят дози трябва да е цяло число (напр. 30) или празно.";
    else servings = s;
  }

  const nutrition = cleanNutrition(p.nutrition);
  if (nutrition.error) errors.nutrition = nutrition.error;

  const images = (Array.isArray(p.images) ? p.images : []).map((u) => String(u).trim()).filter(Boolean);
  if (images.some((u) => !isImageUrl(u))) errors.images = "Има невалиден линк към снимка — трябва да започва с https://.";
  else if (images.length > LIMITS.images) errors.images = `Максимум ${LIMITS.images} снимки.`;

  let groupKey: string | null = null;
  if (p.groupKey !== null && p.groupKey !== undefined) {
    groupKey = String(p.groupKey).trim();
    if (groupKey.length > 200) errors.groupKey = "Невалидно семейство.";
  }

  const familyName = line(p.familyName, 1000);
  if (familyName.length > LIMITS.familyName) errors.familyName = `Името на семейството е твърде дълго (до ${LIMITS.familyName} символа).`;

  const description = text(p.description, LIMITS.description + 1);
  if (description.length > LIMITS.description) errors.description = `Описанието е твърде дълго (до ${LIMITS.description} символа).`;
  const descriptionEn = text(p.descriptionEn, LIMITS.description + 1);
  if (descriptionEn.length > LIMITS.description) errors.descriptionEn = `Описанието на английски е твърде дълго (до ${LIMITS.description} символа).`;

  const pick = (list: unknown, known: Set<string>) => [...new Set((Array.isArray(list) ? list : []).filter((x): x is string => typeof x === "string" && known.has(x)))].slice(0, 12);

  if (Object.keys(errors).length) return { errors };
  const kind = p.kind;
  return {
    errors,
    value: {
      name,
      nameEn,
      brand,
      category,
      ean,
      kind,
      isSupplement: kind === "supplement",
      ...(form ? { form } : {}),
      featured: !!p.featured,
      hidden: !!p.hidden,
      weightKg,
      price: price!,
      salePrice,
      saleEndsAt,
      stock: stock!,
      adultOnly: !!p.adultOnly,
      regNo: line(p.regNo, LIMITS.short),
      servingSize: line(p.servingSize, LIMITS.short),
      servings,
      netQuantity: line(p.netQuantity, LIMITS.short),
      ingredients: text(p.ingredients, LIMITS.ingredients),
      allergens: text(p.allergens, LIMITS.allergens),
      nutrition: nutrition.rows,
      directions: text(p.directions, LIMITS.directions),
      warnings: text(p.warnings, LIMITS.warnings),
      storage: text(p.storage, LIMITS.storage),
      description,
      descriptionEn,
      images: images.slice(0, LIMITS.images),
      flavour: line(p.flavour, LIMITS.flavour),
      flavourEn: line(p.flavourEn, LIMITS.flavour),
      size: line(p.size, LIMITS.size),
      groupKey,
      familyName,
      goals: pick(p.goals, ctx.goals),
      diets: pick(p.diets, ctx.diets),
    },
  };
}

// ---------------------------------------------------------------------------
// Inline edits in the product table

export type RowInput = { id: number; price: string; salePrice: string; stock: string; hidden: boolean };
export type ValidRow = { price: number; salePrice: number | null; stock: number; hidden: boolean };

export function validateRow(r: RowInput): { value?: ValidRow; error?: string } {
  const price = parseMoney(r.price);
  if (price == null || price <= 0) return { error: "Невалидна цена — въведете число, по-голямо от 0." };
  if (price > 100000) return { error: "Цената е твърде голяма." };
  let salePrice: number | null = null;
  if (String(r.salePrice ?? "").trim()) {
    salePrice = parseMoney(r.salePrice);
    if (salePrice == null || salePrice <= 0) return { error: "Невалидна промо цена." };
    if (salePrice >= price) return { error: "Промо цената трябва да е по-ниска от цената." };
  }
  const stock = parseCount(r.stock);
  if (stock == null || stock < 0 || stock > 1_000_000) return { error: "Невалидна наличност — цяло число, 0 или повече." };
  return { value: { price, salePrice, stock, hidden: !!r.hidden } };
}

// ---------------------------------------------------------------------------
// Mandatory label information (Reg. (EU) 1169/2011 Art. 9 and 14; Наредба за изискванията към хранителните добавки
// чл. 14–17) — shown as a checklist in the editor and used by the "Без етикетна информация" filter.

export type LabelInput = Pick<
  ProductPayload,
  "kind" | "ingredients" | "allergens" | "nutrition" | "servingSize" | "directions" | "netQuantity" | "storage" | "regNo" | "adultOnly" | "warnings"
>;

export type LabelCheck = { key: string; label: string; hint: string; ok: boolean; required: boolean };

const VITAMIN_OR_MINERAL =
  /витамин|vitamin|калций|calcium|магнези|magnesium|цинк|zinc|желязо|iron|селен|selen|йод|iodine|манган|mangan|хром|chrom|молибден|molybd|фолиев|folic|фолат|folate|биотин|biotin|ниацин|niacin|рибофлавин|riboflavin|тиамин|thiamin|пантотен|pantothen|калий|potassium|фосфор|phosph|флуорид|fluorid|\bмед\b|copper|\bb\d{1,2}\b|\bd3\b|\bk2\b/i;
const CAFFEINE = /кофеин|caffeine/i;

/** What the label of this product still lacks (every item with `ok: false`). */
export function labelChecklist(p: LabelInput, opts: { manufacturer: boolean }): LabelCheck[] {
  const has = (v: string) => !!v.trim();
  const rows = (p.nutrition ?? []).filter((r) => r.name.trim());
  const food = p.kind !== "non-food";
  const out: LabelCheck[] = [];
  const add = (key: string, label: string, hint: string, ok: boolean, required = true) => out.push({ key, label, hint, ok, required });

  if (p.kind === "supplement") {
    add("ingredients", "Състав", "Списък на всички съставки, в низходящ ред по количество.", has(p.ingredients));
    add("allergens", "Алергени", "Алергените от състава — или „Няма“.", has(p.allergens));
    add("servingSize", "Препоръчителна дневна доза", "Напр. „2 капсули дневно“.", has(p.servingSize));
    add("directions", "Начин на употреба", "Как и кога се приема.", has(p.directions));
    add("nutrition", "Съдържание в дневната доза", "Таблицата: количество на всяко активно вещество в дневната доза.", rows.some((r) => has(r.perServing)));
    const vm = rows.filter((r) => VITAMIN_OR_MINERAL.test(r.name));
    if (vm.length) add("nrv", "% от референтния прием (РСП)", "За витамините и минералите в таблицата.", vm.every((r) => has(r.nrv)));
    add("netQuantity", "Нетно количество", "Напр. „90 капсули“ или „300 g“.", has(p.netQuantity));
    add("storage", "Условия за съхранение", "Напр. „На сухо място под 25 °C“.", has(p.storage));
    add("regNo", "Рег. № в БАБХ", "Номер от регистъра на хранителните добавки към БАБХ.", has(p.regNo));
  } else if (food) {
    add("ingredients", "Състав", "Списък на всички съставки, в низходящ ред по количество.", has(p.ingredients));
    add("allergens", "Алергени", "Алергените от състава — или „Няма“.", has(p.allergens));
    add("nutrition", "Хранителна стойност на 100 g / 100 ml", "Енергия, мазнини, въглехидрати, захари, белтъчини, сол.", rows.some((r) => has(r.per100)));
    add("netQuantity", "Нетно количество", "Напр. „1000 g“.", has(p.netQuantity));
    add("storage", "Условия за съхранение", "Напр. „На сухо и хладно място“.", has(p.storage));
    add("directions", "Начин на употреба", "Препоръчително за спортните храни.", has(p.directions), false);
  }
  add("manufacturer", "Производител / отговорен оператор", "Попълва се веднъж за марката в „Производители“.", opts.manufacturer, food);
  if (food && p.adultOnly) {
    add("caffeine", "Предупреждение за кофеин", "Напр. „Съдържа кофеин. Не се препоръчва за деца и бременни жени.“", CAFFEINE.test(p.warnings), false);
  }
  return out;
}
