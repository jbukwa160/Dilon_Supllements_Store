"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { ArrowDown, ArrowUp, Check, CircleAlert, ExternalLink, LoaderCircle, Plus, RotateCcw, Star, Tag, Trash2, TriangleAlert, Upload, X } from "lucide-react";
import type { ActivePromotion, CategoryOption, Choice, FamilyMember, PriceHistoryRow } from "@/lib/admin/products";
import { FORM_LABELS, PRODUCT_KINDS, labelChecklist, parseMoney, type ProductPayload } from "@/lib/admin/validate";
import { discountPercent, formatDateTime, formatPrice } from "@/lib/format";
import { createProductAction, deleteProductAction, restoreProductAction, saveProductAction } from "@/app/admin/_actions/products";
import { uploadImageAction } from "@/app/admin/_actions/uploads";
import { Card, DateTimeInput, Field, L10nInput, MoneyInput, SaveBar, TextArea, TextInput, Toggle, useUnsavedWarning, type SaveStatus } from "./ui";
import { NutritionEditor } from "./NutritionEditor";
import { PriceHistory } from "./PriceHistory";
import { VariantPanel } from "./VariantPanel";

/** What the editor knows about the saved product besides the editable fields. */
export type ProductMeta = {
  id?: number;
  sku?: string;
  slug?: string;
  custom?: boolean;
  canRestore?: boolean;
  demoPrice?: boolean;
  createdAt?: string | null;
  editedAt?: string | null;
  sourceCategory?: string | null;
  familyMode: "auto" | "manual" | "single";
  family: FamilyMember[];
  /** The name the family card shows now (automatic or set by hand). */
  familyCardName?: string;
  /** The saved brand's food business operator is filled in (Производители). */
  manufacturerComplete: boolean;
  manufacturerName: string | null;
  pricing?: {
    basePrice: number;
    price: number;
    oldPrice: number | null;
    lowest30: number | null;
    omnibus: number | null;
    salePrice: number | null;
    saleEndsAt: string | null;
    promotion: ActivePromotion | null;
  };
  history?: { rows: PriceHistoryRow[]; total: number };
};

const SECTIONS = [
  { id: "osnovni", label: "Основни", fields: ["name", "nameEn", "brand", "category", "kind", "ean", "weightKg"] },
  { id: "tsena", label: "Цена и наличност", fields: ["price", "salePrice", "saleEndsAt", "stock"] },
  { id: "etiket", label: "Етикет", fields: ["regNo", "servingSize", "servings", "netQuantity", "ingredients", "allergens", "nutrition", "directions", "warnings", "storage"] },
  { id: "opisanie", label: "Описание", fields: ["description", "descriptionEn"] },
  { id: "snimki", label: "Снимки", fields: ["images"] },
  { id: "variant", label: "Вариант", fields: ["flavour", "flavourEn", "size", "groupKey", "familyName"] },
  { id: "tseli", label: "Цели и диети", fields: ["goals", "diets"] },
] as const;

const eur = (n: number) => formatPrice(n, "bg");

/** "30.11.2026" or "30.11.2026, 23:59" from a stored Bulgarian-time value. */
function whenText(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?/.exec(v);
  return m ? `${m[3]}.${m[2]}.${m[1]}${m[4] ? `, ${m[4]}` : ""}` : v;
}

// ---------------------------------------------------------------------------
// Pictures

