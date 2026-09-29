import Link from "next/link";
import { Gift, Phone, RotateCcw, Truck } from "lucide-react";
import { fmt, getDict } from "@/i18n";
import type { Lang } from "@/i18n/config";
import { freeShippingParts } from "@/lib/free-shipping";
import { localizeHref } from "@/lib/links";
import type { StoreSettings } from "@/lib/settings-types";
import { formatAmount } from "./format-amount";
import { LangSwitch } from "./LangSwitch";
import { rich } from "./rich";
import { UspRotator } from "./UspRotator";

/**
 * The orange strip above the header: the shop's promises (gift threshold, free delivery, returns — all from the admin's
 * settings) and, from `md`, the language switch; from `lg` the help links and the phone. Below `lg` the promises
 * rotate one at a time.
 */
export function TopBar({ lang, settings: s, giftFrom }: { lang: Lang; settings: StoreSettings; giftFrom: number | null }) {
  const dict = getDict(lang);
  const href = (path: string) => localizeHref(path, lang);
  const strong = (v: string) => <strong className="font-extrabold text-white">{v}</strong>;
  const item = "flex min-w-0 items-center gap-1.5 whitespace-nowrap";
  // Links fill the bar's height (36 px) so they are comfortable tap / click targets, not just the 20 px line of text.
  const tap = "h-9";
  const icon = "h-4 w-4 shrink-0 text-white";

  const messages: { key: string; node: React.ReactNode; wide?: boolean }[] = [];
  if (giftFrom !== null) {
    messages.push({
      key: "gift",
      node: (
        <span className={item}>
          <Gift className={icon} aria-hidden />
          <span className="truncate">{rich(dict.header.giftOver, { amount: strong(formatAmount(giftFrom, lang)) })}</span>
        </span>
      ),
    });
  }
  const freeShipping = freeShippingParts(s.shipping, lang);
  if (freeShipping !== null) {
    messages.push({
      key: "shipping",
      node: (
        <Link href={href("/dostavka")} className={`${item} ${tap} hover:underline`}>
          <Truck className={icon} aria-hidden />
          <span className="truncate">{rich(freeShipping.template, { amount: strong(freeShipping.amount) })}</span>
        </Link>
      ),
    });
  }
  messages.push({
    key: "returns",
    wide: true,
    node: (
      <Link href={href("/vrashtane")} className={`${item} ${tap} hover:underline`}>
        <RotateCcw className={icon} aria-hidden />
        <span className="truncate">{fmt(dict.header.returnDays, { n: s.returnDays })}</span>
      </Link>
    ),
  });

  const phoneHref = `tel:${s.phone.replace(/[^\d+]/g, "")}`;
  return (
    <div className="on-dark bg-primary text-[0.8rem] font-semibold text-white">
      <div className="container-shop flex h-9 items-center gap-4">
        <ul className="hidden min-w-0 items-center gap-6 lg:flex" aria-label={dict.header.uspLabel}>
          {messages.map((m) => (
            <li key={m.key} className={m.wide && messages.length > 2 ? "hidden xl:block" : undefined}>
              {m.node}
            </li>
          ))}
        </ul>
        <UspRotator className="min-w-0 flex-1 md:justify-items-start lg:hidden">
          {messages.map((m) => (
            <div key={m.key} className="min-w-0 max-w-full">
              {m.node}
            </div>
          ))}
        </UspRotator>
        <div className="ml-auto hidden shrink-0 items-center gap-5 md:flex">
          <Link href={href("/dostavka")} className="hidden h-9 items-center hover:underline lg:inline-flex">
            {dict.header.deliveryAndPayment}
          </Link>
          <Link href={href("/kontakti")} className="hidden h-9 items-center hover:underline lg:inline-flex">
            {dict.header.contacts}
          </Link>
          {s.phone ? (
            <a href={phoneHref} className="hidden h-9 items-center gap-1.5 font-semibold text-white hover:underline xl:flex" aria-label={fmt(dict.header.callUs, { phone: s.phone })}>
              <Phone className="h-4 w-4 text-white" aria-hidden /> {s.phone}
            </a>
          ) : null}
          <LangSwitch tone="dark" />
        </div>
      </div>
    </div>
  );
}
