// Delivery options at a glance (top of /dostavka): one card per option with its price, plus the free-delivery
// threshold. Texts come from the per-language delivery documents; prices from the settings.
import { Building2, Home, PackageOpen, Truck } from "lucide-react";

const ICONS = { office: Building2, locker: PackageOpen, address: Home } as const;

export type DeliveryOption = { kind: keyof typeof ICONS; title: string; text: string; price: string; priceNote?: string };

export function DeliveryOptions({ options, free }: { options: DeliveryOption[]; free?: { title: string; text: string } | null }) {
  return (
    <div className="space-y-3">
      <ul className="grid gap-3 sm:grid-cols-3">
        {options.map((o) => {
          const Icon = ICONS[o.kind];
          return (
            <li key={o.kind} className="card flex flex-col p-5">
              <span className="grid h-11 w-11 place-items-center rounded-md bg-primary-50 text-primary">
                <Icon className="h-6 w-6" aria-hidden />
              </span>
              <p className="mt-3 text-base font-bold leading-snug text-ink">{o.title}</p>
              <p className="mt-1 flex-1 text-sm leading-relaxed text-muted">{o.text}</p>
              <p className="mt-3 text-xl font-extrabold tabular-nums text-ink">
                {o.priceNote ? <span className="mr-1 text-sm font-semibold text-muted">{o.priceNote}</span> : null}
                {o.price}
              </p>
            </li>
          );
        })}
      </ul>
      {free ? (
        <div className="flex items-center gap-4 rounded-lg bg-ink p-5 text-canvas">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-pill bg-accent text-ink">
            <Truck className="h-6 w-6" aria-hidden />
          </span>
          <div>
            <p className="font-bold text-white">{free.title}</p>
            {free.text ? <p className="text-sm text-canvas/80">{free.text}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
