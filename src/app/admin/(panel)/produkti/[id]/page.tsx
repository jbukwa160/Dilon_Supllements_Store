import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleCheck } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { brandNames, categoryChoices, dietChoices, getAdminProduct, goalChoices, priceHistory, productPayload } from "@/lib/admin/products";
import { PageHeader } from "@/components/admin/PageHeader";
import { ProductForm } from "@/components/admin/ProductForm";

export const metadata: Metadata = { title: "Редакция на продукт" };

export default async function EditProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  await requireAdmin();
  const id = Number((await params).id);
  const p = Number.isInteger(id) ? getAdminProduct(id) : null;
  if (!p) notFound();
  const { created } = await searchParams;

  const initial = productPayload(p);

  return (
    <>
      <Link href="/admin/produkti" className="mb-3 inline-flex items-center gap-1.5 font-bold text-ink-soft hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Всички продукти
      </Link>
      <PageHeader title={p.name} description="Направете промените и натиснете „Запази промените“ най-долу. Промените се пазят и при следващото зареждане на файла с продукти." />
      {created ? (
        <p className="mb-5 flex items-center gap-2 rounded-2xl bg-mint-soft p-4 font-bold text-mint" role="status">
          <CircleCheck className="h-5 w-5" /> Продуктът е създаден{p.hidden ? "." : " и вече се вижда в сайта."}
        </p>
      ) : null}
      <ProductForm
        key={p.id}
        mode="edit"
        initial={initial}
        meta={{
          id: p.id,
          sku: p.sku,
          slug: p.slug,
          custom: p.custom,
          canRestore: p.canRestore,
          demoPrice: p.demoPrice,
          createdAt: p.createdAt,
          editedAt: p.editedAt,
          sourceCategory: p.sourceCategory,
          familyMode: p.familyMode,
          family: p.family,
          familyCardName: p.familyCardName,
          manufacturerComplete: p.manufacturerComplete,
          manufacturerName: p.manufacturerName,
          pricing: {
            basePrice: p.basePrice,
            price: p.price,
            oldPrice: p.oldPrice,
            lowest30: p.lowest30,
            omnibus: p.omnibus,
            salePrice: p.salePrice,
            saleEndsAt: p.saleEndsAt,
            promotion: p.promotion,
          },
          history: priceHistory(p.sku),
        }}
        brands={brandNames()}
        categories={categoryChoices()}
        goals={goalChoices()}
        diets={dietChoices()}
      />
    </>
  );
}
