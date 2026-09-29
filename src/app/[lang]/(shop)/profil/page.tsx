import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Heart, MapPin, Package, ShoppingBag, UserRoundPen } from "lucide-react";
import { fmt, getDict } from "@/i18n";
import { isLang } from "@/i18n/config";
import { requireCustomer } from "@/lib/customer-auth";
import { customerOrderStats } from "@/lib/customer-account";
import { getDefaultCustomerAddress } from "@/lib/customer-addresses";
import { formatPrice, plural } from "@/lib/format";
import { localizeHref } from "@/lib/links";
import { listCustomerOrders } from "@/lib/orders";
import { alternates } from "@/lib/seo";
import { FormAlert } from "@/components/account/fields";
import { OrderListItem, orderImages } from "@/components/account/OrderListItem";
import { AddressSummary } from "@/components/account/AddressSummary";

// Account overview: greeting, the last 3 orders, shortcuts, the default address.

export async function generateMetadata({ params }: PageProps<"/[lang]/profil">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  return { title: getDict(lang).account.profile, alternates: alternates("/profil", lang), robots: { index: false, follow: false } };
}

export default async function AccountPage({ params, searchParams }: PageProps<"/[lang]/profil">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const c = await requireCustomer(lang, "/profil");
  const sp = await searchParams;
  const d = getDict(lang);
  const t = d.account;
  const { items: orders } = listCustomerOrders(c.id, 1, 3);
  const images = orderImages(lang, orders);
  const stats = customerOrderStats(c.id);
  const address = getDefaultCustomerAddress(c.id);
  const notice = sp.welcome ? t.dashboard.welcome : sp.reset ? t.dashboard.passwordReset : null;
  const href = (p: string) => localizeHref(p, lang);

  const shortcuts = [
    { href: "/profil/porachki", title: t.area.orders, text: t.dashboard.ordersText, icon: Package },
    { href: "/profil/adresi", title: t.area.addresses, text: t.dashboard.addressesText, icon: MapPin },
    { href: "/profil/danni", title: t.area.details, text: t.dashboard.detailsText, icon: UserRoundPen },
    { href: "/lyubimi", title: t.area.wishlist, text: t.dashboard.wishlistText, icon: Heart },
  ];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="h-display text-[1.6rem] md:text-4xl">{fmt(t.hello, { name: c.firstName })}</h1>
        {stats.orders ? (
          <p className="mt-2 text-muted">
            {plural(lang, stats.orders, t.ordersPage.count)} · {formatPrice(stats.spent, lang)}
          </p>
        ) : null}
        {notice ? (
          <FormAlert tone="success" className="mt-4">
            {notice}
          </FormAlert>
        ) : null}
      </header>

      <section aria-labelledby="last-orders">
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 id="last-orders" className="text-xl font-bold">
            {t.dashboard.lastOrders}
          </h2>
          {orders.length ? (
            <Link href={href("/profil/porachki")} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
              {t.dashboard.allOrders}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : null}
        </div>
        {orders.length ? (
          <ul className="space-y-3">
            {orders.map((o) => (
              <OrderListItem key={o.id} order={o} lang={lang} images={images} />
            ))}
          </ul>
        ) : (
          <div className="card flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-3 text-muted">
              <ShoppingBag className="h-6 w-6 shrink-0 text-primary" aria-hidden />
              {t.noOrders}
            </p>
            <Link href={href("/produkti")} className="btn btn-primary">
              {t.dashboard.startShopping}
            </Link>
          </div>
        )}
      </section>

      <section aria-labelledby="shortcuts">
        <h2 id="shortcuts" className="mb-3 text-xl font-bold">
          {t.dashboard.shortcuts}
        </h2>
        <ul className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {shortcuts.map((s) => {
            const Icon = s.icon;
            return (
              <li key={s.href}>
                <Link href={href(s.href)} className="card flex h-full flex-col gap-2 p-4 transition-shadow hover:shadow-lift sm:p-5">
                  <span className="grid h-10 w-10 place-items-center rounded-pill bg-primary-50 text-primary" aria-hidden>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="font-bold">{s.title}</span>
                  <span className="text-sm text-muted">{s.text}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="default-address" className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="default-address" className="text-lg font-bold">
            {t.dashboard.defaultAddress}
          </h2>
          <Link href={href("/profil/adresi")} className="text-sm font-semibold text-primary hover:underline">
            {address ? t.dashboard.manageAddresses : t.dashboard.addAddress}
          </Link>
        </div>
        {address ? <AddressSummary address={address} lang={lang} className="mt-3" /> : <p className="mt-2 text-muted">{t.dashboard.noAddress}</p>}
      </section>
    </div>
  );
}
