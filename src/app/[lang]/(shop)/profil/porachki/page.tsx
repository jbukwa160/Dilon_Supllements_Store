import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, ShoppingBag } from "lucide-react";
import { fmt, getDict } from "@/i18n";
import { isLang } from "@/i18n/config";
import { requireCustomer } from "@/lib/customer-auth";
import { plural } from "@/lib/format";
import { localizeHref } from "@/lib/links";
import { listCustomerOrders } from "@/lib/orders";
import { alternates } from "@/lib/seo";
import { OrderListItem, orderImages } from "@/components/account/OrderListItem";

// The customer's orders, newest first, 10 per page (?page=N).

const PER_PAGE = 10;

export async function generateMetadata({ params }: PageProps<"/[lang]/profil/porachki">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  return { title: getDict(lang).account.orders, alternates: alternates("/profil/porachki", lang), robots: { index: false, follow: false } };
}

/** Page numbers around the current one: 1 … 4 5 [6] 7 8 … 20. */
function pageList(page: number, count: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let p = 1; p <= count; p++) {
    if (p === 1 || p === count || Math.abs(p - page) <= 1) out.push(p);
    else if (out[out.length - 1] !== null) out.push(null);
  }
  return out;
}

export default async function AccountOrdersPage({ params, searchParams }: PageProps<"/[lang]/profil/porachki">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const sp = await searchParams;
  const requested = Number(Array.isArray(sp.page) ? sp.page[0] : sp.page) || 1;
  const c = await requireCustomer(lang, requested > 1 ? `/profil/porachki?page=${requested}` : "/profil/porachki");
  const t = getDict(lang).account;
  const { items, total, page, pageCount } = listCustomerOrders(c.id, requested, PER_PAGE);
  const images = orderImages(lang, items);
  const pageHref = (p: number) => localizeHref(p > 1 ? `/profil/porachki?page=${p}` : "/profil/porachki", lang);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="h-display text-[1.6rem] md:text-4xl">{t.orders}</h1>
        {total ? <p className="mt-2 text-muted">{plural(lang, total, t.ordersPage.count)}</p> : null}
      </header>

      {items.length ? (
        <ul className="space-y-3">
          {items.map((o) => (
            <OrderListItem key={o.id} order={o} lang={lang} images={images} />
          ))}
        </ul>
      ) : (
        <div className="card flex flex-col items-center gap-4 px-5 py-12 text-center">
          <ShoppingBag className="h-10 w-10 text-primary" aria-hidden />
          <p className="text-lg font-semibold">{t.noOrders}</p>
          <Link href={localizeHref("/produkti", lang)} className="btn btn-primary">
            {t.dashboard.startShopping}
          </Link>
        </div>
      )}

      {pageCount > 1 ? (
        <nav aria-label={t.ordersPage.pages} className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">{fmt(t.ordersPage.page, { page, pages: pageCount })}</p>
          <ul className="flex flex-wrap items-center gap-1.5">
            {page > 1 ? (
              <li>
                <Link href={pageHref(page - 1)} rel="prev" className="chip min-h-11 px-3">
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                  {t.ordersPage.prev}
                </Link>
              </li>
            ) : null}
            {pageList(page, pageCount).map((p, i) =>
              p === null ? (
                <li key={`gap-${i}`} className="px-1 text-muted" aria-hidden>
                  …
                </li>
              ) : (
                <li key={p}>
                  <Link
                    href={pageHref(p)}
                    aria-current={p === page ? "page" : undefined}
                    aria-label={fmt(t.ordersPage.goToPage, { page: p })}
                    className="chip min-h-11 min-w-11 justify-center tabular-nums"
                  >
                    {p}
                  </Link>
                </li>
              ),
            )}
            {page < pageCount ? (
              <li>
                <Link href={pageHref(page + 1)} rel="next" className="chip min-h-11 px-3">
                  {t.ordersPage.next}
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </Link>
              </li>
            ) : null}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
