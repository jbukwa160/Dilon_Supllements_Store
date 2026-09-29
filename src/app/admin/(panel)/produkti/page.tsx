import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, PackagePlus } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import {
  adminProductsHref,
  brandNames,
  categoryChoices,
  dietChoices,
  goalChoices,
  hasAdminFilters,
  kindChoices,
  listAdminProducts,
  parseAdminQuery,
  type AdminQuery,
} from "@/lib/admin/products";
import { PageHeader } from "@/components/admin/PageHeader";
import { ProductFilters } from "@/components/admin/ProductFilters";
import { ProductRows } from "@/components/admin/ProductRows";

export const metadata: Metadata = { title: "Продукти" };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function ProductsAdminPage({ searchParams }: { searchParams: SP }) {
  await requireAdmin();
  const state = parseAdminQuery(await searchParams);
  const { sort } = state;
  const query: AdminQuery = { q: state.q, category: state.category, brand: state.brand, stock: state.stock, kind: state.kind, filter: state.filter };
  const result = listAdminProducts(state);
  const categories = categoryChoices();
  const kinds = kindChoices();
  const href = (page: number) => adminProductsHref({ ...state, page });

  return (
    <>
      <PageHeader
        title="Продукти"
        description="Търсете продукт и променете цената, промо цената, наличността или видимостта направо в таблицата — после натиснете „Запази промените“. За снимки, етикет и описание натиснете „Редактирай“. За да промените много продукти наведнъж, отметнете ги вляво."
        actions={
          <Link href="/admin/produkti/nov" className="btn btn-primary h-12 px-6">
            <PackagePlus className="h-5 w-5" /> Добави продукт
          </Link>
        }
      />

      <ProductFilters query={query} sort={sort} categories={categories} brands={brandNames()} kinds={kinds} />

      <p className="mb-3 font-bold text-ink-soft">
        Намерени: <span className="text-ink">{result.total.toLocaleString("bg-BG")}</span> {result.total === 1 ? "продукт" : "продукта"}
        {hasAdminFilters(query) ? (
          <Link href="/admin/produkti" className="ml-3 text-sm text-brand hover:underline">
            Изчисти търсенето
          </Link>
        ) : null}
      </p>

      {result.items.length ? (
        <ProductRows
          key={href(result.page)}
          items={result.items}
          total={result.total}
          query={query}
          categories={categories}
          goals={goalChoices()}
          diets={dietChoices()}
          kinds={kinds}
        />
      ) : (
        <div className="rounded-3xl border border-dashed border-line bg-white p-10 text-center font-bold text-ink-soft">Няма продукти, отговарящи на търсенето.</div>
      )}

      {result.pageCount > 1 ? (
        <nav className="mt-6 flex flex-wrap items-center justify-center gap-3" aria-label="Страници">
          <Link
            href={href(result.page - 1)}
            aria-disabled={result.page <= 1}
            tabIndex={result.page <= 1 ? -1 : undefined}
            className={`btn btn-ghost h-11 px-4 ${result.page <= 1 ? "pointer-events-none opacity-40" : ""}`}
          >
            <ChevronLeft className="h-5 w-5" /> Предишна
          </Link>
          <span className="font-bold text-ink-soft">
            Страница {result.page} от {result.pageCount.toLocaleString("bg-BG")}
          </span>
          <Link
            href={href(result.page + 1)}
            aria-disabled={result.page >= result.pageCount}
            tabIndex={result.page >= result.pageCount ? -1 : undefined}
            className={`btn btn-ghost h-11 px-4 ${result.page >= result.pageCount ? "pointer-events-none opacity-40" : ""}`}
          >
            Следваща <ChevronRight className="h-5 w-5" />
          </Link>
        </nav>
      ) : null}
    </>
  );
}
