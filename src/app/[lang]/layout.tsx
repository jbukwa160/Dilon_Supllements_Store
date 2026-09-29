import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Inter } from "next/font/google";
import { site } from "@/config/site";
import { DEFAULT_LANG, LANGS, isLang } from "@/i18n/config";
import { I18nProvider } from "@/i18n/client";
import { loc } from "@/lib/l10n";
import { ogLocale } from "@/lib/seo";
import { getSettings } from "@/lib/settings";
import { ShopChrome } from "@/components/layout/ShopChrome";
import "../globals.css";

// Root layout of the storefront. Bulgarian lives at "/" (the proxy rewrites it to /bg internally), English at "/en".
// The admin panel has its own root layout (app/admin/layout.tsx); moving between the two reloads the page.

// One family for text, UI and display headings (variable font 100–900; headings use 800–900).
const inter = Inter({ variable: "--font-inter", subsets: ["latin", "cyrillic"], display: "swap" });

export function generateStaticParams() {
  return LANGS.map((lang) => ({ lang }));
}
// Do NOT add `export const dynamicParams = false` here: in Next 16.3.6 the pages regenerated after revalidatePath()
// then become cached 404s (NoFallbackError). Unknown languages are rejected with isLang() below instead.

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang: raw } = await params;
  const lang = isLang(raw) ? raw : DEFAULT_LANG;
  const s = getSettings();
  return {
    metadataBase: new URL(site.url),
    title: { default: `${s.name} — ${loc(s.tagline, lang)}`, template: `%s | ${s.name}` },
    description: loc(s.description, lang),
    applicationName: s.name,
    openGraph: { siteName: s.name, locale: ogLocale(lang), alternateLocale: ogLocale(lang === "en" ? "bg" : "en"), type: "website" },
    // No canonical / hreflang here: every page sets its own with alternates(path, lang) from lib/seo. A default in
    // the layout would be inherited by any page that forgets it and point that page's canonical at the home page.
  };
}

export const viewport: Viewport = {
  themeColor: "#111111",
};

export default async function ShopRootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  return (
    <html lang={lang} className={inter.variable}>
      <body className="flex min-h-screen flex-col">
        <I18nProvider lang={lang}>
          <ShopChrome lang={lang}>{children}</ShopChrome>
        </I18nProvider>
      </body>
    </html>
  );
}
