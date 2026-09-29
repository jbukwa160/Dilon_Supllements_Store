"use client";

import { useEffect, useId, useRef, useState } from "react";
import clsx from "clsx";
import { Building2, Check, CircleAlert, Home, MapPin, Package, Search } from "lucide-react";
import { fmt } from "@/i18n";
import { useDict, useLang } from "@/i18n/client";
import { DELIVERY_KEYS, DELIVERY_METHODS, courierName, type City, type Courier, type DeliveryKey, type Office, type SavedDelivery } from "@/lib/checkout";
import { Spinner } from "@/components/ui/Spinner";

// Delivery choice for the checkout (ported from /web): four methods (Econt / Speedy × office-or-locker / address),
// a searchable office list and a town search for address delivery, both served by /api/shipping/* (the courier
// credentials never leave the server). Courier data (office names, towns) is Bulgarian in both languages.
// Only the couriers the shop can use are offered (`methods`). When the town search is down, the town and post code
// can be typed by hand (a City with id "" — charged the fixed price; see lib/shipping resolveDelivery).

export type DeliveryState = SavedDelivery;

/** Search suggestions: the query is the Bulgarian town name (the courier data is in Bulgarian); the chip shows it in the page's language. */
const QUICK_CITIES: { bg: string; en: string }[] = [
  { bg: "София", en: "Sofia" },
  { bg: "Пловдив", en: "Plovdiv" },
  { bg: "Варна", en: "Varna" },
  { bg: "Бургас", en: "Burgas" },
  { bg: "Русе", en: "Ruse" },
  { bg: "Стара Загора", en: "Stara Zagora" },
  { bg: "Плевен", en: "Pleven" },
];

export function CourierBadge({ courier, className }: { courier: Courier; className?: string }) {
  const lang = useLang();
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-sm px-2 py-0.5 text-[0.68rem] font-bold uppercase tracking-[0.08em] text-white",
        courier === "econt" ? "bg-[#1b3f8b]" : "bg-[#e3000f]",
        className,
      )}
    >
      {courierName(courier, lang)}
    </span>
  );
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setV(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return v;
}

function FieldError({ id, text }: { id: string; text?: string }) {
  if (!text) return null;
  return (
    <p id={id} className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-sale">
      <CircleAlert className="h-4 w-4 shrink-0" aria-hidden /> {text}
    </p>
  );
}

