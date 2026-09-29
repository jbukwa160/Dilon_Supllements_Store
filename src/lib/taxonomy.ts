// Store taxonomy: built-in categories, goals ("Пазарувай по цел"), diet tags and product forms, plus the rules that
// derive goals / diets / product kind / 18+ flag from a product's name and category.
// Shared by the importer (scripts/import-catalog.ts), the admin and the storefront, so keep it free of Node APIs.
// Categories and goals can be renamed, re-ordered and hidden in the admin (settings "categories" / "goals",
// merged in categories.ts); their slugs (addresses) never change.
import type { ProductForm, ProductKind } from "./catalog-types";
import { kw } from "./text-match";

/** Same shape as L10n (l10n.ts); kept local so this file stays dependency-free. */
type Text = { bg: string; en: string };

export type SubCategoryDef = { slug: string; name: Text };
export type CategoryDef = {
  slug: string;
  name: Text;
  tagline: Text;
  /** lucide-react icon name. */
  icon: string;
  /** Tile background. */
  color: string;
  /** Tile text / icon. */
  accent: string;
  subs: SubCategoryDef[];
};

const t = (bg: string, en: string): Text => ({ bg, en });
const sub = (slug: string, bg: string, en: string): SubCategoryDef => ({ slug, name: t(bg, en) });

