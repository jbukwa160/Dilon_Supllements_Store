// UI dictionaries of the storefront. Usable anywhere (Server Components, Server Actions with an explicit lang,
// route handlers, client components through useDict() in ./client). One namespace file per area in ./messages,
// each written as defineMessages({ bg, en }) so a missing English key fails `tsc`.
import type { Lang } from "./config";
import type { Widen } from "./define";
import account from "./messages/account";
import blog from "./messages/blog";
import cart from "./messages/cart";
import chat from "./messages/chat";
import checkout from "./messages/checkout";
import common from "./messages/common";
import cookies from "./messages/cookies";
import errors from "./messages/errors";
import footer from "./messages/footer";
import giftTiers from "./messages/giftTiers";
import header from "./messages/header";
import home from "./messages/home";
import info from "./messages/info";
import listing from "./messages/listing";
import nav from "./messages/nav";
import newsletter from "./messages/newsletter";
import order from "./messages/order";
import product from "./messages/product";
import search from "./messages/search";
import wishlist from "./messages/wishlist";

const NAMESPACES = {
  account,
  blog,
  cart,
  chat,
  checkout,
  common,
  cookies,
  errors,
  footer,
  giftTiers,
  header,
  home,
  info,
  listing,
  nav,
  newsletter,
  order,
  product,
  search,
  wishlist,
};

type Namespaces = typeof NAMESPACES;

/** The whole dictionary of one language: dict.cart.title, dict.checkout.methods["econt-office"].label … */
export type Dict = { [K in keyof Namespaces]: Widen<Namespaces[K]["bg"]> };

function build(lang: Lang): Dict {
  const out: Record<string, unknown> = {};
  for (const [ns, messages] of Object.entries(NAMESPACES)) out[ns] = messages[lang];
  return out as Dict;
}

const DICTS: Record<Lang, Dict> = { bg: build("bg"), en: build("en") };

export function getDict(lang: Lang): Dict {
  return DICTS[lang] ?? DICTS.bg;
}

/** Replaces "{name}" tokens: fmt("Още {amount} до подаръка", { amount: "7,60 €" }). Unknown tokens stay as they are. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
