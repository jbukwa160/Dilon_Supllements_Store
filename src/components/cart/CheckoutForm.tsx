"use client";

import { startTransition, useActionState, useEffect, useEffectEvent, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { CircleAlert, Gift, Lock, ShoppingBag, UserRound } from "lucide-react";
import { fmt } from "@/i18n";
import { useDict, useLang } from "@/i18n/client";
import { placeOrder, type CheckoutField, type CheckoutState } from "@/app/[lang]/(shop)/porachka/actions";
import { DELIVERY_KEYS, DELIVERY_METHODS, PAYMENT_KEYS, issueText, type DeliveryKey, type PaymentKey, type SavedDelivery } from "@/lib/checkout";
import { formatAmount, formatPrice, plural } from "@/lib/format";
import { isFreeDelivery } from "@/lib/free-shipping";
import { localizeHref } from "@/lib/links";
import { checkoutToken, reloadGiftTiers, useCart, useCartReady, useGiftTiers } from "@/lib/store";
import { useSettings } from "@/components/SettingsProvider";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { Spinner } from "@/components/ui/Spinner";
import { ProductImage } from "@/components/product/ProductImage";
import { DeliveryPicker, type DeliveryState } from "./DeliveryPicker";
import { GiftPicker } from "./GiftPicker";
import { GiftTierBar } from "./GiftTierBar";
import { Rich } from "./Rich";
import { useCartPricing } from "./useCartPricing";

// The checkout (/porachka): contact details (prefilled for signed-in customers, optional account creation for
// guests), delivery (Speedy / Econt office, locker or address), payment (cash on delivery / bank transfer), note,
// and a summary priced live by the server (lines, gifts, delivery, total incl. VAT) with the legal checkboxes and
// the "Поръчка със задължение за плащане" button. Submitted to the placeOrder Server Action, which re-prices
// everything and redirects to the order page.

export type CheckoutPrefill = { firstName: string; lastName: string; phone: string; email: string; signedInAs: string | null };

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <section className="card p-5 md:p-7" aria-labelledby={id}>
      <h2 id={id} className="mb-5 flex items-center gap-3 text-xl font-bold">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink text-sm font-bold text-accent" aria-hidden>
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({
  label,
  name,
  error,
  hint,
  className,
  ...rest
}: { label: string; name: string; error?: string; hint?: string; className?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const noteId = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink-soft">
        {label}
      </label>
      <input id={id} name={name} className="field" aria-invalid={!!error} aria-describedby={error || hint ? noteId : undefined} {...rest} />
      {error ? (
        <p id={noteId} className="mt-1 text-sm font-semibold text-sale">
          {error}
        </p>
      ) : hint ? (
        <p id={noteId} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function Checkbox({
  name,
  error,
  children,
  ...rest
}: { name: string; error?: string; children: React.ReactNode } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  const id = useId();
  const errId = useId();
  return (
    <div>
      <label htmlFor={id} className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-ink-soft">
        <input
          id={id}
          type="checkbox"
          name={name}
          aria-invalid={!!error}
          aria-describedby={error ? errId : undefined}
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-[var(--color-primary)]"
          {...rest}
        />
        <span>{children}</span>
      </label>
      {error ? (
        <p id={errId} className="ml-8 mt-1 text-sm font-semibold text-sale">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function CheckoutForm({
  prefill,
  saved,
  cityQuery,
  methods = DELIVERY_KEYS,
}: {
  prefill: CheckoutPrefill;
  saved: SavedDelivery | null;
  cityQuery?: string;
  /** Delivery methods offered (couriers the shop can use); the first one is preselected. */
  methods?: readonly DeliveryKey[];
}) {
  const lang = useLang();
  const dict = useDict();
  const t = dict.checkout;
  const tg = dict.giftTiers;
  const settings = useSettings();
  const ready = useCartReady();
  const { items, refresh } = useCart();
  const campaign = useGiftTiers();
  const [delivery, setDelivery] = useState<DeliveryState>(saved ?? { method: methods[0] ?? "econt-office", office: null, city: null, address: "" });
  const [payment, setPayment] = useState<PaymentKey>("cod");
  const [createAccount, setCreateAccount] = useState(false);
  const [giftsOpen, setGiftsOpen] = useState(false);
  const [state, dispatch, pending] = useActionState<CheckoutState | null, FormData>(placeOrder, null);
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  const method = DELIVERY_METHODS[delivery.method];
  const target = method.kind === "office" ? delivery.office?.id : delivery.city?.id;
  // A town typed by hand (the courier's town search is down): priced at the fixed price, which is then exact.
  const typedCity = method.kind === "address" && delivery.city?.id === "";
  const pricingDelivery = useMemo(
    () => ({ method: delivery.method, ...(method.kind === "office" ? { officeId: target } : { cityId: target }) }),
    [delivery.method, method.kind, target],
  );
  const pricing = useCartPricing({ delivery: pricingDelivery, payment });

  // After a refused order: refresh the cart with the server's data, reload changed gift tiers, show what's wrong.
  const afterSubmit = useEffectEvent((s: CheckoutState) => {
    if (s.cart) refresh(s.cart);
    if (s.giftsChanged) reloadGiftTiers(lang);
    const invalid = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    (invalid ?? alertRef.current)?.focus();
  });
  useEffect(() => {
    if (state) afterSubmit(state);
  }, [state]);

  if (!ready) {
    return (
      <div className="card flex min-h-60 items-center justify-center gap-3 p-8 text-muted">
        <Spinner /> {dict.cart.loading}
      </div>
    );
  }
  if (!items.length && !pending) {
    return (
      <div className="card flex flex-col items-center gap-4 px-6 py-14 text-center md:py-20">
        <span className="grid h-20 w-20 place-items-center rounded-full bg-primary-50 text-primary">
          <ShoppingBag className="h-9 w-9" aria-hidden />
        </span>
        <p className="text-xl font-bold">{t.emptyTitle}</p>
        <p className="max-w-sm text-muted">{t.emptyText}</p>
        <Link href={localizeHref("/produkti", lang)} className="btn btn-primary h-12 px-8">
          {t.emptyCta}
        </Link>
      </div>
    );
  }

  const priced = pricing.priced;
  const shown = priced ?? pricing.last;
  const e = state?.fieldErrors ?? ({} as Partial<Record<CheckoutField, string>>);
  const mode = campaign?.mode ?? "perTier";
  const tiers = campaign?.tiers ?? [];
  const reachedTiers = tiers.filter((x) => pricing.reached.has(x.id));
  const flagged = (priced?.issues ?? []).filter((i) => i.code === "gift_out_of_stock" || i.code === "gift_not_in_tier");
  const payloadGifts = pricing.sentGifts.filter((g) => !flagged.some((i) => "id" in i && i.id === g.id && i.tierId === g.tierId));
  const unclaimed = mode === "single" ? (reachedTiers.length && !payloadGifts.length ? 1 : 0) : reachedTiers.filter((x) => !payloadGifts.some((g) => g.tierId === x.id)).length;
  const blockingIssues = (priced?.issues ?? []).filter((i) => i.code === "missing" || i.code === "stock");
  const needsAdult = items.some((i) => i.adultOnly);
  const names = new Map<number, string>([...items.map((i) => [i.id, i.name] as const), ...pricing.sentGifts.map((g) => [g.id, g.name] as const)]);
  const canSubmit = !!priced && !pricing.loading && !blockingIssues.length && !pending;

  const shippingMode = settings.shipping.mode;
  const q = pricing.amount;
  const freeFor = (k: DeliveryKey) => isFreeDelivery(q, settings.shipping, DELIVERY_METHODS[k].kind);
  const fixedFor = (k: DeliveryKey) => (DELIVERY_METHODS[k].kind === "address" ? settings.shipping.address : settings.shipping.office);
  const priceFor = (k: DeliveryKey): React.ReactNode => {
    if (freeFor(k)) return <span className="text-success">{t.free}</span>;
    // Once an office / town is chosen the quote (courier price, or the fixed fallback) is what will be charged.
    if (k === delivery.method && (target || typedCity) && priced?.shipping) return formatPrice(priced.shipping.price, lang);
    return shippingMode === "courier" ? fmt(t.about, { amount: formatPrice(fixedFor(k), lang) }) : formatPrice(fixedFor(k), lang);
  };
  const quote = priced?.shipping ?? null;
  const approximate = !!quote && !quote.free && shippingMode === "courier" && !target && !typedCity;

  const onSubmit = (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    if (!canSubmit || !priced) return;
    const fd = new FormData(ev.currentTarget);
    fd.set("lang", lang);
    const lines = items.map((i) => ({ id: i.id, qty: i.qty }));
    const chosen = payloadGifts.map((g) => ({ tierId: g.tierId, id: g.id }));
    fd.set("items", JSON.stringify(lines));
    fd.set("gifts", JSON.stringify(chosen));
    fd.set("expectedTotal", priced.total.toFixed(2));
    // One key per cart: a retry of this cart is recognised, a changed cart never lands on an earlier order.
    fd.set("checkoutToken", checkoutToken(lines, chosen));
    startTransition(() => dispatch(fd));
  };

  // The sign-in page localizes `next` itself.
  const signInHref = localizeHref("/vhod?next=/porachka", lang);

  return (
    <>
      <form ref={formRef} onSubmit={onSubmit} noValidate className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px] xl:gap-8">
        <div className="min-w-0 space-y-5">
          <Section n={1} title={t.contact}>
            {prefill.signedInAs ? (
              <p className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-primary-50 px-4 py-3 text-sm">
                <UserRound className="h-4 w-4 text-primary" aria-hidden />
                <span className="font-semibold">{fmt(t.signedInAs, { name: prefill.signedInAs })}</span>
                <Link href={localizeHref("/profil", lang)} className="font-semibold text-primary underline-offset-2 hover:underline">
                  {t.profileLink}
                </Link>
              </p>
            ) : (
              <p className="mb-5 rounded-md bg-canvas px-4 py-3 text-sm text-ink-soft">
                {t.haveAccount}{" "}
                <Link href={signInHref} className="font-bold text-primary underline-offset-2 hover:underline">
                  {t.signIn}
                </Link>{" "}
                {t.signInHint}
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.firstName} name="firstName" autoComplete="given-name" required maxLength={80} defaultValue={prefill.firstName} error={e.firstName} />
              <Field label={t.lastName} name="lastName" autoComplete="family-name" required maxLength={80} defaultValue={prefill.lastName} error={e.lastName} />
              <Field
                label={t.phone}
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder={t.phonePlaceholder}
                required
                maxLength={30}
                defaultValue={prefill.phone}
                error={e.phone}
              />
              <Field label={t.email} name="email" type="email" inputMode="email" autoComplete="email" required maxLength={200} defaultValue={prefill.email} error={e.email} />
            </div>
            {!prefill.signedInAs ? (
              <div className="mt-5 space-y-3 border-t border-line pt-5">
                <Checkbox name="createAccount" checked={createAccount} onChange={(ev) => setCreateAccount(ev.target.checked)}>
                  <span className="font-semibold text-ink">{t.createAccount}</span>
                  <span className="block text-xs text-muted">{t.createAccountHint}</span>
                </Checkbox>
                {createAccount ? (
                  <>
                    <Field
                      label={t.password}
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      maxLength={200}
                      required
                      hint={t.passwordHint}
                      error={e.password}
                      className="sm:max-w-sm"
                    />
                    {/* Like the registration form: accounts are for adults only. An order with 18+ products asks below anyway. */}
                    {needsAdult ? null : (
                      <Checkbox name="accountAdult" error={e.accountAdult} required>
                        {t.accountAdultConfirm}
                      </Checkbox>
                    )}
                  </>
                ) : null}
              </div>
            ) : null}
          </Section>

          <Section n={2} title={t.delivery}>
            <DeliveryPicker value={delivery} onChange={setDelivery} errors={e} priceFor={priceFor} initialCityQuery={cityQuery} methods={methods} />
            {prefill.signedInAs ? (
              <div className="mt-5 border-t border-line pt-4">
                <Checkbox name="saveAddress" defaultChecked>
                  {t.saveAddress}
                </Checkbox>
              </div>
            ) : null}
          </Section>

          <Section n={3} title={t.payment}>
            <div className="grid gap-3 md:grid-cols-2" role="radiogroup" aria-label={t.paymentAria}>
              {PAYMENT_KEYS.map((k) => (
                <label
                  key={k}
                  className={clsx(
                    "flex cursor-pointer flex-col gap-1 rounded-md border-[1.5px] p-4 transition has-[input:focus-visible]:outline-3 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-primary/70",
                    payment === k ? "border-primary bg-primary-50" : "border-line bg-surface hover:border-ink/40",
                  )}
                >
                  <input type="radio" name="payment" value={k} checked={payment === k} onChange={() => setPayment(k)} className="sr-only" />
                  <span className="font-bold">{t.payments[k].label}</span>
                  <span className="text-sm text-ink-soft">{t.payments[k].hint}</span>
                </label>
              ))}
            </div>
            {e.payment ? <p className="mt-2 text-sm font-semibold text-sale">{e.payment}</p> : null}
            <div className="mt-5">
              <label htmlFor="checkout-note" className="mb-1.5 block text-sm font-semibold text-ink-soft">
                {t.noteOptional}
              </label>
              <textarea id="checkout-note" name="note" rows={3} maxLength={1000} placeholder={t.notePlaceholder} className="field resize-y" />
            </div>
          </Section>
        </div>

        <aside className="card p-5 md:p-6 lg:sticky lg:top-24" aria-labelledby="checkout-summary">
          <div className="flex items-center justify-between gap-3">
            <h2 id="checkout-summary" className="text-xl font-bold">
              {t.yourOrder}
            </h2>
            <Link href={localizeHref("/kolichka", lang)} className="text-sm font-semibold text-primary underline-offset-2 hover:underline">
              {t.editCart}
            </Link>
          </div>

          <GiftTierBar compact amount={pricing.amount} className="mt-4 rounded-md bg-canvas p-3" hint="none" deliveryKind={method.kind} />

          <ul className="mt-2 max-h-80 space-y-3 overflow-y-auto pr-1 pt-2">
            {items.map((i) => (
              <li key={i.id} className="flex items-center gap-3">
                <span className="relative h-14 w-14 shrink-0 rounded-md border border-line bg-surface p-1">
                  <ProductImage src={i.image} alt="" />
                  <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-pill bg-ink px-1 text-[0.7rem] font-bold text-white">{i.qty}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm font-semibold leading-snug">{i.name}</span>
                  {i.variant ? <span className="block text-xs text-muted">{i.variant}</span> : null}
                </span>
                <span className="shrink-0 text-sm font-bold tabular-nums">{formatPrice((Math.round(i.price * 100) * i.qty) / 100, lang)}</span>
              </li>
            ))}
            {(shown?.giftLines ?? []).map((g) => (
              <li key={`gift-${g.tierId}`} className="flex items-center gap-3">
                <span className="relative h-14 w-14 shrink-0 rounded-md border border-line bg-surface p-1">
                  <ProductImage src={g.image ?? null} alt="" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Badge tone="new">{tg.gift}</Badge>
                    {g.tierThreshold ? <span className="text-xs text-muted">{fmt(tg.locked, { amount: formatAmount(g.tierThreshold, lang) })}</span> : null}
                  </span>
                  <span className="line-clamp-2 text-sm font-semibold leading-snug">{g.name}</span>
                  {g.variant ? <span className="block text-xs text-muted">{g.variant}</span> : null}
                </span>
                <span className="shrink-0 text-sm font-bold tabular-nums text-success">{formatPrice(0, lang)}</span>
              </li>
            ))}
          </ul>

          {flagged.length ? (
            <ul className="mt-3 space-y-1 text-sm font-semibold text-sale">
              {flagged.map((i, n) => (
                <li key={n}>{issueText(i, lang, { name: (id) => names.get(id) })}</li>
              ))}
            </ul>
          ) : null}
          {unclaimed > 0 ? (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md bg-accent/25 px-3 py-2.5 text-sm">
              <Gift className="h-5 w-5 shrink-0 text-ink" aria-hidden />
              <span className="min-w-0 flex-1 font-semibold">{plural(lang, unclaimed, t.giftReminder)}</span>
              <button type="button" onClick={() => setGiftsOpen(true)} className="btn btn-outline min-h-9 px-3 py-1 text-sm">
                {t.chooseGift}
              </button>
            </div>
          ) : null}

          <dl className="mt-5 space-y-2.5 border-t border-line pt-4 text-[0.95rem] tabular-nums">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-soft">{t.products}</dt>
              <dd className="font-semibold">{formatPrice(shown?.subtotal ?? pricing.amount, lang)}</dd>
            </div>
            {shown?.giftLines.length ? (
              <div className="flex justify-between gap-3">
                <dt className="text-ink-soft">{`${t.gifts} (${shown.giftLines.length})`}</dt>
                <dd className="font-semibold text-success">{formatPrice(0, lang)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-3">
              <dt className="text-ink-soft">
                {t.shippingPrice}
                <span className="block text-xs text-muted">{t.methods[delivery.method].short}</span>
              </dt>
              <dd className="text-right font-semibold">
                {!quote ? (
                  <Spinner className="ml-auto h-4 w-4 text-muted" label={t.calculating} />
                ) : quote.free ? (
                  <span className="text-success">{t.free}</span>
                ) : approximate ? (
                  <>
                    {fmt(t.about, { amount: formatPrice(quote.price, lang) })}
                    <span className="block text-xs font-normal text-muted">{t.exactAfter[method.kind]}</span>
                  </>
                ) : (
                  formatPrice(quote.price, lang)
                )}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t border-line pt-3">
              <dt className="font-bold">
                {t.total} <span className="text-xs font-normal text-muted">({t.inclVat})</span>
              </dt>
              <dd className="flex items-center gap-2 text-2xl font-bold">
                {pricing.loading ? <Spinner className="h-4 w-4 text-muted" /> : null}
                {shown ? formatPrice(shown.total, lang) : "—"}
              </dd>
            </div>
          </dl>

          <div className="mt-5 space-y-3">
            <Checkbox name="terms" error={e.terms} required>
              <Rich
                text={t.terms}
                values={{
                  terms: (
                    <Link href={localizeHref("/obshti-usloviya", lang)} target="_blank" className="font-semibold text-primary underline">
                      {t.termsLink}
                    </Link>
                  ),
                  privacy: (
                    <Link href={localizeHref("/poveritelnost", lang)} target="_blank" className="font-semibold text-primary underline">
                      {t.privacyLink}
                    </Link>
                  ),
                }}
              />
            </Checkbox>
            {needsAdult ? (
              <Checkbox name="adult" error={e.adult ?? (createAccount ? e.accountAdult : undefined)} required>
                {t.adultConfirm}
              </Checkbox>
            ) : null}
          </div>

          <p className="mt-4 text-xs leading-relaxed text-muted">
            {t.sealedNotice}{" "}
            <Link href={localizeHref("/vrashtane#koi-produkti", lang)} target="_blank" className="font-semibold underline">
              {t.sealedMore}
            </Link>
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            <Rich
              text={t.withdrawalNotice}
              values={{
                days: Math.max(14, settings.returnDays),
                link: (
                  <Link href={localizeHref("/otkaz-ot-dogovor", lang)} target="_blank" className="font-semibold underline">
                    {t.withdrawalLink}
                  </Link>
                ),
              }}
            />
          </p>

          {state?.error || blockingIssues.length || pricing.failed ? (
            <div ref={alertRef} tabIndex={-1} role="alert" className="mt-4 rounded-md bg-sale/10 p-3 text-sm font-semibold text-sale outline-none">
              <p className="flex items-start gap-2">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>{state?.error ?? (blockingIssues.length ? dict.cart.unavailableBlock : t.errors.server)}</span>
              </p>
              {state?.issues?.length || blockingIssues.length ? (
                <ul className="ml-6 mt-1 list-disc space-y-0.5 font-normal">
                  {(state?.issues ?? []).map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                  {blockingIssues.map((i, n) => (
                    <li key={`b${n}`}>{issueText(i, lang, { name: (id) => names.get(id) })}</li>
                  ))}
                </ul>
              ) : null}
              {state?.changed || blockingIssues.length ? (
                <Link href={localizeHref("/kolichka", lang)} className="ml-6 mt-1 inline-block underline">
                  {dict.cart.toCart}
                </Link>
              ) : null}
            </div>
          ) : null}

          <button type="submit" disabled={!canSubmit} aria-busy={pending} className="btn btn-energy mt-4 min-h-14 w-full whitespace-normal px-4 py-3 text-lg leading-tight">
            {pending ? <Spinner className="h-5 w-5" /> : <Lock className="h-5 w-5 shrink-0" aria-hidden />}
            <span className="text-center">{t.submit}</span>
          </button>
        </aside>
      </form>

      <Dialog open={giftsOpen} onClose={() => setGiftsOpen(false)} title={mode === "single" ? tg.pickerTitleSingle : tg.pickerTitle} size="lg">
        <GiftPicker amount={pricing.amount} reached={pricing.reached} issues={priced?.issues} layout="row" showTitle={false} className="pb-2" />
      </Dialog>
    </>
  );
}