export const CATEGORIES: CategoryDef[] = [
  {
    slug: "proteini",
    name: t("Протеини", "Protein"),
    tagline: t("Суроватъчен, изолат, казеин, растителен и гейнъри", "Whey, isolate, casein, plant protein and gainers"),
    icon: "dumbbell",
    color: "#e6f2ef",
    accent: "#0a6b5e",
    subs: [
      sub("surovatachen-protein", "Суроватъчен протеин", "Whey protein"),
      sub("protein-izolat", "Изолат и хидролизат", "Whey isolate & hydrolysate"),
      sub("kazein", "Казеин и нощни протеини", "Casein & night protein"),
      sub("rastitelen-protein", "Растителен протеин", "Plant protein"),
      sub("drugi-proteini", "Говежди, яйчен и смесени протеини", "Beef, egg & protein blends"),
      sub("geyneri", "Гейнъри", "Mass gainers"),
    ],
  },
  {
    slug: "kreatin",
    name: t("Креатин", "Creatine"),
    tagline: t("Монохидрат, Creapure и други форми", "Monohydrate, Creapure and other forms"),
    icon: "flask-conical",
    color: "#eef6d6",
    accent: "#4d7c0f",
    subs: [
      sub("kreatin-monohidrat", "Креатин монохидрат", "Creatine monohydrate"),
      sub("kreatinovi-kompleksi", "Други форми и комплекси", "Other forms & blends"),
    ],
  },
  {
    slug: "aminokiselini",
    name: t("Аминокиселини", "Amino acids"),
    tagline: t("BCAA, EAA, глутамин, аргинин и бета-аланин", "BCAA, EAA, glutamine, arginine and beta-alanine"),
    icon: "atom",
    color: "#e8eeff",
    accent: "#3847b8",
    subs: [
      sub("bcaa", "BCAA", "BCAA"),
      sub("eaa", "EAA", "EAA"),
      sub("glutamin", "Глутамин", "Glutamine"),
      sub("drugi-aminokiselini", "Аргинин, цитрулин, бета-аланин и други", "Arginine, citrulline, beta-alanine & more"),
    ],
  },
  {
    slug: "predtrenirovachni-i-energia",
    name: t("Предтренировъчни и енергия", "Pre-workout & energy"),
    tagline: t("Предтренировъчни, енергийни гелове и електролити", "Pre-workouts, energy gels and electrolytes"),
    icon: "flame",
    color: "#ffe9dc",
    accent: "#c2410c",
    subs: [
      sub("predtrenirovachni", "Предтренировъчни и азотни бустери", "Pre-workouts & pump"),
      sub("energia-i-kofein", "Енергийни гелове, шотове и кофеин", "Energy gels, shots & caffeine"),
      sub("elektroliti-i-vaglehidrati", "Електролити, изотоници и въглехидрати", "Electrolytes, isotonics & carbs"),
    ],
  },
  {
    slug: "otslabvane",
    name: t("Отслабване", "Weight management"),
    tagline: t("Фет бърнъри, L-карнитин, CLA и заместители на храна", "Fat burners, L-carnitine, CLA and meal replacements"),
    icon: "scale",
    color: "#fdebec",
    accent: "#b42335",
    subs: [
      sub("fet-barnari", "Фет бърнъри и термогенни", "Fat burners & thermogenics"),
      sub("l-karnitin", "L-карнитин", "L-carnitine"),
      sub("zamestiteli-na-hrana", "Заместители на храна", "Meal replacements"),
      sub("apetit-i-blokeri", "Контрол на апетита и CLA", "Appetite control & CLA"),
      sub("detoks", "Детокс и отводняване", "Detox & water balance"),
    ],
  },
  {
    slug: "vitamini-i-minerali",
    name: t("Витамини и минерали", "Vitamins & minerals"),
    tagline: t("Мултивитамини, витамин D, C и B, магнезий, цинк и още", "Multivitamins, vitamins D, C and B, magnesium, zinc and more"),
    icon: "pill",
    color: "#fff4c8",
    accent: "#a16207",
    subs: [
      sub("multivitamini", "Мултивитамини", "Multivitamins"),
      sub("vitamin-d", "Витамин D", "Vitamin D"),
      sub("vitamin-c", "Витамин C", "Vitamin C"),
      sub("vitamin-b", "Витамини от група B", "B vitamins"),
      sub("drugi-vitamini", "Витамини A, E, K", "Vitamins A, E & K"),
      sub("magnezii", "Магнезий", "Magnesium"),
      sub("tsink", "Цинк", "Zinc"),
      sub("zhelyazo", "Желязо", "Iron"),
      sub("kaltsii", "Калций", "Calcium"),
      sub("drugi-minerali", "Селен, йод, хром и други минерали", "Selenium, iodine, chromium & more"),
      sub("za-detsa", "Витамини за деца", "Kids' vitamins"),
    ],
  },
  {
    slug: "omega-i-mastni-kiselini",
    name: t("Омега и мастни киселини", "Omega & fatty acids"),
    tagline: t("Рибено масло, крил, Омега 3-6-9 и MCT", "Fish oil, krill, omega 3-6-9 and MCT"),
    icon: "fish",
    color: "#e1f1fb",
    accent: "#1d5fa8",
    subs: [
      sub("omega-3", "Рибено масло и Омега-3", "Fish oil & omega-3"),
      sub("krilovo-maslo", "Крилово масло", "Krill oil"),
      sub("omega-3-6-9-i-mct", "Омега 3-6-9, растителни масла и MCT", "Omega 3-6-9, plant oils & MCT"),
    ],
  },
  {
    slug: "stavi-i-kosti",
    name: t("Стави и кости", "Joints & bones"),
    tagline: t("Колаген, глюкозамин, хондроитин и MSM", "Collagen, glucosamine, chondroitin and MSM"),
    icon: "bone",
    color: "#f1ece4",
    accent: "#7c5a2e",
    subs: [
      sub("kolagen", "Колаген", "Collagen"),
      sub("glyukozamin-hondroitin-msm", "Глюкозамин, хондроитин и MSM", "Glucosamine, chondroitin & MSM"),
      sub("kompleksi-za-stavi", "Комплекси за стави и кости", "Joint & bone formulas"),
    ],
  },
  {
    slug: "zdrave-i-imunitet",
    name: t("Здраве и имунитет", "Health & immunity"),
    tagline: t("Имунитет, храносмилане, сърце, мозък и сън", "Immunity, digestion, heart, brain and sleep"),
    icon: "shield-plus",
    color: "#e3f5ea",
    accent: "#18803f",
    subs: [
      sub("imunitet", "Имунитет", "Immune support"),
      sub("probiotitsi-i-hranosmilane", "Пробиотици и храносмилане", "Probiotics & digestion"),
      sub("antioksidanti", "Антиоксиданти и дълголетие", "Antioxidants & longevity"),
      sub("sartse-i-kravoobrashtenie", "Сърце и кръвообращение", "Heart & circulation"),
      sub("mozak-i-pamet", "Мозък, памет и фокус", "Brain, memory & focus"),
      sub("san-i-stres", "Сън, стрес и настроение", "Sleep, stress & mood"),
      sub("cheren-drob", "Черен дроб и пречистване", "Liver support"),
      sub("zrenie", "Зрение", "Eye health"),
      sub("kravna-zahar", "Кръвна захар и метаболизъм", "Blood sugar & metabolism"),
      sub("drugi-dobavki", "Други добавки", "Other supplements"),
    ],
  },
  {
    slug: "bilki-i-ekstrakti",
    name: t("Билки и растителни екстракти", "Herbs & botanicals"),
    tagline: t("Адаптогени, лечебни гъби, билкови екстракти и чайове", "Adaptogens, functional mushrooms, herbal extracts and teas"),
    icon: "leaf",
    color: "#eaf4dc",
    accent: "#3f6212",
    subs: [
      sub("adaptogeni", "Адаптогени", "Adaptogens"),
      sub("gabi", "Лечебни гъби", "Functional mushrooms"),
      sub("bilkovi-ekstrakti", "Билкови екстракти", "Herbal extracts"),
      sub("tinkturi", "Тинктури и течни екстракти", "Tinctures & liquid extracts"),
      sub("bilkovi-chayove", "Билкови и функционални чайове", "Herbal & functional teas"),
    ],
  },
  {
    slug: "krasota",
    name: t("Красота отвътре", "Beauty from within"),
    tagline: t("Колаген, хиалурон и витамини за коса, кожа и нокти", "Collagen, hyaluronic acid and vitamins for hair, skin and nails"),
    icon: "sparkles",
    color: "#fce7f3",
    accent: "#be185d",
    subs: [
      sub("kolagen-i-hialuron", "Колаген и хиалурон за кожа", "Beauty collagen & hyaluronic acid"),
      sub("kosa-kozha-nokti", "Коса, кожа и нокти", "Hair, skin & nails"),
    ],
  },
  {
    slug: "za-mazhe-i-zheni",
    name: t("Хормонален баланс: за мъже и жени", "Men's & women's health"),
    tagline: t("Добавки за мъже, за жени, бременност и кърмене", "Men's and women's health, pregnancy and breastfeeding"),
    icon: "venus-and-mars",
    color: "#efe8fb",
    accent: "#6d28d9",
    subs: [
      sub("za-mazhe", "За мъже и тестостерон", "Men's health & testosterone"),
      sub("za-zheni", "За жени", "Women's health"),
      sub("bremennost", "Бременност и кърмене", "Pregnancy & breastfeeding"),
    ],
  },
  {
    slug: "zdravoslovni-hrani",
    name: t("Здравословни храни", "Healthy food"),
    tagline: t("Протеинови барове, ядкови масла, овесени ядки и сосове без захар", "Protein bars, nut butters, oats and zero sauces"),
    icon: "wheat",
    color: "#fdf1e3",
    accent: "#b45309",
    subs: [
      sub("proteinovi-barove", "Протеинови барове и снаксове", "Protein bars & snacks"),
      sub("yadkovi-masla", "Ядкови масла и кремове", "Nut butters & spreads"),
      sub("zakuska", "Овесени ядки, мюсли и палачинки", "Oats, muesli & pancakes"),
      sub("sirop-sosove-podsladiteli", "Сиропи, сосове и подсладители", "Zero syrups, sauces & sweeteners"),
      sub("superhrani", "Суперхрани", "Superfoods"),
      sub("yadki-i-semena", "Ядки, семена и сушени плодове", "Nuts, seeds & dried fruit"),
      sub("med-i-pchelni-produkti", "Мед и пчелни продукти", "Honey & bee products"),
      sub("napitki", "Функционални напитки и кафе", "Functional drinks & coffee"),
    ],
  },
  {
    slug: "sportni-aksesoari",
    name: t("Спортни аксесоари", "Sports accessories"),
    tagline: t("Шейкъри, бутилки, колани, ръкавици и фитнес уреди", "Shakers, bottles, belts, gloves and fitness equipment"),
    icon: "cup-soda",
    color: "#eceff1",
    accent: "#334155",
    subs: [
      sub("sheykari-i-butilki", "Шейкъри, бутилки и кутии", "Shakers, bottles & pill boxes"),
      sub("kolani-i-rakavitsi", "Колани, ръкавици и накитници", "Belts, gloves & wraps"),
      sub("fitnes-uredi", "Фитнес уреди и ластици", "Fitness equipment & bands"),
    ],
  },
];

