import "server-only";
// Names of the cookies and browser-storage entries the store really uses, for the Cookie Policy table.
// Imported from the modules that set them where they are exported; the rest must be kept in sync by hand:
//   sp_consent — components/consent (B), sp_chat — api/chat (H), sp-cart-v2 / sp-wishlist-v1 — lib/store.ts (D).
import { LANG_COOKIE } from "@/i18n/config";
import { SESSION_COOKIE as ADMIN_COOKIE } from "@/lib/auth";
import { CUSTOMER_COOKIE } from "@/lib/customer-auth";
import { DEVICE_COOKIES } from "@/lib/login-guard";
import { ORDERS_COOKIE } from "@/lib/order-access";

export const COOKIE_NAMES = {
  session: CUSTOMER_COOKIE,
  device: DEVICE_COOKIES.customer,
  admin: ADMIN_COOKIE,
  adminDevice: DEVICE_COOKIES.admin,
  orders: ORDERS_COOKIE,
  consent: "sp_consent",
  lang: LANG_COOKIE,
  chat: "sp_chat",
  cart: "sp-cart-v2",
  wishlist: "sp-wishlist-v1",
} as const;