function ImagesEditor({ images, onChange, error }: { images: string[]; onChange: (v: string[]) => void; error?: string }) {
  const [pending, start] = useTransition();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const move = (i: number, to: number) => {
    const next = [...images];
    const [x] = next.splice(i, 1);
    next.splice(to, 0, x);
    onChange(next);
  };
  const upload = (files: FileList) =>
    start(async () => {
      setUploadError(null);
      const added: string[] = [];
      for (const f of Array.from(files).slice(0, 12)) {
        const fd = new FormData();
        fd.append("file", f);
        const r = await uploadImageAction(fd);
        if (r.url) added.push(r.url);
        else setUploadError(r.error ?? "Качването не успя.");
      }
      if (added.length) onChange([...images, ...added]);
    });
  const addUrl = () => {
    const u = url.trim();
    if (!/^https?:\/\/[^\s<>"']+$/i.test(u)) {
      setUrlError(true);
      return;
    }
    if (!images.includes(u)) onChange([...images, u]);
    setUrl("");
    setUrlError(false);
  };

  return (
    <div>
      {images.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {images.map((src, i) => (
            <li key={`${src}#${i}`} className={clsx("relative rounded-2xl border-2 bg-white p-2", i === 0 ? "border-brand" : "border-line")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" referrerPolicy="no-referrer" className="aspect-square w-full object-contain" />
              {i === 0 ? <span className="absolute left-2 top-2 rounded-full bg-brand px-2 py-0.5 text-xs font-extrabold text-white">Главна</span> : null}
              <div className="mt-2 flex justify-center gap-1">
                {i > 0 ? (
                  <button type="button" onClick={() => move(i, 0)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-canvas" title="Направи главна" aria-label={`Направи снимка ${i + 1} главна`}>
                    <Star className="h-4 w-4" />
                  </button>
                ) : null}
                <button type="button" disabled={i === 0} onClick={() => move(i, i - 1)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-canvas disabled:opacity-30" aria-label={`Снимка ${i + 1} наляво`}>
                  <ArrowUp className="h-4 w-4 -rotate-90" />
                </button>
                <button
                  type="button"
                  disabled={i === images.length - 1}
                  onClick={() => move(i, i + 1)}
                  className="grid h-8 w-8 place-items-center rounded-lg hover:bg-canvas disabled:opacity-30"
                  aria-label={`Снимка ${i + 1} надясно`}
                >
                  <ArrowDown className="h-4 w-4 -rotate-90" />
                </button>
                <button type="button" onClick={() => onChange(images.filter((_, j) => j !== i))} className="grid h-8 w-8 place-items-center rounded-lg text-brand hover:bg-brand-soft" aria-label={`Премахни снимка ${i + 1}`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border-2 border-dashed border-line p-6 text-center text-ink-soft">Продуктът няма снимки — в сайта ще се показва празна рамка.</p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => file.current?.click()} disabled={pending} className="btn btn-primary h-11 px-5 !shadow-none">
          {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {pending ? "Качване…" : "Качи снимки от компютъра"}
        </button>
        <div className="flex min-w-0 flex-1 basis-64 gap-2">
          <TextInput
            placeholder="или поставете линк към снимка https://…"
            value={url}
            invalid={urlError}
            onChange={(e) => {
              setUrl(e.target.value);
              setUrlError(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addUrl();
              }
            }}
            aria-label="Линк към снимка"
          />
          <button type="button" onClick={addUrl} disabled={!url.trim()} className="btn btn-ghost h-12 shrink-0 px-4">
            <Plus className="h-4 w-4" /> Добави
          </button>
        </div>
      </div>
      <p className="mt-2 text-sm text-muted">Първата снимка е главната — тя се показва в списъците. Препоръчително: квадратни снимки на бял фон, поне 800×800 px.</p>
      {urlError ? <p className="mt-2 text-sm font-bold text-brand">Линкът трябва да започва с https://</p> : null}
      {uploadError ? <p className="mt-2 text-sm font-bold text-brand">{uploadError}</p> : null}
      {error ? <p className="mt-2 text-sm font-bold text-brand">{error}</p> : null}
      <input
        ref={file}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) upload(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function ChipChoice({ options, value, onChange, label }: { options: Choice[]; value: string[]; onChange: (v: string[]) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {options.map((o) => {
        const on = value.includes(o.key);
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== o.key) : [...value, o.key])}
            className={clsx("chip gap-1.5", on && "!border-ink !bg-ink !text-white")}
          >
            {on ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
            {o.label}
            {o.hidden ? <span className="text-xs opacity-70">(скрита)</span> : null}
          </button>
        );
      })}
    </div>
  );
}

function Section({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-20 lg:scroll-mt-6">
      {children}
    </div>
  );
}

export function ProductForm({
  initial,
  meta,
  mode,
  brands,
  categories,
  goals,
  diets,
}: {
  initial: ProductPayload;
  meta: ProductMeta;
  mode: "edit" | "create";
  brands: string[];
  /** As edited in Admin → Категории. */
  categories: CategoryOption[];
  goals: Choice[];
  diets: Choice[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<ProductPayload>(initial);
  const [saved, setSaved] = useState<ProductPayload>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  useUnsavedWarning(dirty);

  const update = (patch: Partial<ProductPayload>) => {
    setForm((f) => ({ ...f, ...patch }));
    setStatus({ kind: "idle" });
  };
  const set = <K extends keyof ProductPayload>(k: K, v: ProductPayload[K]) => update({ [k]: v } as Partial<ProductPayload>);

  const price = parseMoney(form.price);
  const sale = parseMoney(form.salePrice);
  const off = price != null && sale != null ? discountPercent(sale, price) : null;
  const kindInfo = PRODUCT_KINDS.find((k) => k.key === form.kind);
  const checklist = labelChecklist(form, { manufacturer: meta.manufacturerComplete });
  const missing = checklist.filter((c) => !c.ok);
  const sectionErrors = new Set(SECTIONS.filter((s) => s.fields.some((f) => errors[f])).map((s) => s.id));

  const save = () =>
    start(async () => {
      const r = mode === "create" ? await createProductAction(form) : await saveProductAction(meta.id!, form);
      setErrors(r.fieldErrors ?? {});
      if (r.ok) {
        if (r.product) setForm(r.product);
        setSaved(r.product ?? form);
        setStatus({ kind: "saved" });
        if (mode === "create" && r.id) router.push(`/admin/produkti/${r.id}?created=1`);
        else router.refresh();
      } else setStatus({ kind: "error", message: r.error ?? "Възникна грешка." });
    });

  const restore = () => {
    if (!confirm("Да върна ли оригиналните данни от файла на доставчика? Всички ваши промени по този продукт (цена, наличност, етикет, снимки, описание…) ще бъдат изтрити.")) return;
    start(async () => {
      const r = await restoreProductAction(meta.id!);
      // Reload so the form shows the restored values.
      if (r.ok) window.location.reload();
      else setStatus({ kind: "error", message: r.error ?? "Възникна грешка." });
    });
  };
  const remove = () => {
    if (!confirm("Сигурни ли сте, че искате да изтриете този продукт завинаги? Това не може да се отмени.")) return;
    start(async () => {
      const r = await deleteProductAction(meta.id!);
      if (r.ok) router.push("/admin/produkti");
      else setStatus({ kind: "error", message: r.error ?? "Възникна грешка." });
    });
  };

  const p = meta.pricing;
  const saleExpired = !!p && p.salePrice != null && !!p.saleEndsAt && p.price > p.salePrice + 0.001;
  const reduced = !!p && p.price < p.basePrice - 0.001;

  return (
    <>
      <nav className="mb-5 flex flex-wrap gap-2" aria-label="Раздели на продукта">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className={clsx("chip", sectionErrors.has(s.id) && "!border-brand !text-brand")}>
            {sectionErrors.has(s.id) ? <CircleAlert className="mr-1 h-3.5 w-3.5" /> : null}
            {s.label}
            {s.id === "etiket" && missing.some((m) => m.required) ? (
              <span className="ml-1.5 rounded-full bg-sun-soft px-1.5 text-xs font-black text-ink" title="Липсваща информация за етикета">
                {missing.filter((m) => m.required).length}
              </span>
            ) : null}
          </a>
        ))}
      </nav>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <Section id="osnovni">
            <Card title="Основна информация">
              <div className="grid gap-4">
                <Field label="Име на продукта *" group error={errors.name ?? errors.nameEn} hint="Английското име се показва в английската версия на сайта; празно = българското.">
                  <L10nInput label="Име на продукта" value={{ bg: form.name, en: form.nameEn }} onChange={(v) => update({ name: v.bg, nameEn: v.en })} maxLength={300} invalid={!!errors.name} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Марка" hint="Изберете от списъка или напишете нова." error={errors.brand}>
                    <TextInput list="brand-options" value={form.brand} onChange={(e) => set("brand", e.target.value)} maxLength={80} autoComplete="off" />
                    <datalist id="brand-options">
                      {brands.map((b) => (
                        <option key={b} value={b} />
                      ))}
                    </datalist>
                  </Field>
                  <Field label="Категория *" error={errors.category}>
                    <select className={clsx("field cursor-pointer", errors.category && "!border-brand")} value={form.category} onChange={(e) => set("category", e.target.value)}>
                      <option value="">— Изберете —</option>
                      {categories.map((c) => (
                        <optgroup key={c.slug} label={c.hidden ? `${c.name} (скрита в менюто)` : c.name}>
                          <option value={c.slug}>{c.name} — без подкатегория</option>
                          {c.subs.map((s) => (
                            <option key={s.slug} value={s.slug}>
                              {s.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </Field>
                  <Field label="Вид на продукта *" hint={kindInfo?.hint} error={errors.kind}>
                    <select className="field cursor-pointer" value={form.kind} onChange={(e) => set("kind", e.target.value as ProductPayload["kind"])}>
                      {PRODUCT_KINDS.map((k) => (
                        <option key={k.key} value={k.key}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Форма" hint="За филтъра „Форма“ в сайта.">
                    <select className="field cursor-pointer" value={form.form} onChange={(e) => set("form", e.target.value as ProductPayload["form"])}>
                      {!saved.form ? <option value="">— не е посочена —</option> : null}
                      {Object.entries(FORM_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Баркод (EAN)" error={errors.ean}>
                    <TextInput value={form.ean} onChange={(e) => set("ean", e.target.value)} inputMode="numeric" maxLength={14} invalid={!!errors.ean} />
                  </Field>
                  <Field label="Тегло за доставка (кг)" hint="С опаковката — за цената на куриера. Празно = изчислява се приблизително." error={errors.weightKg}>
                    <TextInput value={form.weightKg} onChange={(e) => set("weightKg", e.target.value)} inputMode="decimal" placeholder="напр. 1,1" invalid={!!errors.weightKg} />
                  </Field>
                </div>
                <Toggle
                  checked={form.featured}
                  onChange={(v) => set("featured", v)}
                  label="Препоръчан продукт"
                  description="Показва се по-напред в списъците и в „Най-продавани“ на началната страница."
                />
              </div>
            </Card>
          </Section>

          <Section id="etiket">
            <Card
              title="Етикет (информация за храната)"
              description="Задължителната информация от опаковката — показва се на страницата на продукта още преди поръчката. Препишете я от етикета или от сайта на производителя. Тези текстове се показват и в английската версия така, както са въведени."
            >
              {form.kind === "non-food" ? (
                <p className="mb-5 rounded-2xl bg-canvas p-4 text-sm font-bold text-ink-soft">Нехранителен продукт — полетата за етикет на храна не са задължителни.</p>
              ) : null}
              <div className="grid gap-4">
                <Toggle
                  checked={form.adultOnly}
                  onChange={(v) => set("adultOnly", v)}
                  label="Само за пълнолетни (18+)"
                  description="Предтренировъчни, енергийни и продукти с много кофеин: при поръчка клиентът потвърждава, че е навършил 18 години, и продуктът не се предлага като подарък."
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Рег. № в БАБХ" hint="Номерът от регистъра на хранителните добавки (при добавките)." error={errors.regNo}>
                    <TextInput value={form.regNo} onChange={(e) => set("regNo", e.target.value)} maxLength={120} placeholder="напр. Т032400123" />
                  </Field>
                  <Field label="Нетно количество" hint="Напр. „90 капсули“, „1000 g“, „500 ml“." error={errors.netQuantity}>
                    <TextInput value={form.netQuantity} onChange={(e) => set("netQuantity", e.target.value)} maxLength={120} />
                  </Field>
                  <Field label="Препоръчителна дневна доза" hint="Напр. „2 капсули“, „30 g (1 мерителна лъжичка)“." error={errors.servingSize}>
                    <TextInput value={form.servingSize} onChange={(e) => set("servingSize", e.target.value)} maxLength={120} />
                  </Field>
                  <Field label="Брой дози в опаковката" error={errors.servings}>
                    <TextInput value={form.servings} onChange={(e) => set("servings", e.target.value)} inputMode="numeric" placeholder="напр. 30" invalid={!!errors.servings} />
                  </Field>
                </div>
                <Field label="Състав" hint="Всички съставки в низходящ ред по количество. Алергените пишете с ГЛАВНИ букви, напр. „суроватъчен протеин (МЛЯКО)“." error={errors.ingredients}>
                  <TextArea rows={4} value={form.ingredients} onChange={(e) => set("ingredients", e.target.value)} maxLength={10000} />
                </Field>
                <Field label="Алергени" hint="Напр. „Мляко, соя“. Ако няма — напишете „Няма“." error={errors.allergens}>
                  <TextInput value={form.allergens} onChange={(e) => set("allergens", e.target.value)} maxLength={2000} />
                </Field>
                <Field label="Съдържание и хранителна стойност" group error={errors.nutrition}>
                  <NutritionEditor value={form.nutrition} onChange={(v) => set("nutrition", v)} kind={form.kind} invalid={!!errors.nutrition} />
                </Field>
                <Field label="Начин на употреба" hint="Как и кога се приема, с какво се смесва." error={errors.directions}>
                  <TextArea rows={3} value={form.directions} onChange={(e) => set("directions", e.target.value)} maxLength={5000} />
                </Field>
                <Field
                  label="Допълнителни предупреждения"
                  hint="Напр. „Съдържа кофеин. Не се препоръчва за деца и бременни жени.“ Стандартните предупреждения за хранителни добавки (да не се превишава дневната доза, не е заместител на разнообразното хранене, да се пази от деца) се показват автоматично."
                  error={errors.warnings}
                >
                  <TextArea rows={3} value={form.warnings} onChange={(e) => set("warnings", e.target.value)} maxLength={5000} />
                </Field>
                <Field label="Условия за съхранение" hint="Напр. „На сухо място при температура под 25 °C, далеч от пряка слънчева светлина.“" error={errors.storage}>
                  <TextArea rows={2} value={form.storage} onChange={(e) => set("storage", e.target.value)} maxLength={1000} />
                </Field>
              </div>
            </Card>
          </Section>

          <Section id="opisanie">
            <Card title="Описание" description="Показва се на страницата на продукта. Нов ред = нов абзац. Без здравни твърдения, които не са разрешени от ЕС (напр. „лекува“, „предпазва от болести“).">
              <Field label="Текст" group error={errors.description ?? errors.descriptionEn}>
                <L10nInput label="Описание" multiline rows={9} value={{ bg: form.description, en: form.descriptionEn }} onChange={(v) => update({ description: v.bg, descriptionEn: v.en })} maxLength={20000} />
              </Field>
            </Card>
          </Section>

          <Section id="snimki">
            <Card title="Снимки">
              <ImagesEditor images={form.images} onChange={(v) => set("images", v)} error={errors.images} />
            </Card>
          </Section>

          <Section id="variant">
            <Card title="Вариант: вкус и разфасовка" description="Когато един продукт се предлага с няколко вкуса или разфасовки, всеки вариант е отделен продукт със свой код, цена и наличност, а заедно образуват семейство.">
              <VariantPanel
                productId={meta.id}
                family={meta.family}
                familyMode={meta.familyMode}
                savedGroupKey={saved.groupKey}
                familyCardName={meta.familyCardName}
                value={{ flavour: form.flavour, flavourEn: form.flavourEn, size: form.size, groupKey: form.groupKey, familyName: form.familyName }}
                onChange={(patch) => update(patch)}
                errors={errors}
              />
            </Card>
          </Section>

          <Section id="tseli">
            <Card title="Цели и хранителен режим" description="По тях продуктът се намира в „Пазарувай по цел“ и във филтрите на сайта.">
              <div className="space-y-5">
                <Field label="Цели" group>
                  <ChipChoice label="Цели" options={goals} value={form.goals} onChange={(v) => set("goals", v)} />
                </Field>
                <Field label="Хранителен режим" group hint="Отбележете само ако е посочено на опаковката.">
                  <ChipChoice label="Хранителен режим" options={diets} value={form.diets} onChange={(v) => set("diets", v)} />
                </Field>
              </div>
            </Card>
          </Section>
        </div>

        <div className="min-w-0 space-y-5">
          <Section id="tsena">
            <Card title="Цена и наличност">
              <div className="space-y-4">
                <Field
                  label="Цена *"
                  error={errors.price}
                  hint={meta.demoPrice && form.price === saved.price ? "Това е примерна (демо) цена — въведете реалната." : "Редовната цена с ДДС."}
                >
                  <MoneyInput
                    value={form.price}
                    onChange={(v) =>
                      // The importer's placeholder sale goes away with the placeholder price (as on the server).
                      update(meta.demoPrice && saved.salePrice && form.salePrice === saved.salePrice ? { price: v, salePrice: "", saleEndsAt: "" } : { price: v })
                    }
                    invalid={!!errors.price}
                  />
                </Field>
                <Field
                  label={
                    <span className="flex items-center gap-2">
                      Промо цена
                      {off ? <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-black text-white">-{off}%</span> : null}
                    </span>
                  }
                  error={errors.salePrice}
                  hint="Намалена цена само за този продукт. Празно = без промо цена. Ако важи и промоция от „Цени и промоции“, клиентът плаща по-ниската."
                >
                  <div className="flex gap-2">
                    <div className="min-w-0 flex-1">
                      <MoneyInput value={form.salePrice} onChange={(v) => set("salePrice", v)} placeholder="няма" invalid={!!errors.salePrice} />
                    </div>
                    {form.salePrice ? (
                      <button type="button" onClick={() => update({ salePrice: "", saleEndsAt: "" })} className="btn btn-ghost h-12 w-12 !px-0" title="Махни промо цената" aria-label="Махни промо цената">
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </Field>
                {form.salePrice.trim() ? (
                  <Field label="Промо цената важи до" group error={errors.saleEndsAt} hint="Включително (българско време). Празно = докато не я махнете.">
                    <DateTimeInput label="Промо цената важи до" value={form.saleEndsAt} onChange={(v) => set("saleEndsAt", v)} defaultTime="23:59" invalid={!!errors.saleEndsAt} />
                  </Field>
                ) : null}
                <Field label="Наличност (брой)" error={errors.stock} hint="При 0 продуктът се показва като „Изчерпан“.">
                  <TextInput value={form.stock} onChange={(e) => set("stock", e.target.value)} inputMode="numeric" invalid={!!errors.stock} />
                </Field>
                <Toggle checked={!form.hidden} onChange={(v) => set("hidden", !v)} label="Показва се в сайта" description={form.hidden ? "Скрит — клиентите не го виждат." : "Клиентите виждат продукта."} />
              </div>

              {p ? (
                <div className="mt-5 space-y-3 border-t border-line pt-5">
                  <div className="rounded-2xl bg-canvas p-4">
                    <p className="text-xs font-extrabold uppercase tracking-wide text-muted">Сега в сайта</p>
                    <p className="mt-1 flex flex-wrap items-baseline gap-2">
                      <span className={clsx("text-2xl font-black", reduced && "text-brand")}>{eur(p.price)}</span>
                      {p.oldPrice != null ? <span className="text-sm font-bold text-muted line-through">{eur(p.oldPrice)}</span> : null}
                      {p.oldPrice != null ? <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-black text-white">-{discountPercent(p.price, p.oldPrice)}%</span> : null}
                    </p>
                    {p.promotion ? (
                      <p className="mt-2 flex items-start gap-1.5 text-sm font-bold text-brand">
                        <Tag className="mt-0.5 h-4 w-4 shrink-0" /> Промоция „{p.promotion.name}“ −{p.promotion.percent}%{p.promotion.endsAt ? ` до ${whenText(p.promotion.endsAt)}` : ""}
                      </p>
                    ) : null}
                    {!p.promotion && reduced && p.salePrice != null ? (
                      <p className="mt-2 text-sm font-bold text-brand">Промо цена{p.saleEndsAt ? ` до ${whenText(p.saleEndsAt)}` : ""}</p>
                    ) : null}
                    {saleExpired ? <p className="mt-2 text-sm font-bold text-muted">Промо цената е изтекла на {whenText(p.saleEndsAt!)}.</p> : null}
                    <p className="mt-2 text-sm text-ink-soft">
                      Най-ниска цена за последните 30 дни: <b className="text-ink">{(reduced ? p.lowest30 : p.omnibus) != null ? eur((reduced ? p.lowest30 : p.omnibus)!) : "—"}</b>
                    </p>
                    <p className="mt-1 text-xs text-muted">Зачертаната цена и % отстъпка в сайта се изчисляват от нея (изискване на закона).</p>
                  </div>
                  {meta.history ? <PriceHistory rows={meta.history.rows} total={meta.history.total} /> : null}
                </div>
              ) : null}
            </Card>
          </Section>

          <Card title="Проверка на етикета">
            {missing.length ? (
              <>
                <p className="mb-3 text-sm text-ink-soft">
                  {missing.some((m) => m.required)
                    ? "Тази информация е задължителна за храните, продавани онлайн. Попълнете я от опаковката:"
                    : "Задължителното е попълнено. Препоръчително е да добавите и:"}
                </p>
                <ul className="space-y-2">
                  {checklist.map((c) => (
                    <li key={c.key} className="flex items-start gap-2 text-sm">
                      {c.ok ? (
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-mint" strokeWidth={3} />
                      ) : c.required ? (
                        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                      ) : (
                        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                      )}
                      <span className={clsx(c.ok && "text-muted")}>
                        <span className={clsx("font-bold", !c.ok && c.required && "text-ink")}>{c.label}</span>
                        {!c.ok ? <span className="block text-xs text-muted">{c.hint}</span> : null}
                        {!c.ok && c.key === "manufacturer" ? (
                          <Link href={`/admin/proizvoditeli${saved.brand ? `?q=${encodeURIComponent(saved.brand)}` : ""}`} className="text-xs font-bold text-sky hover:underline">
                            Попълни в „Производители“ →
                          </Link>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="flex items-center gap-2 rounded-2xl bg-mint-soft p-3 text-sm font-bold text-mint">
                <Check className="h-4 w-4" strokeWidth={3} /> Етикетът е попълнен.
              </p>
            )}
          </Card>

          {mode === "edit" ? (
            <Card>
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Код (SKU)</dt>
                  <dd className="font-bold">{meta.sku}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Произход</dt>
                  <dd className="text-right font-bold">{meta.custom ? "Добавен ръчно" : "От файла на доставчика"}</dd>
                </div>
                {meta.sourceCategory && !meta.custom ? (
                  <div className="flex justify-between gap-3">
                    <dt className="shrink-0 text-muted">Категория във файла</dt>
                    <dd className="text-right font-bold">{meta.sourceCategory}</dd>
                  </div>
                ) : null}
                {meta.editedAt ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Ваша промяна</dt>
                    <dd className="font-bold">{formatDateTime(meta.editedAt, "bg")}</dd>
                  </div>
                ) : null}
                {meta.manufacturerName ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Производител</dt>
                    <dd className="text-right font-bold">{meta.manufacturerName}</dd>
                  </div>
                ) : null}
              </dl>
              <div className="mt-4 flex flex-col gap-2">
                {!saved.hidden && meta.slug ? (
                  <a href={`/produkt/${meta.slug}`} target="_blank" rel="noopener" className="btn btn-ghost h-11">
                    <ExternalLink className="h-4 w-4" /> Виж в сайта
                  </a>
                ) : null}
                {meta.canRestore ? (
                  <button type="button" onClick={restore} disabled={pending} className="btn btn-ghost h-11">
                    <RotateCcw className="h-4 w-4" /> Върни оригинала
                  </button>
                ) : null}
                {meta.custom ? (
                  <button type="button" onClick={remove} disabled={pending} className="btn h-11 border-2 border-brand-soft text-brand hover:bg-brand-soft">
                    <Trash2 className="h-4 w-4" /> Изтрий продукта
                  </button>
                ) : (
                  <p className="text-xs text-muted">
                    Продуктите от файла на доставчика не се изтриват — скрийте ги с „Показва се в сайта“. {meta.canRestore ? "„Върни оригинала“ отменя всички ваши промени." : ""}
                  </p>
                )}
              </div>
            </Card>
          ) : null}
        </div>
      </div>

      <SaveBar
        dirty={dirty || mode === "create"}
        pending={pending}
        status={status}
        onSave={save}
        onReset={
          mode === "edit"
            ? () => {
                setForm(saved);
                setErrors({});
                setStatus({ kind: "idle" });
              }
            : undefined
        }
        saveLabel={mode === "create" ? "Създай продукта" : "Запази промените"}
      />
    </>
  );
}