export const CATEGORY_BY_SLUG = new Map(CATEGORIES.map((c) => [c.slug, c]));
/** Built-in subcategory slug → its category slug. */
export const SUB_PARENT: Record<string, string> = Object.fromEntries(CATEGORIES.flatMap((c) => c.subs.map((s) => [s.slug, c.slug])));

/** A top or sub category slug → { category, sub } among the built-in ones, or null. */
export function builtInCategoryOf(slug: string): { category: string; sub: string | null } | null {
  if (CATEGORY_BY_SLUG.has(slug)) return { category: slug, sub: null };
  const parent = SUB_PARENT[slug];
  return parent ? { category: parent, sub: slug } : null;
}

// ---------------------------------------------------------------------------
// SHOP SCOPE — what `npm run import` brings into the shop.
//
// The store sells FITNESS / SPORTS NUTRITION only. The export's other health products (herbs, immunity, joints,
// beauty, men's / women's health, omega, generic vitamins …) are classified as before but NOT imported, so their
// categories stay empty and the storefront hides them (menus, tiles, sitemap and filters list only categories with
// products). Every category stays defined above: to sell one again, add it here and run `npm run import`.
//
//   category   top category slug (CATEGORIES above)
//   subs       only these of its subcategories (omitted = all of them)
//   sportsOnly these subcategories (true = all of them) keep only CLEARLY SPORTS products: a sports-nutrition brand
//              (SPORTS_BRAND_KEYS) or a sports word in the name (ZMA, sport, electrolytes, recovery, protein …) —
//              e.g. ZMA, a sports brand's magnesium or multivitamin, an RTD protein drink.

