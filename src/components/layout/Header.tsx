import { Suspense } from "react";
import { getDict } from "@/i18n";
import type { Lang } from "@/i18n/config";
import { loc } from "@/lib/l10n";
import { localizeHref } from "@/lib/links";
import { getMenu } from "@/lib/settings";
import type { StoreSettings } from "@/lib/settings-types";
import { AccountButton } from "@/components/account/AccountButton";
import { CartButton } from "@/components/cart/CartButton";
import { WishlistHeaderButton } from "@/components/cart/WishlistButton";
import { Logo } from "./Logo";
import { MegaMenu } from "./MegaMenu";
import { MenuLabel, menuItemProps } from "./MenuLabel";
import { MobileMenu } from "./MobileMenu";
import { NavDropdown, SmartLink } from "./NavDropdown";
import { navCategories, navGoals } from "./nav-data";
import { PhoneSearchButton, PhoneSearchRow } from "./PhoneSearch";
import { SearchBox } from "./SearchBox";
import { TopBar } from "./TopBar";

function SearchFallback() {
  return <div className="h-12 w-full rounded-pill border-[1.5px] border-[#cfcfcf] bg-surface" aria-hidden />;
}

/**
 * Orange promise strip (scrolls away) + sticky header: logo, the big search, account / wishlist / cart and — from
 * `lg` — the nav bar with "Всички категории" and the admin's menu (Admin → Меню). Below `lg` the menu lives in the
 * hamburger drawer and the search gets its own row on phones, which tucks away on scroll-down (PhoneSearch.tsx).
 */
export function Header({ lang, settings: s, giftFrom }: { lang: Lang; settings: StoreSettings; giftFrom: number | null }) {
  const dict = getDict(lang);
  const menu = getMenu();
  const categories = navCategories(lang);
  const goals = navGoals(lang);
  const items = menu.items;

  return (
    <>
      <TopBar lang={lang} settings={s} giftFrom={giftFrom} />
      <header className="sticky top-0 z-40 border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/90 data-[search-collapsed]:border-b md:border-b">
        {/* Opaque and above the phone search row, which slides up behind it on scroll-down. */}
        <div className="relative z-10 bg-surface">
          <div className="container-shop flex h-16 items-center gap-2 md:h-[4.75rem] md:gap-6">
            <MobileMenu
              categories={categories}
              goals={goals}
              items={items}
              contacts={{ phone: s.phone, email: s.email, hours: loc(s.workingHours, lang) }}
            />
            <Logo name={s.name} href={localizeHref("/", lang)} label={`${s.name} — ${dict.common.home}`} />
            <div className="hidden min-w-0 flex-1 md:block lg:mx-auto lg:max-w-[40rem]">
              <Suspense fallback={<SearchFallback />}>
                <SearchBox />
              </Suspense>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
              <PhoneSearchButton />
              <AccountButton />
              <WishlistHeaderButton />
              <CartButton />
            </div>
          </div>
        </div>

        <PhoneSearchRow>
          <Suspense fallback={<SearchFallback />}>
            <SearchBox />
          </Suspense>
        </PhoneSearchRow>

        <nav aria-label={dict.nav.mainNav} className="hidden border-t border-line/70 lg:block">
          <div className="container-shop flex min-h-[3.25rem] flex-wrap items-center gap-x-2 gap-y-1 py-1">
            {menu.categories.show ? (
              <MegaMenu categories={categories} goals={goals} label={loc(menu.categories.label, lang) || dict.nav.allCategories} color={menu.categories.color} />
            ) : null}
            <ul className="flex flex-wrap items-center gap-0.5">
              {items.map((item) => {
                if (item.kind === "dropdown") {
                  return (
                    <li key={item.id}>
                      <NavDropdown item={item} />
                    </li>
                  );
                }
                const p = menuItemProps(item.appearance);
                return (
                  <li key={item.id}>
                    <SmartLink href={item.href} lang={lang} className={p.className} style={p.style}>
                      <MenuLabel label={loc(item.label, lang)} appearance={item.appearance} />
                    </SmartLink>
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>
      </header>
      {/* Keeps the place of the phone search row (absolutely positioned under the sticky header; same height). */}
      <div className="h-[61px] md:hidden" aria-hidden />
    </>
  );
}
