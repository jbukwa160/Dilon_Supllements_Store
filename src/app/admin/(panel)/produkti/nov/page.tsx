import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { brandNames, categoryChoices, dietChoices, goalChoices } from "@/lib/admin/products";
import type { ProductPayload } from "@/lib/admin/validate";
import { PageHeader } from "@/components/admin/PageHeader";
import { ProductForm } from "@/components/admin/ProductForm";

export const metadata: Metadata = { title: "Нов продукт" };

const EMPTY: ProductPayload = {
  name: "",
  nameEn: "",
  brand: "",
  category: "",
  ean: "",
  kind: "supplement",
  form: "",
  featured: false,
  hidden: false,
  weightKg: "",
  price: "",
  salePrice: "",
  saleEndsAt: "",
  stock: "0",
  adultOnly: false,
  regNo: "",
  servingSize: "",
  servings: "",
  netQuantity: "",
  ingredients: "",
  allergens: "",
  nutrition: [],
  directions: "",
  warnings: "",
  storage: "",
  description: "",
  descriptionEn: "",
  images: [],
  flavour: "",
  flavourEn: "",
  size: "",
  groupKey: null,
  familyName: "",
  goals: [],
  diets: [],
};

export default async function NewProductPage() {
  await requireAdmin();
  return (
    <>
      <Link href="/admin/produkti" className="mb-3 inline-flex items-center gap-1.5 font-bold text-ink-soft hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Всички продукти
      </Link>
      <PageHeader
        title="Нов продукт"
        description="За продукт, който го няма във файла на доставчика. Попълнете полетата със звездичка (*) и натиснете „Създай продукта“ — кодът (SP-…) се създава автоматично."
      />
      <ProductForm
        mode="create"
        initial={EMPTY}
        meta={{ familyMode: "auto", family: [], manufacturerComplete: false, manufacturerName: null }}
        brands={brandNames()}
        categories={categoryChoices()}
        goals={goalChoices()}
        diets={dietChoices()}
      />
    </>
  );
}