export type ImportScope = { category: string; subs?: string[]; sportsOnly?: true | string[] };

export const IMPORTED_CATEGORIES: ImportScope[] = [
  { category: "proteini" },
  { category: "kreatin" },
  { category: "aminokiselini" },
  { category: "predtrenirovachni-i-energia" },
  // Weight management: fat burners, L-carnitine, CLA / appetite control, sports meal-replacement shakes (not detox).
  {
    category: "otslabvane",
    subs: ["fet-barnari", "l-karnitin", "apetit-i-blokeri", "zamestiteli-na-hrana"],
    sportsOnly: ["zamestiteli-na-hrana"],
  },
  // Healthy SPORTS food: protein bars and snacks, nut butters, oats / pancake mixes, zero sauces, syrups and
  // sweeteners, protein / energy drinks (not superfoods, nuts and dried fruit, honey; not generic organic biscuits,
  // granola or maple syrup — those need a sports / diet word or a sports brand).
  {
    category: "zdravoslovni-hrani",
    subs: ["proteinovi-barove", "yadkovi-masla", "zakuska", "sirop-sosove-podsladiteli", "napitki"],
    sportsOnly: ["proteinovi-barove", "zakuska", "sirop-sosove-podsladiteli", "napitki"],
  },
  // Vitamins and minerals only when they are sports products (ZMA, a sports brand's multivitamin / magnesium / zinc).
  {
    category: "vitamini-i-minerali",
    subs: ["multivitamini", "vitamin-d", "vitamin-c", "vitamin-b", "drugi-vitamini", "magnezii", "tsink", "zhelyazo", "kaltsii", "drugi-minerali"],
    sportsOnly: true,
  },
  { category: "sportni-aksesoari" },
];

/** Sports-nutrition brands (brands.ts brandKey values). Their vitamins, minerals and drinks count as sports products. */
export const SPORTS_BRAND_KEYS = new Set<string>([
  "optimum", "myprotein", "biotech", "scitec", "olimp", "gymbeam", "amix", "applied", "esn", "dymatize", "muscletech", "bsn",
  "ostrovit", "nutrend", "kevinlevrone", "allnutrition", "trec", "universal", "cellucor", "ghost", "6pak", "kfd", "everbuild",
  "weider", "grenade", "barebells", "rule1", "musclepharm", "mutant", "nutrex", "haya", "sfd", "vplab", "herolab", "extrifit",
  "dorianyates", "bornwinner", "gaspari", "fa", "genius", "pure", "swedish", "naughtyboy", "badass", "raw", "ronniecoleman",
  "skull", "lazarangelov", "dexterjackson", "fitspo", "trainedbyjp", "corechampsbykaigreene", "allmax", "nanosupps",
  "controlled", "san", "usp", "scivation", "stacker", "chaoscrew", "ericfavre", "ethicsport", "zoomad", "vshape", "powersystem",
  "harbinger", "musclemeds", "nuclear", "universalanimal", "primaforce", "activlab", "realpharm", "pole", "bestbody", "reflex",
  "maxler", "prozis", "ironmaxx", "sporter", "hitec", "bpi", "evlution", "jnx", "americansupps", "musclerage", "gorillaalpha",
  "blackstone", "cobra", "prosupps", "redcon1", "ryse", "insane", "alphalion", "goldcore", "humanprotect", "battery", "fitforce",
  // healthy sports food
  "skinnyfood", "sportness", "frankonia", "protella", "fitspo", "bornwinner", "nutrend", "oatking", "corny", "grenade", "barebells",
  "quest", "oneprotein", "marsprotein", "yava", "yavalabs", "adonisketo", "adonis",
]);

