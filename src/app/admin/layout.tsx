import type { Metadata } from "next";
import { Inter, Nunito } from "next/font/google";
import "../globals.css";

// Root layout of the admin panel (the storefront has its own in app/[lang]). Bulgarian only, never indexed.
// `admin-theme` switches the colours, radii and .btn / .field / .chip styles to /web's admin look (globals.css).

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "600", "700", "800", "900"],
  display: "swap",
});
// The shop's fonts, only for live previews of storefront components (`shop-theme`); not preloaded, so they are
// downloaded only on pages that show a preview.
const inter = Inter({ variable: "--font-inter", subsets: ["latin", "cyrillic"], display: "swap", preload: false });

export const metadata: Metadata = {
  title: { default: "Админ панел", template: "%s · Админ панел" },
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  return (
    <html lang="bg" className={`admin-theme ${nunito.variable} ${inter.variable}`}>
      <body className="min-h-screen bg-canvas text-ink antialiased">{children}</body>
    </html>
  );
}
