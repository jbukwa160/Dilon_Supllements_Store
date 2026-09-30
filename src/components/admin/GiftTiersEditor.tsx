"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import { ArrowDown, ArrowUp, Check, ChevronDown, CircleAlert, EyeOff, Gift, ImageOff, Info, Lock, Plus, Sparkles, Trash2, TriangleAlert, Truck, X } from "lucide-react";
import { giftProductAction, saveGiftTiersAction } from "@/app/admin/_actions/gift-tiers";
import type { GiftProduct } from "@/lib/admin/gift-tiers";
import type { GiftTier, GiftTierSettings } from "@/lib/settings-types";
import type { Lang } from "@/i18n/config";
import { fmt, getDict } from "@/i18n";
import { formatAmount, formatPrice } from "@/lib/format";
import { loc } from "@/lib/l10n";
import { Card, Field, L10nInput, MoneyInput, SaveBar, Toggle, useUnsavedWarning, type SaveStatus } from "./ui";
import { ProductSearch } from "./ProductSearch";
import { milestones, milestoneTexts } from "@/components/cart/milestones";

const MAX_TIERS = 6;
const MAX_GIFTS = 24;

type TierDraft = Omit<GiftTier, "threshold"> & { threshold: string };
type FreeScope = "all" | "office";
type Draft = Omit<GiftTierSettings, "tiers" | "startsAt" | "endsAt"> & { tiers: TierDraft[]; startsAt: string; endsAt: string };

const txt = (n: number) => String(n).replace(".", ",");
const num = (s: string) => {
  const t = s.replace(/[\s€]/g, "").replace(",", ".");
  return t ? Number(t) : NaN;
};
const money = (n: number) => formatPrice(n, "bg");
const newId = () => `t${Math.random().toString(36).slice(2, 9)}`;

function toDraft(s: GiftTierSettings): Draft {
  return { ...s, startsAt: s.startsAt ?? "", endsAt: s.endsAt ?? "", tiers: s.tiers.map((t) => ({ ...t, threshold: txt(t.threshold) })) };
}

function fromDraft(d: Draft): GiftTierSettings {
  return {
    ...d,
    startsAt: d.startsAt || null,
    endsAt: d.endsAt || null,
    tiers: d.tiers.map((t) => ({ ...t, threshold: num(t.threshold) })),
  };
}

function newTier(threshold: number): TierDraft {
  return {
    id: newId(),
    enabled: true,
    threshold: txt(threshold),
    title: { bg: "Подарък над {amount}", en: "Free gift over {amount}" },
    note: { bg: "", en: "" },
    skus: [],
  };
}

function move<T>(list: T[], i: number, d: number): T[] {
  const next = [...list];
  const [x] = next.splice(i, 1);
  next.splice(i + d, 0, x);
  return next;
}

type Problems = { errors: Record<string, string>; warnings: Record<string, string>; info: Record<string, string>; general: string | null };

/** Live checks (the server repeats the blocking ones). */
function check(d: Draft, products: Record<string, GiftProduct>, freeOver: number | null): Problems {
  const p: Problems = { errors: {}, warnings: {}, info: {}, general: null };
  const seen = new Map<number, number>();
  d.tiers.forEach((t, i) => {
    const n = num(t.threshold);
    const giftList = t.skus.map((s) => products[s]).filter((g): g is GiftProduct => !!g);
    const adult = giftList.find((g) => g.adultOnly);
    if (adult) p.errors[t.id] = `„${adult.name}“ е за пълнолетни (18+) и не може да е подарък — премахнете го.`;
    if (!Number.isFinite(n) || n <= 0) p.errors[t.id] = "Въведете сума, по-голяма от 0 (напр. 40).";
    else if (seen.has(n)) p.errors[t.id] = `Същата сума като ниво ${seen.get(n)! + 1} — сумите трябва да са различни.`;
    else {
      seen.set(n, i);
      if (d.enabled && t.enabled && !t.skus.length && !adult) p.errors[t.id] = "Нивото е включено, но няма подаръци. Добавете поне един продукт или изключете нивото.";
    }
    const gifts = giftList;
    if (gifts.length && gifts.every((g) => g.stock <= 0)) p.warnings[t.id] = "Всички подаръци в това ниво са изчерпани — клиентите няма да могат да изберат нищо.";
    else if (gifts.some((g) => g.stock <= 0)) p.warnings[t.id] = "Някои подаръци са изчерпани — те се показват като „Изчерпан“ и не могат да се изберат.";
    else if (gifts.some((g) => !g.image)) p.warnings[t.id] = "Някои подаръци нямат снимка — в количката се показват с картинка-заместител (не се скриват).";
    if (freeOver != null && Number.isFinite(n) && Math.abs(n - freeOver) < 0.005) p.info[t.id] = "Същата сума като безплатната доставка — клиентът отключва двете наведнъж.";
  });
  if (d.startsAt && d.endsAt && d.endsAt < d.startsAt) p.general = "Крайната дата на кампанията е преди началната.";
  return p;
}