/** Healthy SPORTS food by its name: protein, keto / low carb, zero sugar, diet sweeteners. */
const SPORTS_FOOD_WORDS = kw(
  "keto", "кето", "low ?carb", "нисковъглехидрат", "zero", "0 ?kcal", "0 калории", "нискокалори", "low calorie", "skinny", "fit$",
  "фит$", "sugar[- ]?free", "no added sugar", "без захар", "без добавена захар", "high protein", "hi protein", "flapjack", "флапджак",
  "konjac", "конджак", "ширатаки", "shirataki", "stevia", "стевия", "erythritol", "еритритол", "xylitol", "ксилитол", "sucralose",
  "сукралоза", "monk fruit", "монк фрут", "collagen", "колаген",
);
/** Oats and pancake / porridge mixes (breakfast subcategory only: oat BISCUITS are no sports food). */
const OATS_WORDS = kw("oat$", "oats", "овес", "овесен", "овесени", "палачинк", "pancake", "porridge", "каша за", "cream of rice", "оризов крем");
/** Never sports products, whatever the category: herbal tinctures, remedies for herpes / anxiety, digestive betaine HCl. */
const NOT_SPORTS = kw("тинктура", "tincture", "херпес", "herpes", "тревожност", "anxiety", "stress relief", "betaine hcl", "бетаин hcl");

/** A sports product by its name, whatever the brand. */
const SPORTS_WORDS = kw(
  "zma$", "зма$", "sport", "спорт", "athlet", "атлет", "активен спорт", "training", "тренировк", "тренировъч", "workout", "gym$",
  "fitness", "фитнес", "bodybuild", "бодибилд", "electrolyt", "електролит", "isotonic", "изотони", "recovery", "hydration", "protein",
  "протеин", "whey", "суроватъч", "pre-?workout", "предтренировъч", "bcaa", "eaa$", "creatin", "креатин", "endurance", "издръжлив",
  "energy drink", "енергийна напитка",
);

/** Is a product of this category in the shop's scope? `brandKey` = brands.ts brandKey of its brand. */
export function inShopScope(category: string, sub: string | null, name: string, brandKey: string | null): boolean {
  const scope = IMPORTED_CATEGORIES.find((s) => s.category === category);
  if (!scope || NOT_SPORTS.test(name)) return false;
  if (scope.subs && (!sub || !scope.subs.includes(sub))) return false;
  const strict = scope.sportsOnly === true || (!!sub && Array.isArray(scope.sportsOnly) && scope.sportsOnly.includes(sub));
  if (!strict) return true;
  if ((!!brandKey && SPORTS_BRAND_KEYS.has(brandKey)) || SPORTS_WORDS.test(name)) return true;
  return category === "zdravoslovni-hrani" && (SPORTS_FOOD_WORDS.test(name) || (sub === "zakuska" && OATS_WORDS.test(name)));
}

