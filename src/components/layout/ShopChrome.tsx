// Header, footer, cart drawer, chat, cookie consent and the site-wide providers around every storefront page
// (rendered by app/[lang]/layout.tsx). Must not read cookies() / headers(): the shop pages stay static; customer
// state and cookie consent are read in the browser.
import Link from "next/link";
import clsx from "clsx";
import { ArrowRight, FlaskConical } from "lucide-react";
import { getDict } from "@/i18n";
import type { Lang } from "@/i18n/config";
import { loc } from "@/lib/l10n";
import { isExternalHref, localizeHref } from "@/lib/links";
import { getChatSettings, getHomeContent, getSettings } from "@/lib/settings";
import { THEMES, publicChatConfig, publicSettings } from "@/lib/settings-types";
import { SettingsProvider } from "@/components/SettingsProvider";
import { ConsentProvider } from "@/components/consent/ConsentProvider";
import { CookieConsent } from "@/components/consent/CookieConsent";
import { TrackingScripts } from "@/components/consent/TrackingScripts";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { giftFromAmount, hasDemoPrices, navCategories } from "./nav-data";

/** The admin's announcement strip (Начална страница → Съобщение): themed, optional link. */
function AnnouncementBar({ lang }: { lang: Lang }) {
  const { announcement: a } = getHomeContent();
  const text = loc(a.text, lang);
  if (!a.enabled || !text) return null;
  const theme = THEMES[a.theme];
  const external = isExternalHref(a.href);
  return (
    <div className={clsx("px-4 py-2 text-center text-sm font-semibold", theme.dark ? "on-dark text-white" : "text-ink")} style={{ background: theme.background }}>
      {a.href ? (
        <Link
          href={localizeHref(a.href, lang)}
          target={external ? "_blank" : undefined}
          rel={external ? "noopener" : undefined}
          className="inline-flex items-center gap-1.5 underline-offset-2 hover:underline"
        >
          {text} <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
        </Link>
      ) : (
        text
      )}
    </div>
  );
}

export function ShopChrome({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  const s = getSettings();
  const chat = getChatSettings();
  const dict = getDict(lang);
  const giftFrom = giftFromAmount(lang);
  const categories = navCategories(lang);

  return (
    <SettingsProvider value={publicSettings(s, lang)}>
      <ConsentProvider>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-pill focus:bg-surface focus:px-4 focus:py-2 focus:font-bold focus:shadow-[var(--shadow-overlay)]"
        >
          {dict.common.skipToContent}
        </a>
        {s.showDemoNotice && hasDemoPrices() ? (
          <div className="flex items-center justify-center gap-2 bg-[#5b3fd1] px-4 py-1.5 text-center text-xs font-semibold text-white">
            <FlaskConical className="h-4 w-4 shrink-0" aria-hidden />
            {dict.common.demoNotice}
          </div>
        ) : null}
        <AnnouncementBar lang={lang} />
        <Header lang={lang} settings={s} giftFrom={giftFrom} />

        <main id="main" tabIndex={-1} className="flex-1 outline-none">
          {children}
        </main>

        <Footer lang={lang} settings={s} categories={categories} />

        <CartDrawer />
        {chat.enabled ? <ChatWidget config={publicChatConfig(chat, lang)} /> : null}
        <CookieConsent />
        <TrackingScripts />
      </ConsentProvider>
    </SettingsProvider>
  );
}
