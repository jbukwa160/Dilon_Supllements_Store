// The EU harmonised notice on the legal guarantee of conformity (ЗИД на ЗЗП, ДВ бр. 87/2026; Implementing Regulation
// (EU) 2025/1960, applies from 27.09.2026): shown prominently and in colour, in the footer of every page and in the
// Terms. Server-safe (no hooks) — takes the language as a prop.
//
// [ЮРИСТ] / owner: this is an accessible text version with the notice's core statements. Replace the badge with the
// official artwork (Annex I of Impl. Reg. (EU) 2025/1960, Bulgarian / English version from EUR-Lex, with its QR code)
// once the files are obtained — keep this text as its accessible alternative.
import Link from "next/link";
import { clsx } from "clsx";
import { ExternalLink } from "lucide-react";
import { getDict } from "@/i18n";
import type { Lang } from "@/i18n/config";
import { localizeHref } from "@/lib/links";

const EU_BLUE = "#003399";
const EU_YELLOW = "#FFCC00";

/** A 5-point star centred at (cx, cy). */
function starPoints(cx: number, cy: number, outer: number, inner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}

// The ring of 12 stars (computed once).
const STARS = Array.from({ length: 12 }, (_, i) => {
  const a = (Math.PI / 6) * i;
  return starPoints(50 + 37 * Math.sin(a), 50 - 37 * Math.cos(a), 4.6, 1.9);
});

function Badge({ years }: { years: string }) {
  return (
    <svg viewBox="0 0 100 100" className="h-16 w-16 shrink-0 md:h-18 md:w-18" aria-hidden focusable="false">
      <circle cx="50" cy="50" r="49" fill={EU_BLUE} />
      {STARS.map((p, i) => (
        <polygon key={i} points={p} fill={EU_YELLOW} />
      ))}
      <text x="50" y="55" textAnchor="middle" fill="#fff" fontSize="34" fontWeight="800" fontFamily="inherit">
        2
      </text>
      <text x="50" y="70" textAnchor="middle" fill="#fff" fontSize="9.5" fontWeight="700" fontFamily="inherit" letterSpacing="0.5">
        {years.toUpperCase()}
      </text>
    </svg>
  );
}

export function GuaranteeNotice({ lang, className, id = "legal-guarantee" }: { lang: Lang; className?: string; id?: string }) {
  const t = getDict(lang).info.guarantee;
  const newTab = getDict(lang).info.newTab;
  return (
    <section
      aria-labelledby={`${id}-title`}
      className={clsx("flex gap-4 rounded-lg border-2 bg-white p-4 text-ink md:gap-5 md:p-5", className)}
      style={{ borderColor: EU_BLUE }}
    >
      <Badge years={t.years} />
      <div className="min-w-0">
        <h2 id={`${id}-title`} className="text-base font-bold leading-snug md:text-[1.05rem]" style={{ color: EU_BLUE }}>
          {t.title}
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">{t.text}</p>
        <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm font-semibold">
          <a href="https://kzp.bg" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2" style={{ color: EU_BLUE }}>
            {t.kzp} (kzp.bg)
            <ExternalLink className="ml-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
            <span className="sr-only">{newTab}</span>
          </a>
          <Link href={localizeHref("/obshti-usloviya#garantsiya", lang)} className="inline-flex min-h-10 items-center underline underline-offset-2" style={{ color: EU_BLUE }}>
            {t.claim}
          </Link>
        </p>
      </div>
    </section>
  );
}
