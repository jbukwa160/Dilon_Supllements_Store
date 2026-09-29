// Order status pill for the shop (confirmation page, account order list / detail). Server-safe. Owner: D.
import { getDict } from "@/i18n";
import type { Lang } from "@/i18n/config";
import type { OrderStatus } from "@/lib/checkout";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

const TONE: Record<OrderStatus, BadgeTone> = {
  new: "info",
  confirmed: "info",
  shipped: "bestseller",
  delivered: "success",
  cancelled: "muted",
  returned: "outline",
};

export function OrderStatusBadge({ status, lang, className }: { status: OrderStatus; lang: Lang; className?: string }) {
  const t = getDict(lang).order;
  return (
    <Badge tone={TONE[status]} className={className} title={t.statusLabel}>
      {t.status[status]}
    </Badge>
  );
}
