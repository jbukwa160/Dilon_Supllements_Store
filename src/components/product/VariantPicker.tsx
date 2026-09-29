// Flavour and size selectors of a product family. Every variant has its own page (/produkt/<variant slug>), so each
// option is a link to the variant it selects — navigation replaces the history entry and keeps the scroll position,
// which makes switching feel in-place while every combination stays linkable and crawlable. No hooks.
//
// Choosing a flavour keeps the current size when that combination exists (otherwise the first in-stock size of that
// flavour); choosing a size keeps the flavour the same way. Out-of-stock options are struck through; options that
// only exist in another combination get a dashed border.
import Link from "next/link";
import clsx from "clsx";
import { fmt, getDict } from "@/i18n";
import type { Lang } from "@/i18n/config";
import type { ProductVariant } from "@/lib/catalog-types";
import { formatPrice } from "@/lib/format";
import { localizeHref } from "@/lib/links";

type Option = { key: string; label: string; target: ProductVariant; exact: boolean; selected: boolean; note?: string };

/** How many flavour chips show before "+ Още N вкуса". */
const FLAVOUR_LIMIT = 12;

const unique = (xs: string[]) => [...new Set(xs)];

/** Ordering key of a size label: "2,27 кг" → 2270, "908 г" → 908, "12 x 48 г" → 576, "90 капсули" → 90; unknown last. */
function sizeAmount(label: string): number {
  const m = label.match(/^(?:(\d+)\s*[xх×]\s*)?(\d+(?:[.,]\d+)?)\s*(\S*)/iu);
  if (!m) return Number.MAX_SAFE_INTEGER;
  const n = Number(m[2].replace(",", ".")) * (m[1] ? Number(m[1]) : 1);
  return /^(кг|kg|л|l)$/iu.test(m[3]) ? n * 1000 : n;
}

function pick(variants: ProductVariant[], match: (v: ProductVariant) => boolean, prefer: (v: ProductVariant) => boolean): { target: ProductVariant; exact: boolean } {
  const pool = variants.filter(match);
  const exact = pool.find(prefer);
  if (exact) return { target: exact, exact: true };
  return { target: pool.find((v) => v.stock > 0) ?? pool[0], exact: false };
}

export function VariantPicker({ variants, currentId, lang }: { variants: ProductVariant[]; currentId: number; lang: Lang }) {
  if (variants.length < 2) return null;
  const t = getDict(lang).product.variants;
  const current = variants.find((v) => v.id === currentId) ?? variants[0];
  const fk = (v: ProductVariant) => v.flavour ?? "";
  const sk = (v: ProductVariant) => v.size ?? "";

  const flavourKeys = unique(variants.map(fk));
  const sizeKeys = unique(variants.map(sk)).sort((a, b) => (a ? sizeAmount(a) : Number.MAX_SAFE_INTEGER) - (b ? sizeAmount(b) : Number.MAX_SAFE_INTEGER));
  const showFlavours = flavourKeys.length > 1;
  const showSizes = sizeKeys.length > 1;

  const flavours: Option[] = showFlavours
    ? flavourKeys.map((f) => {
        const { target, exact } = pick(variants, (v) => fk(v) === f, (v) => sk(v) === sk(current));
        return { key: `f:${f}`, label: f || t.noFlavour, target, exact, selected: f === fk(current) };
      })
    : [];
  const sizes: Option[] = showSizes
    ? sizeKeys.map((s) => {
        const { target, exact } = pick(variants, (v) => sk(v) === s, (v) => fk(v) === fk(current));
        return { key: `s:${s}`, label: s || t.noSize, target, exact, selected: s === sk(current), note: formatPrice(target.price, lang) };
      })
    : [];
  // Variants that differ in neither flavour nor size (e.g. two pack types): one plain list by label.
  const generic: Option[] =
    !showFlavours && !showSizes
      ? variants.map((v) => ({ key: `v:${v.id}`, label: v.label, target: v, exact: true, selected: v.id === current.id, note: formatPrice(v.price, lang) }))
      : [];

  const chip = (o: Option) => {
    const oos = o.target.stock <= 0;
    const status = o.selected ? undefined : oos ? t.unavailable : !o.exact ? t.otherCombo : undefined;
    const body = (
      <>
        <span className={clsx(oos && !o.selected && "line-through decoration-1")}>{o.label}</span>
        {o.note ? <span className={clsx("text-xs font-medium tabular-nums", o.selected ? "text-white/85" : "text-muted")}>{o.note}</span> : null}
        {status ? <span className="sr-only">({status})</span> : null}
      </>
    );
    const cls = clsx(
      "inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] border-[1.5px] px-3.5 py-1.5 text-[0.9rem] font-bold leading-tight transition",
      o.selected
        ? "border-ink bg-ink text-white"
        : clsx("bg-surface hover:border-ink", oos ? "text-muted" : "text-ink", o.exact ? "border-[#cfcfcf]" : "border-dashed border-ink/35"),
    );
    return (
      <li key={o.key}>
        {o.selected ? (
          <span aria-current="true" className={cls}>
            {body}
          </span>
        ) : (
          <Link href={localizeHref(`/produkt/${o.target.slug}`, lang)} replace scroll={false} prefetch={false} title={status} className={cls}>
            {body}
          </Link>
        )}
      </li>
    );
  };

  const group = (title: string, selected: string | undefined, options: Option[], limit = Infinity) => {
    if (!options.length) return null;
    let first = options.slice(0, limit);
    let rest = options.slice(limit);
    const sel = rest.find((o) => o.selected);
    if (sel) {
      first = [...first.slice(0, -1), sel];
      rest = [...options.slice(limit - 1, limit), ...rest.filter((o) => o !== sel)];
    }
    return (
      <fieldset className="min-w-0">
        <legend className="mb-2 text-[0.95rem]">
          <span className="font-semibold text-muted">{title}:</span> <span className="font-bold">{selected}</span>
        </legend>
        <ul className="flex flex-wrap gap-2">{first.map(chip)}</ul>
        {rest.length ? (
          <details className="group/more mt-2">
            <summary className="inline-flex min-h-10 cursor-pointer list-none items-center rounded-[var(--radius-md)] px-2 text-sm font-bold text-primary hover:underline [&::-webkit-details-marker]:hidden">
              <span className="group-open/more:hidden">{fmt(getDict(lang).listing.filters.moreFlavours, { n: rest.length })}</span>
              <span className="hidden group-open/more:inline">{getDict(lang).listing.filters.less}</span>
            </summary>
            <ul className="mt-2 flex flex-wrap gap-2">{rest.map(chip)}</ul>
          </details>
        ) : null}
      </fieldset>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {group(t.flavour, flavours.find((o) => o.selected)?.label, flavours, FLAVOUR_LIMIT)}
      {group(t.size, sizes.find((o) => o.selected)?.label, sizes)}
      {group(t.variant, generic.find((o) => o.selected)?.label, generic)}
    </div>
  );
}