/** Top categories and subcategories the shop imports (for reports and admin notes). */
export function importedCategorySlugs(): Set<string> {
  const out = new Set<string>();
  for (const s of IMPORTED_CATEGORIES) {
    out.add(s.category);
    for (const sub of CATEGORY_BY_SLUG.get(s.category)?.subs ?? []) if (!s.subs || s.subs.includes(sub.slug)) out.add(sub.slug);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Goals ("Пазарувай по цел"): a product gets a goal from its subcategory or from keywords in its name.

export type GoalDef = {
  slug: string;
  name: Text;
  description: Text;
  icon: string;
  /** Subcategories whose products all serve this goal. */
  subs: string[];
  /** Keywords in the product name. */
  rx: RegExp;
};

export const GOALS: GoalDef[] = [
  {
    slug: "muskulna-masa",
    name: t("Мускулна маса", "Muscle gain"),
    description: t("Протеини, креатин и гейнъри за сила и мускулен растеж", "Protein, creatine and gainers for strength and muscle growth"),
    icon: "dumbbell",
    subs: ["surovatachen-protein", "protein-izolat", "kazein", "rastitelen-protein", "drugi-proteini", "geyneri", "kreatin-monohidrat", "kreatinovi-kompleksi", "eaa"],
    rx: kw("мускулна маса", "мускулен растеж", "мускулния растеж", "за мускули", "muscle (?:mass|gain|build|growth)", "mass gainer", "anabolic", "анаболн", "hmb$", "хмб$"),
  },
  {
    slug: "otslabvane",
    name: t("Отслабване", "Weight loss"),
    description: t("Фет бърнъри, L-карнитин, заместители на храна и контрол на апетита", "Fat burners, L-carnitine, meal replacements and appetite control"),
    icon: "scale",
    subs: ["fet-barnari", "l-karnitin", "zamestiteli-na-hrana", "apetit-i-blokeri", "detoks"],
    rx: kw(
      "отслабване", "за отслабване", "weight loss", "weight management", "fat burn", "фет бърнър", "бърнър", "burner$", "термоген", "thermogen",
      "slim", "l-?carnitin", "л-?карнитин", "карнитин", "cla$", "garcinia", "гарциния", "глюкоманан", "glucomannan", "изгаряне на мазнини",
    ),
  },
  {
    slug: "energia-i-izdrazhlivost",
    name: t("Енергия и издръжливост", "Energy & endurance"),
    description: t("Предтренировъчни, енергийни гелове, електролити и въглехидрати", "Pre-workouts, energy gels, electrolytes and carbs"),
    icon: "zap",
    subs: ["predtrenirovachni", "energia-i-kofein", "elektroliti-i-vaglehidrati"],
    rx: kw(
      "енергия", "енергиен", "енергийн", "energy", "издръжлив", "endurance", "stamina", "кофеин", "caffeine", "гуарана", "guarana",
      "beta[- ]?alanin", "бета[- ]?аланин", "citrullin", "цитрулин", "cordyceps", "кордицепс", "електролит", "electrolyt",
    ),
  },
  {
    slug: "vazstanovyavane",
    name: t("Възстановяване", "Recovery"),
    description: t("BCAA, EAA, глутамин и електролити след тренировка", "BCAA, EAA, glutamine and electrolytes after training"),
    icon: "battery-charging",
    subs: ["bcaa", "eaa", "glutamin", "kazein"],
    rx: kw("recovery", "recover$", "възстановяв", "restore", "post-?workout", "след тренировка", "zma$", "зма$", "tart cherry"),
  },
  {
    slug: "imunitet",
    name: t("Имунитет", "Immunity"),
    description: t("Витамин C и D, цинк, ехинацея, бъз и лечебни гъби", "Vitamins C and D, zinc, echinacea, elderberry and mushrooms"),
    icon: "shield",
    subs: ["imunitet", "vitamin-c", "vitamin-d", "tsink", "gabi"],
    rx: kw(
      "имун", "immun", "ехинацея", "echinacea", "черен бъз", "elderberry", "sambucus", "бета[- ]?глюкан", "beta[- ]?glucan", "коластра",
      "colostrum", "прополис", "propolis", "витамин[- ]?[cс]$", "vitamin[- ]?c$",
    ),
  },
  {
    slug: "zdrave-i-dalgoletie",
    name: t("Здраве и дълголетие", "Health & longevity"),
    description: t("Мултивитамини, антиоксиданти и добавки за всеки ден", "Multivitamins, antioxidants and everyday essentials"),
    icon: "sprout",
    subs: ["multivitamini", "antioksidanti"],
    rx: kw(
      "антиоксидант", "antioxidant", "дълголет", "longevity", "anti-?aging", "anti-?ageing", "nmn$", "ресвератрол", "resveratrol",
      "глутатион", "glutathion", "мултивитамин", "multivitamin",
    ),
  },
  {
    slug: "stavi-i-kosti",
    name: t("Стави и кости", "Joints & bones"),
    description: t("Колаген, глюкозамин, хондроитин, MSM и калций", "Collagen, glucosamine, chondroitin, MSM and calcium"),
    icon: "bone",
    subs: ["kolagen", "glyukozamin-hondroitin-msm", "kompleksi-za-stavi", "kaltsii"],
    rx: kw(
      "стави", "ставите", "ставн", "joint", "кости", "костите", "костна", "bone", "хрущял", "cartilage", "глюкозамин", "glucosamin",
      "хондроитин", "chondroitin", "msm$", "сухожили", "tendon", "ligament",
    ),
  },
  {
    slug: "san-i-stres",
    name: t("Сън и стрес", "Sleep & stress"),
    description: t("Мелатонин, магнезий, ашваганда и билки за спокойствие", "Melatonin, magnesium, ashwagandha and calming herbs"),
    icon: "moon",
    subs: ["san-i-stres", "adaptogeni"],
    rx: kw(
      "сън$", "съня", "sleep", "мелатонин", "melatonin", "стрес", "stress", "relax", "релакс", "успокоя", "calm", "ашваганда", "ашвагандха",
      "ashwagandha", "валериана", "valerian", "5-?htp", "gaba$", "габа$", "маточина", "lemon balm",
    ),
  },
  {
    slug: "krasota",
    name: t("Красота", "Beauty"),
    description: t("Колаген, хиалурон, биотин и витамини за коса, кожа и нокти", "Collagen, hyaluronic acid, biotin and vitamins for hair, skin and nails"),
    icon: "sparkles",
    subs: ["kolagen-i-hialuron", "kosa-kozha-nokti"],
    rx: kw(
      "коса$", "косата", "hair$", "кожа$", "кожата", "skin$", "нокти", "ноктите", "nails", "красота", "beauty", "биотин", "biotin", "хиалурон",
      "hyaluron", "кератин", "keratin",
    ),
  },
  {
    slug: "sartse-i-kravoobrashtenie",
    name: t("Сърце и кръвоносна система", "Heart & circulation"),
    description: t("Омега-3, коензим Q10 и добавки за сърце и кръвообращение", "Omega-3, coenzyme Q10 and support for heart and circulation"),
    icon: "heart-pulse",
    subs: ["sartse-i-kravoobrashtenie", "omega-3", "krilovo-maslo"],
    rx: kw(
      "сърце", "сърдеч", "heart", "cardio", "кардио", "холестерол", "cholesterol", "кръвоносн", "кръвообращ", "circulation", "коензим",
      "coenzyme", "q-?10", "вени$", "vein", "омега[- ]?3", "omega[- ]?3", "fish oil", "рибено масло",
    ),
  },
  {
    slug: "hranosmilane",
    name: t("Храносмилане", "Digestion"),
    description: t("Пробиотици, ензими и фибри за добро храносмилане", "Probiotics, enzymes and fibre for healthy digestion"),
    icon: "salad",
    subs: ["probiotitsi-i-hranosmilane"],
    rx: kw(
      "храносмил", "digest", "пробиоти", "probiotic", "пребиоти", "prebiotic", "ензим", "enzyme", "фибри", "fiber$", "fibre$", "псилиум",
      "psyllium", "чревн", "червата", "gut$", "стомах", "stomach",
    ),
  },
  {
    slug: "mozak-i-kontsentratsia",
    name: t("Мозък и концентрация", "Brain & focus"),
    description: t("Добавки за памет, фокус и умствена работа", "Support for memory, focus and mental performance"),
    icon: "brain",
    subs: ["mozak-i-pamet"],
    rx: kw(
      "памет", "memory", "фокус", "focus", "концентрац", "мозък", "мозъч", "brain", "ноотроп", "nootrop", "гинко", "ginkgo", "бакопа",
      "bacopa", "lion'?s mane", "лъвска грива", "когнитив", "cognit",
    ),
  },
];

export const GOAL_BY_SLUG = new Map(GOALS.map((g) => [g.slug, g]));

/** Categories whose products never get goals (accessories are not consumed). */
const NO_GOAL_CATEGORIES = new Set(["sportni-aksesoari"]);
const MAX_GOALS = 3;

/** Goals of a product: from its subcategory first, then from keywords in its name (at most 3). */
export function detectGoals(name: string, category: string, sub: string | null): string[] {
  if (NO_GOAL_CATEGORIES.has(category)) return [];
  const out: string[] = [];
  for (const g of GOALS) if (sub && g.subs.includes(sub)) out.push(g.slug);
  for (const g of GOALS) if (!out.includes(g.slug) && g.rx.test(name)) out.push(g.slug);
  return out.slice(0, MAX_GOALS);
}

// ---------------------------------------------------------------------------
// Diet tags (listing facet "Хранителен режим")

export type DietKey = "vegan" | "sugar-free" | "gluten-free" | "lactose-free" | "keto";

export const DIETS: { key: DietKey; name: Text; rx: RegExp }[] = [
  {
    key: "vegan",
    name: t("Веган", "Vegan"),
    rx: kw("веган", "vegan$", "веге$", "vegetarian", "вегетариан", "plant[- ]based", "растителен протеин", "растителни протеини"),
  },
  {
    key: "sugar-free",
    name: t("Без захар", "Sugar-free"),
    rx: kw("без захар", "без добавена захар", "sugar[- ]?free", "zero sugar", "no sugar", "no added sugar", "0\\s?% захар", "0\\s?% sugar", "zero$"),
  },
  { key: "gluten-free", name: t("Без глутен", "Gluten-free"), rx: kw("без глутен", "gluten[- ]?free", "безглутен") },
  { key: "lactose-free", name: t("Без лактоза", "Lactose-free"), rx: kw("без лактоза", "lactose[- ]?free", "безлактоз") },
  { key: "keto", name: t("Кето", "Keto"), rx: kw("keto$", "кето$") },
];

export const DIET_KEYS = DIETS.map((d) => d.key);

/** Diet tags from the name (plant proteins are vegan). */
export function detectDiets(name: string, sub: string | null): DietKey[] {
  const out = DIETS.filter((d) => d.rx.test(name)).map((d) => d.key);
  if (sub === "rastitelen-protein" && !out.includes("vegan")) out.unshift("vegan");
  return out;
}

// ---------------------------------------------------------------------------
// Forms

export const FORMS: { key: ProductForm; name: Text }[] = [
  { key: "powder", name: t("Прах", "Powder") },
  { key: "capsules", name: t("Капсули", "Capsules") },
  { key: "tablets", name: t("Таблетки", "Tablets") },
  { key: "softgels", name: t("Софтгел капсули", "Softgels") },
  { key: "gummies", name: t("Желирани бонбони", "Gummies") },
  { key: "liquid", name: t("Течност", "Liquid") },
  { key: "drink", name: t("Напитка", "Drink") },
  { key: "bar", name: t("Барове", "Bars") },
  { key: "food", name: t("Храна", "Food") },
  { key: "accessory", name: t("Аксесоар", "Accessory") },
  { key: "other", name: t("Друго", "Other") },
];

export const FORM_KEYS = FORMS.map((f) => f.key);

// ---------------------------------------------------------------------------
// Product kind (label rules differ: "Хранителна добавка" only for supplements) and 18+ products

const SPORTS_FOOD_SUBS = new Set([
  "surovatachen-protein", "protein-izolat", "kazein", "rastitelen-protein", "drugi-proteini", "geyneri", "zamestiteli-na-hrana",
  "elektroliti-i-vaglehidrati", "proteinovi-barove",
]);
const FOOD_SUBS = new Set([
  "yadkovi-masla", "zakuska", "sirop-sosove-podsladiteli", "superhrani", "yadki-i-semena", "med-i-pchelni-produkti", "napitki", "bilkovi-chayove",
]);
const ENERGY_FOOD = kw("gel$", "гел$", "гелове", "energy drink", "енергийна напитка", "напитка", "drink$", "bar$", "бар$", "chews");
// Supplements sold in food form (spirulina tablets, maca capsules …) stay supplements.
const SUPPLEMENT_FORM = kw("капсул", "caps$", "capsules", "таблет", "tabs$", "tablets", "softgel", "софтгел", "хранителна добавка", "food supplement");

export function productKindFor(name: string, category: string, sub: string | null): ProductKind {
  if (category === "sportni-aksesoari") return "non-food";
  if (sub && FOOD_SUBS.has(sub)) return SUPPLEMENT_FORM.test(name) ? "supplement" : "food";
  if (sub && SPORTS_FOOD_SUBS.has(sub)) return "sports-food";
  if (sub === "energia-i-kofein" && ENERGY_FOOD.test(name) && !SUPPLEMENT_FORM.test(name)) return "sports-food";
  return "supplement";
}

// 18+ (Закон за закрила на детето чл. 5б, ал. 3: products with a high caffeine content or a stimulating combination of
// caffeine, taurine, guarana …): pre-workouts, energy products, stimulant fat burners.
const STIMULANT = kw(
  "кофеин", "caffeine", "гуарана", "guarana", "energy drink", "енергийна напитка", "енергиен шот", "energy shot", "pre-?workout",
  "предтренировъч", "синефрин", "synephrin", "йохимбин", "yohimbin", "stim$", "high stim", "термоген", "thermogen", "таурин и кофеин",
);
const NON_STIMULANT = kw("без кофеин", "caffeine[- ]?free", "decaf", "stim-?free", "non-?stim", "без стимулант", "zero caffeine");
// Energy shots / drinks / boosters (plain carbohydrate gels without caffeine are not 18+).
const ENERGY_STIMULANT = kw("shot$", "shots$", "шот$", "шотове", "energy drink", "енергийна напитка", "booster", "бустер", "energize", "енергизиращ");

export function isAdultOnly(name: string, category: string, sub: string | null): boolean {
  if (category === "sportni-aksesoari" || NON_STIMULANT.test(name)) return false;
  if (sub === "predtrenirovachni") return true;
  if (sub === "fet-barnari") return true; // fat burners are stimulant blends unless marked stim-free
  if (sub === "energia-i-kofein" && ENERGY_STIMULANT.test(name)) return true;
  return STIMULANT.test(name);
}