function OfficePicker({ courier, value, onChange, error }: { courier: Courier; value: Office | null; onChange: (o: Office | null) => void; error?: string }) {
  const t = useDict().checkout;
  const lang = useLang();
  const inputId = useId();
  const errorId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ q: string; offices: Office[]; failed?: boolean } | null>(null);
  const q = useDebounced(query.trim(), 250);

  useEffect(() => {
    if (q.length < 2) return;
    const ctrl = new AbortController();
    fetch(`/api/shipping/offices?courier=${courier}&q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d: { offices?: Office[]; error?: string }) => setResults({ q, offices: d.offices ?? [], failed: !!d.error }))
      .catch((e: unknown) => {
        if ((e as Error)?.name !== "AbortError") setResults({ q, offices: [], failed: true });
      });
    return () => ctrl.abort();
  }, [q, courier]);

  if (value) {
    return (
      <div className="flex flex-wrap items-start gap-3 rounded-md border-[1.5px] border-primary bg-primary-50 p-4">
        <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" strokeWidth={3} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <CourierBadge courier={courier} />
            <span className="font-bold">
              {value.locker ? t.lockerShort : t.officeShort} „{value.name}“
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            {value.city}
            {value.address ? `, ${value.address}` : ""}
          </p>
        </div>
        <button type="button" onClick={() => onChange(null)} className="btn btn-ghost min-h-10 shrink-0 px-4 text-sm">
          {t.change}
        </button>
      </div>
    );
  }

  const showing = results && results.q === q && q.length >= 2 ? results : null;
  const loading = q.length >= 2 && !showing;
  return (
    <div>
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-semibold text-ink-soft">
        {t.findOffice[courier]}
      </label>
      <span
        className={clsx(
          "flex items-center rounded-md border-[1.5px] bg-surface px-3 transition focus-within:border-primary focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-primary)_18%,transparent)]",
          error ? "border-sale" : "border-line",
        )}
      >
        {loading ? <Spinner className="text-muted" /> : <Search className="h-5 w-5 text-muted" aria-hidden />}
        <input
          id={inputId}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.officePlaceholder}
          autoComplete="off"
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          className="w-full bg-transparent px-2 py-3 text-base outline-none focus-visible:outline-none"
        />
      </span>
      {!q ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {QUICK_CITIES.map((c) => (
            <button key={c.bg} type="button" onClick={() => setQuery(c.bg)} className="chip min-h-9 !py-1 !text-xs">
              {c[lang]}
            </button>
          ))}
        </div>
      ) : null}
      <FieldError id={errorId} text={error} />
      {showing ? (
        showing.offices.length ? (
          <ul className="mt-2 max-h-80 divide-y divide-line overflow-y-auto overscroll-contain rounded-md border border-line bg-surface" aria-label={t.officesList}>
            {showing.offices.map((o) => (
              <li key={o.id}>
                <button type="button" onClick={() => onChange(o)} className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-canvas">
                  {o.locker ? <Package className="mt-0.5 h-5 w-5 shrink-0 text-info" aria-hidden /> : <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />}
                  <span className="min-w-0">
                    <span className="block font-semibold">
                      {o.name}
                      {o.locker ? <span className="ml-2 rounded-pill bg-info/10 px-2 py-0.5 text-[0.7rem] font-bold text-info">{t.lockerShort}</span> : null}
                    </span>
                    <span className="block text-sm text-muted">
                      {o.city}
                      {o.address ? `, ${o.address}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 rounded-md bg-canvas p-4 text-sm font-semibold text-ink-soft" role="status">
            {showing.failed ? t.officesUnavailable : t.noOffices}
          </p>
        )
      ) : null}
    </div>
  );
}

/** Town + post code typed by hand while the courier's town search is down (stored as a City with id ""). */
function TypedCity({ value, onChange, onSearch, error }: { value: City; onChange: (c: City) => void; onSearch: () => void; error?: string }) {
  const t = useDict().checkout;
  const nameId = useId();
  const codeId = useId();
  const noteId = useId();
  return (
    <div>
      <p className="mb-2 flex items-start gap-1.5 text-sm font-semibold text-ink-soft">
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden /> {t.citiesUnavailable} {t.typeCity}.
      </p>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
        <div>
          <label htmlFor={nameId} className="mb-1.5 block text-sm font-semibold text-ink-soft">
            {t.cityName}
          </label>
          <input
            id={nameId}
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value.slice(0, 60) })}
            autoComplete="address-level2"
            maxLength={60}
            aria-invalid={!!error}
            aria-describedby={error ? noteId : undefined}
            className="field"
          />
        </div>
        <div>
          <label htmlFor={codeId} className="mb-1.5 block text-sm font-semibold text-ink-soft">
            {t.postCode}
          </label>
          <input
            id={codeId}
            value={value.postCode}
            onChange={(e) => onChange({ ...value, postCode: e.target.value.replace(/\D/g, "").slice(0, 4) })}
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={4}
            aria-invalid={!!error}
            aria-describedby={error ? noteId : undefined}
            className="field"
          />
        </div>
      </div>
      <FieldError id={noteId} text={error} />
      <p className="mt-1.5 text-xs text-muted">{t.typedCityHint}</p>
      <button type="button" onClick={onSearch} className="mt-1 min-h-10 text-sm font-semibold text-primary underline-offset-2 hover:underline">
        {t.searchAgain}
      </button>
    </div>
  );
}

