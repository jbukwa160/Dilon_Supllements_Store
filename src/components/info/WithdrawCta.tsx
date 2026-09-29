// Call-to-action to the withdrawal function („Откажете се от договора тук“), used on the returns page.
import Link from "next/link";
import { ArrowRight, FileX2 } from "lucide-react";
import { getDict } from "@/i18n";
import type { Lang } from "@/i18n/config";
import { localizeHref } from "@/lib/links";

export function WithdrawCta({ lang }: { lang: Lang }) {
  const t = getDict(lang).info;
  return (
    <div className="on-dark flex flex-col gap-4 rounded-lg bg-ink p-5 text-canvas sm:flex-row sm:items-center sm:justify-between md:p-6">
      <div className="flex gap-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-pill bg-accent text-ink">
          <FileX2 className="h-6 w-6" aria-hidden />
        </span>
        <div>
          <p className="text-lg font-bold text-white">{t.returnsCta.title}</p>
          <p className="mt-0.5 text-sm leading-relaxed text-canvas/80">{t.returnsCta.text}</p>
        </div>
      </div>
      <Link href={localizeHref("/otkaz-ot-dogovor", lang)} className="btn btn-energy shrink-0">
        {t.titles.withdraw}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}