// ---------------------------------------------------------------------------
// The storefront's milestone bar (components/cart/GiftTierBar: same milestones(), texts and look) and top strip,
// drawn from the unsaved draft inside .shop-theme, with a cart value the admin can slide.

function MilestonePreview({ draft, freeOver, freeScope, lang }: { draft: Draft; freeOver: number | null; freeScope: FreeScope; lang: Lang }) {
  const tiers = draft.enabled
    ? draft.tiers
        .map((t) => ({ ...t, at: num(t.threshold) }))
        .filter((t) => t.enabled && Number.isFinite(t.at) && t.at > 0)
        .sort((a, b) => a.at - b.at)
    : [];
  const top = Math.max(freeOver ?? 0, ...tiers.map((t) => t.at), 10);
  const sliderMax = Math.ceil((top * 1.25) / 5) * 5;
  const [value, setValue] = useState(() => Math.round(top * 0.55));
  const cart = Math.min(value, sliderMax);
  const d = getDict(lang);
  const t = d.giftTiers;
  const m = milestones(
    cart,
    tiers.map((x) => ({ id: x.id, threshold: x.at })),
    freeOver,
  );
  const hasGifts = tiers.length > 0;
  const title = (x: (typeof tiers)[number]) => fmt(loc(x.title, lang), { amount: formatAmount(x.at, lang) });
  const texts = milestoneTexts(m, t, { hasGifts, officeOnly: freeOver !== null && freeScope === "office" });
  const message = m.next ? fmt(texts.headline, { amount: formatPrice(m.missing, lang) }) : texts.headline;
  // One marker per amount (a tier and free delivery may share a threshold).
  const points = [...new Set(m.markers.map((x) => Math.round(x.at * 100)))].map((c) => {
    const group = m.markers.filter((x) => Math.round(x.at * 100) === c);
    return { key: c, left: group[0].left, at: group[0].at, reached: group[0].reached, gift: group.some((x) => x.kind === "gift"), shipping: group.some((x) => x.kind === "shipping") };
  });

  return (
    <div>
      <label className="block">
        <span className="mb-1.5 flex items-center justify-between text-sm font-extrabold">
          <span>Стойност на количката</span>
          <span className="rounded-full bg-ink px-3 py-0.5 text-white">{money(cart)}</span>
        </span>
        <input type="range" min={0} max={sliderMax} step={1} value={cart} onChange={(e) => setValue(Number(e.target.value))} className="w-full accent-brand" />
      </label>

      <div className="shop-theme pointer-events-none mt-4 rounded-lg border border-line bg-white p-4">
        {m.list.length ? (
          <>
            {hasGifts ? <p className="mb-1 text-xs font-bold uppercase tracking-[0.08em] text-muted">{loc(draft.headline, lang)}</p> : null}
            <p className={clsx("text-sm leading-snug", m.next ? "text-ink-soft" : "font-bold text-success")}>{message}</p>
            <div className="relative mx-4 mt-4">
              <div className="h-2 overflow-hidden rounded-pill bg-line">
                <div className="h-full rounded-pill bg-accent transition-[width]" style={{ width: `${m.pct}%` }} />
              </div>
              {points.map((x) => {
                const Icon = x.gift ? Gift : Truck;
                return (
                  <span
                    key={x.key}
                    className={clsx(
                      "absolute top-1/2 grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2",
                      x.reached ? "border-primary bg-primary text-white" : "border-line bg-surface text-muted",
                    )}
                    style={{ left: `${x.left}%` }}
                  >
                    <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
                    {x.gift && x.shipping ? <Truck className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 rounded-full bg-surface p-px text-primary" strokeWidth={2.5} /> : null}
                  </span>
                );
              })}
            </div>
            <div className="relative mx-4 mt-3 h-4 text-[0.7rem] font-semibold tabular-nums text-muted">
              {points.map((x) => (
                <span key={x.key} className={clsx("absolute -translate-x-1/2 whitespace-nowrap", x.reached && "text-primary-700")} style={{ left: `${x.left}%` }}>
                  {formatAmount(x.at, lang)}
                </span>
              ))}
            </div>
            {hasGifts ? (
              <ul className="mt-3 space-y-1.5 border-t border-line pt-3 text-sm">
                {tiers.map((x) => {
                  const reached = cart >= x.at;
                  return (
                    <li key={x.id} className={clsx("flex items-start gap-2", !reached && "text-muted")}>
                      {reached ? <Gift className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <Lock className="mt-0.5 h-4 w-4 shrink-0" />}
                      <span className="min-w-0 flex-1">
                        <span className="font-semibold">{title(x)}</span>
                        {loc(x.note, lang) ? <span className="block text-xs text-muted">{loc(x.note, lang)}</span> : null}
                      </span>
                      <span className="whitespace-nowrap text-xs font-semibold">{reached ? t.choose : fmt(t.locked, { amount: formatAmount(x.at, lang) })}</span>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted">Няма нищо за показване — подаръците са изключени и няма безплатна доставка.</p>
        )}
      </div>
      {hasGifts && draft.showBar ? (
        <>
          <p className="mb-1.5 mt-4 text-sm font-extrabold text-muted">В горната лента на сайта</p>
          {/* .shop-theme sets the text colour itself, so the strip's colours go on an inner element */}
          <div className="shop-theme pointer-events-none">
            <div className="flex items-center gap-1.5 rounded-md bg-ink px-3 py-2 text-[0.8rem] font-medium text-canvas/85">
              <Gift className="h-4 w-4 shrink-0 text-accent" />
              <span className="min-w-0">
                {d.header.giftOver.split("{amount}")[0]}
                <strong className="font-bold text-white">{formatAmount(tiers[0].at, lang)}</strong>
                {d.header.giftOver.split("{amount}")[1] ?? ""}
              </span>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function GiftRow({
  sku,
  product,
  index,
  count,
  onMove,
  onRemove,
}: {
  sku: string;
  product: GiftProduct | undefined;
  index: number;
  count: number;
  onMove: (d: number) => void;
  onRemove: () => void;
}) {
  const btn = "grid h-9 w-9 shrink-0 place-items-center rounded-lg hover:bg-canvas disabled:opacity-30";
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={product?.image ?? "/placeholder.svg"} alt="" referrerPolicy="no-referrer" className="h-12 w-12 shrink-0 rounded-lg border border-line object-contain" />
      <span className="min-w-[10rem] flex-1">
        <span className="line-clamp-1 font-bold">{product?.name ?? "Продуктът вече не съществува"}</span>
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          {product?.variant ? <span>{product.variant} ·</span> : null}
          <span>{sku}</span>
          {product ? <span className="rounded-full bg-canvas px-2 py-0.5 font-bold text-ink">стойност {money(product.price)}</span> : null}
          {product ? (
            <span className={clsx("rounded-full px-2 py-0.5 font-bold", product.stock > 0 ? "bg-mint-soft text-mint" : "bg-brand-soft text-brand-dark")}>{product.stock} бр.</span>
          ) : null}
          {product?.adultOnly ? <span className="rounded-full bg-brand px-2 py-0.5 font-bold text-white">18+ — премахнете</span> : null}
          {product && !product.image ? (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-sun-soft px-2 py-0.5 font-bold text-ink"
              title="Продуктът няма снимка — в количката подаръкът се показва с картинка-заместител. Добавете снимка в Продукти, ако е възможно."
            >
              <ImageOff className="h-3 w-3" /> без снимка
            </span>
          ) : null}
          {product?.hidden ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-ink px-2 py-0.5 font-bold text-white" title="Не се продава в сайта — само като подарък">
              <EyeOff className="h-3 w-3" /> скрит
            </span>
          ) : null}
        </span>
      </span>
      <span className="ml-auto flex">
        <button type="button" className={btn} disabled={index === 0} onClick={() => onMove(-1)} aria-label="Премести нагоре">
          <ArrowUp className="h-4 w-4" />
        </button>
        <button type="button" className={btn} disabled={index === count - 1} onClick={() => onMove(1)} aria-label="Премести надолу">
          <ArrowDown className="h-4 w-4" />
        </button>
        <button type="button" className={clsx(btn, "text-brand hover:!bg-brand-soft")} onClick={onRemove} aria-label={`Премахни ${product?.name ?? sku}`}>
          <X className="h-4 w-4" />
        </button>
      </span>
    </li>
  );
}

function TierEditor({
  tier,
  index,
  open,
  onToggleOpen,
  onChange,
  onRemove,
  products,
  onAddProduct,
  problems,
  masterOn,
}: {
  tier: TierDraft;
  index: number;
  open: boolean;
  onToggleOpen: () => void;
  onChange: (t: TierDraft) => void;
  onRemove: () => void;
  products: Record<string, GiftProduct>;
  onAddProduct: (sku: string) => Promise<string | null>;
  problems: Problems;
  masterOn: boolean;
}) {
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, start] = useTransition();
  const set = <K extends keyof TierDraft>(k: K, v: TierDraft[K]) => onChange({ ...tier, [k]: v });
  const n = num(tier.threshold);
  const amount = Number.isFinite(n) && n > 0 ? formatAmount(n, "bg") : "…";
  const error = problems.errors[tier.id];
  return (
    <div className={clsx("rounded-2xl border-2", error ? "border-brand" : open ? "border-ink" : "border-line")}>
      <div className="flex flex-wrap items-center gap-3 p-3">
        <button type="button" onClick={onToggleOpen} className="flex min-w-[13rem] flex-1 items-center gap-3 text-left" aria-expanded={open}>
          <span className={clsx("grid h-12 w-12 shrink-0 place-items-center rounded-xl", tier.enabled ? "bg-mint-soft text-mint" : "bg-line text-muted")}>
            <Gift className="h-6 w-6" />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-black">
              Ниво {index + 1}: над {amount}
            </span>
            <span className="block truncate text-sm text-muted">
              {fmt(tier.title.bg, { amount })} · {tier.skus.length} {tier.skus.length === 1 ? "подарък" : "подаръка"}
              {tier.enabled ? "" : " · изключено"}
            </span>
          </span>
          <ChevronDown className={clsx("ml-auto h-5 w-5 shrink-0 text-muted transition", open && "rotate-180")} />
        </button>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => set("enabled", !tier.enabled)} className={clsx("btn h-9 px-3 text-sm", tier.enabled ? "bg-mint-soft text-mint" : "bg-line text-muted")}>
            {tier.enabled ? <Check className="h-4 w-4" strokeWidth={3} /> : <EyeOff className="h-4 w-4" />} {tier.enabled ? "Включено" : "Изключено"}
          </button>
          <button
            type="button"
            onClick={() => confirm(`Да изтрия ли нивото над ${amount}?`) && onRemove()}
            className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-white text-brand hover:border-brand"
            aria-label={`Изтрий нивото над ${amount}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      {error ? (
        <p className="mx-3 mb-3 flex items-center gap-2 rounded-xl bg-brand-soft px-3 py-2 text-sm font-bold text-brand-dark">
          <CircleAlert className="h-4 w-4 shrink-0" /> {error}
        </p>
      ) : null}
      {open ? (
        <div className="space-y-5 border-t border-line p-4 md:p-5">
          <div className="grid gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
            <Field label="Поръчка над" hint="Сумата на продуктите в количката (с намаленията, без доставката).">
              <MoneyInput value={tier.threshold} onChange={(v) => set("threshold", v)} invalid={!!error && !(n > 0)} placeholder="40" />
            </Field>
            <Field group label="Заглавие" hint="{amount} се заменя със сумата, напр. „Подарък над 40 €“.">
              <L10nInput value={tier.title} onChange={(v) => set("title", v)} label="Заглавие" maxLength={80} />
            </Field>
          </div>
          <Field group label="Кратка бележка (по желание)" hint="Показва се под заглавието, напр. „Мостри на протеин по избор“ или „Шейкър 600 мл“.">
            <L10nInput value={tier.note} onChange={(v) => set("note", v)} label="Бележка" maxLength={160} />
          </Field>

          <div>
            <div className="mb-1.5 text-sm font-extrabold">Подаръци — клиентът избира един от тях</div>
            {tier.skus.length < MAX_GIFTS ? (
              <ProductSearch
                includeHidden
                placeholder="Търсете продукт за подарък — име, код или баркод (намира и скритите)"
                isAdded={(sku) => tier.skus.includes(sku)}
                onAdd={(p) => {
                  setAddError(null);
                  start(async () => setAddError(await onAddProduct(p.sku)));
                }}
              />
            ) : (
              <p className="text-sm font-bold text-muted">Достигнат е максимумът от {MAX_GIFTS} подаръка в едно ниво.</p>
            )}
            {adding ? <p className="mt-2 text-sm text-muted">Добавяне…</p> : null}
            {addError ? (
              <p className="mt-2 flex items-center gap-2 text-sm font-bold text-brand" role="alert">
                <CircleAlert className="h-4 w-4 shrink-0" /> {addError}
              </p>
            ) : null}
            {tier.skus.length ? (
              <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-white">
                {tier.skus.map((sku, i) => (
                  <GiftRow
                    key={sku}
                    sku={sku}
                    product={products[sku]}
                    index={i}
                    count={tier.skus.length}
                    onMove={(dir) => set("skus", move(tier.skus, i, dir))}
                    onRemove={() => set("skus", tier.skus.filter((s) => s !== sku))}
                  />
                ))}
              </ul>
            ) : (
              <p className="mt-3 rounded-2xl border border-dashed border-line p-4 text-center text-sm font-bold text-ink-soft">
                Още няма подаръци. Потърсете продукт по-горе — напр. протеинов бар, шейкър или мостра.
                {masterOn && tier.enabled ? " Без подаръци нивото не може да се запази като включено." : ""}
              </p>
            )}
          </div>
          {problems.warnings[tier.id] ? (
            <p className="flex items-center gap-2 rounded-xl bg-sun-soft px-3 py-2 text-sm font-bold">
              <TriangleAlert className="h-4 w-4 shrink-0" /> {problems.warnings[tier.id]}
            </p>
          ) : null}
          {problems.info[tier.id] ? (
            <p className="flex items-center gap-2 rounded-xl bg-sky-soft px-3 py-2 text-sm font-bold text-ink">
              <Info className="h-4 w-4 shrink-0 text-sky" /> {problems.info[tier.id]}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function GiftTiersEditor({
  initial,
  products: initialProducts,
  freeOver,
  freeScope = "all",
}: {
  initial: GiftTierSettings;
  products: GiftProduct[];
  freeOver: number | null;
  /** Free delivery for all methods or offices / lockers only (the preview says "до офис" then). */
  freeScope?: FreeScope;
}) {
  const [value, setValue] = useState(() => toDraft(initial));
  const [saved, setSaved] = useState(value);
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const [pending, start] = useTransition();
  const [products, setProducts] = useState<Record<string, GiftProduct>>(() => Object.fromEntries(initialProducts.map((p) => [p.sku, p])));
  const [open, setOpen] = useState<string[]>(() => value.tiers.map((t) => t.id));
  const [lang, setLang] = useState<Lang>("bg");
  const dirty = JSON.stringify(value) !== JSON.stringify(saved);
  useUnsavedWarning(dirty);

  const update = (fn: (d: Draft) => Draft) => {
    setStatus({ kind: "idle" });
    setValue(fn);
  };
  const setTiers = (fn: (t: TierDraft[]) => TierDraft[]) => update((d) => ({ ...d, tiers: fn(d.tiers) }));
  const problems = check(value, products, freeOver);
  const blocking = Object.values(problems.errors)[0] ?? problems.general;

  const save = () =>
    start(async () => {
      if (blocking) return setStatus({ kind: "error", message: blocking });
      const r = await saveGiftTiersAction(fromDraft(value));
      if (!r.ok || !r.value) return setStatus({ kind: "error", message: r.error ?? "Възникна грешка." });
      // The server sorts the tiers by amount and drops products that no longer exist: show exactly what was stored.
      const next = toDraft(r.value);
      setValue(next);
      setSaved(next);
      setStatus({ kind: "saved" });
    });

  const addProduct = async (tierId: string, sku: string): Promise<string | null> => {
    const r = await giftProductAction(sku);
    if (!r.product) return r.error ?? "Продуктът не може да се добави.";
    const p = r.product;
    setProducts((m) => ({ ...m, [p.sku]: p }));
    setTiers((tiers) => tiers.map((t) => (t.id === tierId && !t.skus.includes(p.sku) ? { ...t, skus: [...t.skus, p.sku].slice(0, MAX_GIFTS) } : t)));
    return null;
  };

  const addTier = () => {
    const last = Math.max(0, ...value.tiers.map((t) => num(t.threshold)).filter(Number.isFinite));
    const t = newTier(last ? last + 20 : 40);
    setTiers((tiers) => [...tiers, t]);
    setOpen((o) => [...o, t.id]);
  };
  const quick = () => {
    const have = new Set(value.tiers.map((t) => num(t.threshold)));
    const add = [40, 60, 80].filter((n) => !have.has(n)).map(newTier);
    if (!add.length) return;
    setTiers((tiers) => [...tiers, ...add].slice(0, MAX_TIERS).sort((a, b) => num(a.threshold) - num(b.threshold)));
    setOpen((o) => [...o, ...add.map((t) => t.id)]);
  };

  return (
    <div className="space-y-6">
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <Card
            title={
              <span className="flex items-center gap-2">
                <Gift className="h-5 w-5 text-brand" /> Подаръци над сума
              </span>
            }
            description="Клиентът избира безплатен подарък в количката, когато поръчката му стигне сумата (напр. 40, 60 и 80 €) — като в xxlnutrition.com."
          >
            <div className="space-y-5">
              {initial.automatic ? (
                <p className="flex items-start gap-2 rounded-2xl bg-sun-soft/60 p-4 text-[0.95rem]">
                  <Info className="mt-0.5 h-5 w-5 shrink-0 text-ink-soft" />
                  <span>
                    Подаръците по-долу са <b>избрани автоматично</b> (малки продукти в наличност, със снимка) и вече се показват в магазина. Щом
                    промените нещо и натиснете „Запази“, магазинът показва само вашия избор.
                  </span>
                </p>
              ) : null}
              <Toggle
                checked={value.enabled}
                onChange={(enabled) => update((d) => ({ ...d, enabled }))}
                label="Подаръците са включени"
                description="Изключете, за да спрете всички подаръци, без да губите настройките."
              />
              <Field group label="Колко подаръка получава клиентът?">
                <div className="grid gap-2 md:grid-cols-2">
                  {[
                    { key: "perTier" as const, title: "По един подарък за всяко достигнато ниво (препоръчително)", text: "При 85 € и нива 40/60/80 € клиентът избира 3 подаръка — по един от всяко ниво." },
                    { key: "single" as const, title: "Един подарък общо", text: "Клиентът избира един подарък от всички достигнати нива — по-високите нива дават по-добър избор." },
                  ].map((o) => (
                    <label key={o.key} className={clsx("cursor-pointer rounded-2xl border-2 p-4 transition", value.mode === o.key ? "border-brand bg-brand-soft/40" : "border-line hover:border-ink-soft")}>
                      <input type="radio" name="gift-mode" className="sr-only" checked={value.mode === o.key} onChange={() => update((d) => ({ ...d, mode: o.key }))} />
                      <span className="block font-black">{o.title}</span>
                      <span className="text-sm text-ink-soft">{o.text}</span>
                    </label>
                  ))}
                </div>
              </Field>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Активни от (по желание)" hint="Първият ден на кампанията. Празно = веднага.">
                  <input type="date" className="field" value={value.startsAt} onChange={(e) => update((d) => ({ ...d, startsAt: e.target.value }))} />
                </Field>
                <Field label="Активни до (по желание)" hint="Последният ден (включително). Празно = без край." error={problems.general ?? undefined}>
                  <input type="date" className={clsx("field", problems.general && "!border-brand")} value={value.endsAt} onChange={(e) => update((d) => ({ ...d, endsAt: e.target.value }))} />
                </Field>
              </div>
              <Field group label="Заглавие в количката" hint="Над лентата с подаръците, напр. „Подаръци към поръчката“.">
                <L10nInput value={value.headline} onChange={(headline) => update((d) => ({ ...d, headline }))} label="Заглавие в количката" maxLength={80} />
              </Field>
              <Toggle
                checked={value.showBar}
                onChange={(showBar) => update((d) => ({ ...d, showBar }))}
                label="Показвай лентата „Подарък при поръчка над …“"
                description="Кратко съобщение в горната част на сайта и на страниците на продуктите."
              />
            </div>
          </Card>

          <Card
            title="Нива"
            description="Всяко ниво е сума и списък с подаръци, от които клиентът избира. Слагайте по-евтини мостри на ниските нива и по-ценни подаръци на високите."
            actions={
              <div className="flex flex-wrap gap-2">
                {value.tiers.length < MAX_TIERS ? (
                  <button type="button" onClick={addTier} className="btn btn-primary h-11 px-5 !shadow-none">
                    <Plus className="h-4 w-4" /> Добави ниво
                  </button>
                ) : null}
                {[40, 60, 80].some((n) => !value.tiers.some((t) => num(t.threshold) === n)) && value.tiers.length < MAX_TIERS ? (
                  <button type="button" onClick={quick} className="btn btn-ghost h-11 px-4">
                    <Sparkles className="h-4 w-4" /> Създай 40 / 60 / 80 €
                  </button>
                ) : null}
              </div>
            }
          >
            <div className="space-y-3">
              {value.tiers.map((t, i) => (
                <TierEditor
                  key={t.id}
                  tier={t}
                  index={i}
                  open={open.includes(t.id)}
                  onToggleOpen={() => setOpen((o) => (o.includes(t.id) ? o.filter((x) => x !== t.id) : [...o, t.id]))}
                  onChange={(nt) => setTiers((tiers) => tiers.map((x) => (x.id === t.id ? nt : x)))}
                  onRemove={() => setTiers((tiers) => tiers.filter((x) => x.id !== t.id))}
                  products={products}
                  onAddProduct={(sku) => addProduct(t.id, sku)}
                  problems={problems}
                  masterOn={value.enabled}
                />
              ))}
              {!value.tiers.length ? (
                <p className="rounded-2xl border-2 border-dashed border-line p-6 text-center font-bold text-ink-soft">Няма нива. Натиснете „Създай 40 / 60 / 80 €“.</p>
              ) : null}
              <p className="text-sm text-muted">
                Нивата се подреждат автоматично по сума при запазване. Продукти за пълнолетни (18+) не могат да са подаръци. Скритите продукти могат — удобно за мостри,
                които не се продават отделно.
              </p>
            </div>
          </Card>
        </div>

        <div className="min-w-0 xl:sticky xl:top-6">
          <Card
            title="Преглед в количката"
            description="Преместете плъзгача, за да видите какво вижда клиентът при различна стойност на количката."
            actions={
              <div role="radiogroup" aria-label="Език на прегледа" className="inline-flex gap-1 rounded-full bg-canvas p-1">
                {(["bg", "en"] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    role="radio"
                    aria-checked={lang === l}
                    onClick={() => setLang(l)}
                    className={clsx("rounded-full px-3 py-1 text-xs font-black", lang === l ? "bg-ink text-white" : "text-muted hover:text-ink")}
                  >
                    {l === "bg" ? "БГ" : "EN"}
                  </button>
                ))}
              </div>
            }
          >
            <MilestonePreview draft={value} freeOver={freeOver} freeScope={freeScope} lang={lang} />
            {!value.enabled ? <p className="mt-3 text-sm font-bold text-brand">Подаръците са изключени — в сайта се вижда само безплатната доставка.</p> : null}
          </Card>
        </div>
      </div>

      <SaveBar dirty={dirty} pending={pending} status={status} onSave={save} onReset={() => update(() => saved)} />
    </div>
  );
}
