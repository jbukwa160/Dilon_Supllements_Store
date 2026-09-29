import clsx from "clsx";
import { MapPin, Phone, Truck } from "lucide-react";
import { getDict } from "@/i18n";
import type { Lang } from "@/i18n/config";
import type { SavedAddress } from "@/lib/customer-addresses";

/** One saved address as text (dashboard, address book). Hook-free: usable from server and client components. */
export function AddressSummary({
  address,
  lang,
  className,
  hideLabel = false,
}: {
  address: SavedAddress;
  lang: Lang;
  className?: string;
  hideLabel?: boolean;
}) {
  const d = getDict(lang);
  const method = d.checkout.methods[address.method];
  const where = address.office ? [address.office.name, address.office.address].filter(Boolean).join(", ") : address.address;
  const town = [address.postCode, address.cityName].filter(Boolean).join(" ");
  return (
    <div className={clsx("space-y-1.5 text-[0.95rem]", className)}>
      {hideLabel ? null : <p className="font-bold">{address.label || d.account.addressBook.untitled}</p>}
      <p className="flex items-start gap-2 text-muted">
        <Truck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        {method?.label ?? address.method}
      </p>
      <p className="flex items-start gap-2">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
        <span>
          {town ? <span className="block">{town}</span> : null}
          <span className="block">{where}</span>
        </span>
      </p>
      {address.phone ? (
        <p className="flex items-start gap-2">
          <Phone className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
          {address.phone}
        </p>
      ) : null}
    </div>
  );
}
