"use client";

import { usePathname } from "next/navigation";

/**
 * usePathname() that always returns the PUBLIC url (/produkt/x, not /bg/produkt/x). Use it instead of
 * usePathname() in every storefront client component.
 * Pages prerendered at build time were rendered as /bg/..., so the server HTML would say "/bg" while the
 * browser says "/" -> hydration error #418. Stripping the default-language prefix makes both agree.
 */
export function usePublicPathname(): string {
  const p = usePathname();
  if (p === "/bg") return "/";
  return p.startsWith("/bg/") ? p.slice(3) : p;
}
