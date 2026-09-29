import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { FileSpreadsheet, Gift, Percent, Truck } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getGiftTiers, getSettings } from "@/lib/settings";
import { ensurePricesFresh } from "@/lib/pricing-rules";
import { listPromotions, promotionScopeOptions } from "@/lib/admin/promotions";
import { giftProductsBySku } from "@/lib/admin/gift-tiers";
import { formatAmount } from "@/components/layout/format-amount";
import { PageHeader } from "@/components/admin/PageHeader";
import { PromotionsEditor } from "@/components/admin/PromotionsEditor";
import { GiftTiersEditor } from "@/components/admin/GiftTiersEditor";
import { FreeShippingCard } from "@/components/admin/FreeShippingCard";
import { PriceTools } from "@/components/admin/PriceTools";

export const metadata: Metadata = { title: "Цени и промоции" };

const TABS = [
  { key: "promotsii", label: "Промоции", icon: Percent },
  { key: "podaratsi", label: "Подаръци над сума", icon: Gift },
  { key: "dostavka", label: "Безплатна доставка", icon: Truck },
  { key: "excel", label: "Цени от Excel", icon: FileSpreadsheet },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function PricesAdminPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  await requireAdmin();
  const raw = (await searchParams).tab;
  const tab: TabKey = TABS.find((t) => t.key === raw)?.key ?? "promotsii";
  // A scheduled promotion may have just started or ended: statuses and counts below must be current.
  ensurePricesFresh();

  const settings = getSettings();
  const tiers = getGiftTiers();
  const promotions = tab === "promotsii" ? listPromotions() : [];
  const running = tab === "promotsii" ? promotions.filter((p) => p.status === "active").length : null;
  const badge: Partial<Record<TabKey, string>> = {
    ...(running ? { promotsii: String(running) } : {}),
    ...(tiers.enabled && tiers.tiers.some((t) => t.enabled) ? { podaratsi: tiers.tiers.filter((t) => t.enabled).map((t) => formatAmount(t.threshold, "bg")).join(" / ") } : {}),
    ...(settings.shipping.freeOver !== null
      ? { dostavka: settings.shipping.freeOver <= 0 ? "винаги" : `над ${formatAmount(settings.shipping.freeOver, "bg")}` }
      : {}),
  };

  let body: React.ReactNode;
  if (tab === "promotsii") {
    body = <PromotionsEditor promotions={promotions} options={promotionScopeOptions()} />;
  } else if (tab === "podaratsi") {
    body = <GiftTiersEditor initial={tiers} products={giftProductsBySku(tiers.tiers.flatMap((t) => t.skus))} freeOver={settings.shipping.freeOver} freeScope={settings.shipping.freeScope} />;
  } else if (tab === "dostavka") {
    body = <FreeShippingCard initial={settings.shipping} />;
  } else {
    const { categories, brands } = promotionScopeOptions();
    body = <PriceTools categories={categories} brands={brands} />;
  }

  return (
    <>
      <PageHeader
        title="Цени и промоции"
        description="Промоции с процент, подаръци над сума, безплатна доставка и смяна на много цени наведнъж. Цената на отделен продукт се сменя от „Продукти“."
      />
      <nav className="mb-6 flex flex-wrap gap-2" aria-label="Раздели на „Цени и промоции“">
        {TABS.map(({ key, label, icon: Icon }) => (
          <Link
            key={key}
            href={`/admin/tseni?tab=${key}`}
            aria-current={tab === key ? "page" : undefined}
            className={clsx("chip h-11 !px-4 text-[0.95rem]", tab === key && "!border-ink !bg-ink !text-white")}
          >
            <Icon className="h-4 w-4" /> {label}
            {badge[key] ? <span className="opacity-70">· {badge[key]}</span> : null}
          </Link>
        ))}
      </nav>
      {body}
    </>
  );
}