function CityPicker({
  courier,
  value,
  onChange,
  error,
  initialQuery = "",
}: {
  courier: Courier;
  value: City | null;
  onChange: (c: City | null) => void;
  error?: string;
  initialQuery?: string;
}) {
  const t = useDict().checkout;
  const inputId = useId();
  const errorId = useId();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<{ q: string; cities: City[]; failed?: boolean } | null>(null);
  const q = useDebounced(query.trim(), 250);

  useEffect(() => {
    if (q.length < 2) return;
    const ctrl = new AbortController();
    fetch(`/api/shipping/cities?courier=${courier}&q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d: { cities?: City[]; error?: string }) => setResults({ q, cities: d.cities ?? [], failed: !!d.error }))
      .catch((e: unknown) => {
        if ((e as Error)?.name !== "AbortError") setResults({ q, cities: [], failed: true });
      });
    return () => ctrl.abort();
  }, [q, courier]);

  if (value && value.id === "") {
    return <TypedCity value={value} onChange={onChange} onSearch={() => onChange(null)} error={error} />;
  }
  if (value) {
    const region = value.region && value.region !== value.name.replace(/^(гр\.|с\.)\s*/, "") ? value.region : "";
    return (
      <div>
        <span className="mb-1.5 block text-sm font-semibold text-ink-soft">{t.city}</span>
        <div className="flex flex-wrap items-center gap-3 rounded-md border-[1.5px] border-primary bg-primary-50 px-4 py-3">
          <MapPin className="h-5 w-5 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1 font-semibold">
            {value.name} <span className="font-normal text-muted">{value.postCode}</span>
            {region ? <span className="font-normal text-muted">, {fmt(t.region, { region })}</span> : null}
          </span>
          <button type="button" onClick={() => onChange(null)} className="btn btn-ghost min-h-10 px-4 text-sm">
            {t.change}
          </button>
        </div>
      </div>
    );
  }
  const showing = results && results.q === q && q.length >= 2 ? results : null;
  return (
    <div className="relative">
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-semibold text-ink-soft">
        {t.city}
      </label>
      <span
        className={clsx(
          "flex items-center rounded-md border-[1.5px] bg-surface px-3 transition focus-within:border-primary focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-primary)_18%,transparent)]",
          error ? "border-sale" : "border-line",
        )}
      >
        {q.length >= 2 && !showing ? <Spinner className="text-muted" /> : <Search className="h-5 w-5 text-muted" aria-hidden />}
        <input
          id={inputId}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.cityPlaceholder}
          autoComplete="off"
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          className="w-full bg-transparent px-2 py-3 text-base outline-none focus-visible:outline-none"
        />
      </span>
      <FieldError id={errorId} text={error} />
      {showing ? (
        <ul
          className="absolute left-0 right-0 z-20 mt-1 max-h-72 overflow-y-auto overscroll-contain rounded-md border border-line bg-surface py-1 shadow-lift"
          aria-label={t.citiesList}
        >
          {showing.cities.length ? (
            showing.cities.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => onChange(c)} className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition hover:bg-canvas">
                  <span className="font-semibold">{c.name}</span>
                  <span className="text-sm text-muted">
                    {c.postCode}
                    {c.region ? ` · ${c.region}` : ""}
                  </span>
                </button>
              </li>
            ))
          ) : showing.failed ? (
            <li className="px-4 py-3 text-sm" role="status">
              <span className="block text-muted">{t.citiesUnavailable}</span>
              <button
                type="button"
                onClick={() => onChange({ id: "", courier, name: query.trim().slice(0, 60), region: "", postCode: "" })}
                className="mt-1 min-h-10 font-semibold text-primary underline-offset-2 hover:underline"
              >
                {t.typeCity}
              </button>
            </li>
          ) : (
            <li className="px-4 py-3 text-sm text-muted" role="status">
              {t.noCities}
            </li>
          )}
        </ul>
      ) : null}
    </div>
  );
}

export function DeliveryPicker({
  value,
  onChange,
  errors,
  priceFor,
  initialCityQuery,
  methods = DELIVERY_KEYS,
}: {
  value: DeliveryState;
  onChange: (v: DeliveryState) => void;
  errors: Partial<Record<string, string>>;
  /** Text shown under each option, e.g. "около 3,99 €" or "Безплатна". */
  priceFor: (key: DeliveryKey) => React.ReactNode;
  /** A saved address typed by hand (no courier town id yet): start the town search with its name. */
  initialCityQuery?: string;
  /** The methods offered (couriers the shop can use). */
  methods?: readonly DeliveryKey[];
}) {
  const t = useDict().checkout;
  const m = DELIVERY_METHODS[value.method];
  const addressRef = useRef<HTMLInputElement>(null);
  const addressError = useId();
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2" role="radiogroup" aria-label={t.deliveryAria}>
        {methods.map((k) => {
          const d = DELIVERY_METHODS[k];
          const active = value.method === k;
          return (
            <label
              key={k}
              className={clsx(
                "flex cursor-pointer items-start gap-3 rounded-md border-[1.5px] p-4 transition has-[input:focus-visible]:outline-3 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-primary/70",
                active ? "border-primary bg-primary-50" : "border-line bg-surface hover:border-ink/40",
              )}
            >
              <input
                type="radio"
                name="delivery"
                value={k}
                checked={active}
                onChange={() => {
                  // Keep the chosen office / town only when it belongs to the same courier.
                  const sameCourier = d.courier === m.courier;
                  onChange({ ...value, method: k, office: sameCourier ? value.office : null, city: sameCourier ? value.city : null });
                }}
                className="sr-only"
              />
              <span className={clsx("grid h-10 w-10 shrink-0 place-items-center rounded-md", active ? "bg-surface text-primary" : "bg-canvas text-ink-soft")} aria-hidden>
                {d.kind === "office" ? <Building2 className="h-5 w-5" /> : <Home className="h-5 w-5" />}
              </span>
              <span className="min-w-0">
                <CourierBadge courier={d.courier} />
                <span className="mt-1 block font-semibold leading-tight">{t.methods[k].label}</span>
                <span className="text-sm font-semibold text-ink-soft">{priceFor(k)}</span>
              </span>
            </label>
          );
        })}
      </div>
      {errors.delivery ? (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-sale">
          <CircleAlert className="h-4 w-4" aria-hidden /> {errors.delivery}
        </p>
      ) : null}

      <input type="hidden" name="officeId" value={m.kind === "office" ? (value.office?.id ?? "") : ""} />
      <input type="hidden" name="cityId" value={m.kind === "address" ? (value.city?.id ?? "") : ""} />
      {m.kind === "address" && value.city?.id === "" ? (
        <>
          <input type="hidden" name="cityName" value={value.city.name} />
          <input type="hidden" name="postCode" value={value.city.postCode} />
        </>
      ) : null}

      {m.kind === "office" ? (
        <OfficePicker key={m.courier} courier={m.courier} value={value.office} onChange={(office) => onChange({ ...value, office })} error={errors.office} />
      ) : (
        <div className="grid gap-4">
          <CityPicker
            key={m.courier}
            courier={m.courier}
            value={value.city}
            initialQuery={initialCityQuery}
            onChange={(city) => {
              onChange({ ...value, city });
              // A town picked from the list: on to the street. (Not while a town is being typed by hand.)
              if (city?.id) setTimeout(() => addressRef.current?.focus(), 0);
            }}
            error={errors.city}
          />
          <div>
            <label htmlFor="checkout-address" className="mb-1.5 block text-sm font-semibold text-ink-soft">
              {t.address}
            </label>
            <input
              id="checkout-address"
              ref={addressRef}
              name="address"
              value={value.address}
              onChange={(e) => onChange({ ...value, address: e.target.value })}
              autoComplete="street-address"
              placeholder={t.addressPlaceholder}
              maxLength={300}
              aria-invalid={!!errors.address}
              aria-describedby={errors.address ? addressError : undefined}
              className="field"
            />
            <FieldError id={addressError} text={errors.address} />
          </div>
        </div>
      )}
    </div>
  );
}
