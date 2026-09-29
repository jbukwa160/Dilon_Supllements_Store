"use client";

import { useState } from "react";
import clsx from "clsx";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Image as ImageIcon,
  LayoutTemplate,
  Megaphone,
  Plus,
  Smartphone,
  Trash2,
} from "lucide-react";
import { saveHomeAction } from "@/app/admin/_actions/content";
import type { Lang } from "@/i18n/config";
import { loc, missingEn, type L10n } from "@/lib/l10n";
import { COUNT_TOKEN, COUNT_TOKEN_EN, SECTION_LABELS, THEMES, type HeroSlide, type HomeContent, type PromoCard } from "@/lib/settings-types";
import { HeroSlideView, type CollageProduct } from "@/components/home/HeroSlideView";
import { PromoCards } from "@/components/home/PromoCards";
import { Card, Field, ImageField, L10nInput, SaveBar, ThemePicker, Toggle, useEditor } from "./ui";
import { LinkPicker, type LinkOptions } from "./LinkPicker";
import { ClaimFlag, ClaimWarnings } from "./ClaimWarnings";

const newId = () => Math.random().toString(36).slice(2, 10);
const EMPTY: L10n = { bg: "", en: "" };
const MAX_SLIDES = 10;
const MAX_PROMOS = 6;

function move<T>(list: T[], i: number, d: number): T[] {
  const next = [...list];
  const [x] = next.splice(i, 1);
  next.splice(i + d, 0, x);
  return next;
}

function ListControls({
  index,
  count,
  onMove,
  onDuplicate,
  onRemove,
  enabled,
  onToggle,
  what,
}: {
  index: number;
  count: number;
  onMove: (d: number) => void;
  onDuplicate?: () => void;
  onRemove: () => void;
  enabled: boolean;
  onToggle: () => void;
  what: string;
}) {
  const btn = "grid h-9 w-9 place-items-center rounded-lg border border-line bg-white hover:border-ink disabled:opacity-30";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" onClick={onToggle} aria-pressed={enabled} className={clsx("btn h-9 px-3 text-sm", enabled ? "bg-mint-soft text-mint" : "bg-line text-muted")}>
        {enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />} {enabled ? "Показва се" : "Скрит"}
      </button>
      <button type="button" className={btn} disabled={index === 0} onClick={() => onMove(-1)} title="Премести нагоре" aria-label={`${what}: премести нагоре`}>
        <ArrowUp className="h-4 w-4" />
      </button>
      <button type="button" className={btn} disabled={index === count - 1} onClick={() => onMove(1)} title="Премести надолу" aria-label={`${what}: премести надолу`}>
        <ArrowDown className="h-4 w-4" />
      </button>
      {onDuplicate ? (
        <button type="button" className={btn} onClick={onDuplicate} title="Направи копие" aria-label={`${what}: направи копие`}>
          <Copy className="h-4 w-4" />
        </button>
      ) : null}
      <button
        type="button"
        className={clsx(btn, "text-brand hover:border-brand")}
        onClick={() => confirm(`Да изтрия ли „${what}“?`) && onRemove()}
        title="Изтрий"
        aria-label={`${what}: изтрий`}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

/** БГ | EN switch for a live preview. */
function PreviewLang({ value, onChange }: { value: Lang; onChange: (l: Lang) => void }) {
  return (
    <div role="radiogroup" aria-label="Език на прегледа" className="inline-flex gap-1 rounded-full bg-canvas p-1">
      {(["bg", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={value === l}
          onClick={() => onChange(l)}
          className={clsx("rounded-full px-3 py-1 text-xs font-black", value === l ? "bg-ink text-white" : "text-muted hover:text-ink")}
        >
          {l === "bg" ? "БГ" : "EN"}
        </button>
      ))}
    </div>
  );
}

function MissingTranslation({ values }: { values: L10n[] }) {
  return values.some(missingEn) ? <span className="rounded-full bg-sun-soft px-2 py-0.5 text-[0.7rem] font-bold text-ink">Липсва превод</span> : null;
}

/** One picture per language: English is optional (empty = the Bulgarian picture is shown). */
function L10nImage({ value, onChange, recommended }: { value: L10n; onChange: (v: L10n) => void; recommended: string }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div>
        <div className="mb-1.5 text-xs font-black text-muted">БГ</div>
        <ImageField value={value.bg} onChange={(bg) => onChange({ ...value, bg })} recommended={recommended} />
      </div>
      <div>
        <div className="mb-1.5 text-xs font-black text-muted">EN — по желание</div>
        <ImageField value={value.en} onChange={(en) => onChange({ ...value, en })} recommended="Празно = показва се българската снимка. Качете отделна, ако в нея има текст." />
      </div>
    </div>
  );
}

function slideTexts(s: HeroSlide): L10n[] {
  return [s.eyebrow, s.title, s.highlight, s.text, s.primary.label, s.secondary.label];
}

function SlideEditor({
  slide,
  onChange,
  linkOptions,
  collage,
  productCount,
  badge,
}: {
  slide: HeroSlide;
  onChange: (s: HeroSlide) => void;
  linkOptions: LinkOptions;
  collage: CollageProduct[];
  productCount: number;
  badge: Partial<Record<Lang, string>>;
}) {
  const [lang, setLang] = useState<Lang>("bg");
  const set = <K extends keyof HeroSlide>(k: K, v: HeroSlide[K]) => onChange({ ...slide, [k]: v });
  const textImage = slide.layout === "text-image";
  const preview = { ...slide, enabled: true, title: loc(slide.title, lang) ? slide.title : { bg: "Заглавие на банера", en: "" } };
  const mobile = loc(slide.mobileImage, lang);
  return (
    <div className="space-y-5">
      <Field group label="Вид банер">
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            { key: "text-image" as const, title: "Текст + снимка", text: "Заглавие, текст и бутони вляво, снимка вдясно. Без снимка — автоматичен колаж от популярни продукти.", icon: LayoutTemplate },
            { key: "image-only" as const, title: "Готова картинка", text: "Качвате готов банер (напр. направен в Canva) — цялата картинка е връзка.", icon: ImageIcon },
          ].map(({ key, title, text, icon: Icon }) => (
            <label key={key} className={clsx("flex cursor-pointer gap-3 rounded-2xl border-2 p-4 transition", slide.layout === key ? "border-brand bg-brand-soft/40" : "border-line hover:border-ink-soft")}>
              <input type="radio" className="sr-only" checked={slide.layout === key} onChange={() => set("layout", key)} />
              <Icon className="h-6 w-6 shrink-0 text-brand" />
              <span>
                <span className="block font-black">{title}</span>
                <span className="text-sm text-ink-soft">{text}</span>
              </span>
            </label>
          ))}
        </div>
      </Field>

      {textImage ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Field group label="Малък надпис над заглавието" hint={`По желание. ${COUNT_TOKEN} (на английски ${COUNT_TOKEN_EN}) се заменя с броя на продуктите.`}>
              <L10nInput value={slide.eyebrow} onChange={(v) => set("eyebrow", v)} label="Надпис над заглавието" maxLength={120} />
            </Field>
            <Field group label="Цвят на фона">
              <ThemePicker value={slide.theme} onChange={(v) => set("theme", v)} />
            </Field>
            <Field group label="Заглавие">
              <L10nInput value={slide.title} onChange={(v) => set("title", v)} label="Заглавие" maxLength={120} placeholder="напр. Протеини за всяка цел" />
            </Field>
            <Field group label="Оцветена част от заглавието" hint="Показва се след заглавието, подчертана в цвят. По желание.">
              <L10nInput value={slide.highlight} onChange={(v) => set("highlight", v)} label="Оцветена част" maxLength={80} placeholder="напр. до -30%" />
            </Field>
          </div>
          <Field group label="Текст под заглавието">
            <L10nInput value={slide.text} onChange={(v) => set("text", v)} label="Текст под заглавието" maxLength={400} multiline rows={2} />
          </Field>
          <div className="grid gap-4 rounded-2xl bg-canvas p-4 md:grid-cols-2">
            <div className="space-y-3">
              <Field group label="Главен бутон — надпис" hint="Оставете празно, ако не искате бутон.">
                <L10nInput value={slide.primary.label} onChange={(label) => set("primary", { ...slide.primary, label })} label="Главен бутон" maxLength={60} />
              </Field>
              <Field group label="Главен бутон — води към">
                <LinkPicker value={slide.primary.href} onChange={(href) => set("primary", { ...slide.primary, href })} options={linkOptions} />
              </Field>
            </div>
            <div className="space-y-3">
              <Field group label="Втори бутон — надпис" hint="По желание.">
                <L10nInput value={slide.secondary.label} onChange={(label) => set("secondary", { ...slide.secondary, label })} label="Втори бутон" maxLength={60} />
              </Field>
              <Field group label="Втори бутон — води към">
                <LinkPicker value={slide.secondary.href} onChange={(href) => set("secondary", { ...slide.secondary, href })} options={linkOptions} />
              </Field>
            </div>
          </div>
          <Field group label="Снимка вдясно" hint="По желание. Ако няма снимка, се показват 4 популярни продукта.">
            <L10nImage value={slide.image} onChange={(v) => set("image", v)} recommended="Препоръчително: PNG с прозрачен фон или квадратна снимка, около 1000×1000 px." />
          </Field>
        </>
      ) : (
        <>
          <Field group label="Банер за компютър" hint="Препоръчителен размер: 1920 × 640 px (широк).">
            <L10nImage value={slide.image} onChange={(v) => set("image", v)} recommended="1920 × 640 px, JPG/PNG/WebP до 10 MB." />
          </Field>
          <Field group label="Банер за телефон (по желание)" hint="Препоръчителен размер: 1080 × 1080 px. Ако липсва, на телефон се показва банерът за компютър.">
            <L10nImage value={slide.mobileImage} onChange={(v) => set("mobileImage", v)} recommended="1080 × 1080 px (квадрат)." />
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field group label="Описание на картинката" hint="За незрящи посетители и Google — какво пише на банера, напр. „Black Friday: -30% на протеините“.">
              <L10nInput value={slide.title} onChange={(v) => set("title", v)} label="Описание на картинката" maxLength={120} />
            </Field>
            <Field group label="При натискане води към">
              <LinkPicker value={slide.href} onChange={(href) => set("href", href)} options={linkOptions} />
            </Field>
          </div>
        </>
      )}

      <ClaimWarnings
        items={[
          { label: "Надпис над заглавието", value: slide.eyebrow },
          { label: textImage ? "Заглавие" : "Описание", value: slide.title },
          { label: "Оцветена част", value: slide.highlight },
          { label: "Текст", value: slide.text },
          { label: "Главен бутон", value: slide.primary.label },
          { label: "Втори бутон", value: slide.secondary.label },
        ]}
      />

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-sm font-extrabold text-muted">Преглед</span>
          <PreviewLang value={lang} onChange={setLang} />
        </div>
        <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <div className="shop-theme pointer-events-none overflow-hidden" aria-hidden>
            {/* zoom (unlike transform) also shrinks the space the preview takes */}
            <div style={{ zoom: 0.6 }}>
              <HeroSlideView slide={preview} lang={lang} productCount={productCount} collage={collage} badge={badge[lang]} inactive />
            </div>
          </div>
          {!textImage && mobile ? (
            <div className="w-40">
              <div className="mb-1 flex items-center gap-1 text-xs font-bold text-muted">
                <Smartphone className="h-3.5 w-3.5" /> Телефон
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mobile} alt="" referrerPolicy="no-referrer" className="aspect-[4/5] w-full rounded-xl border border-line object-cover" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PromoEditor({ card, onChange, linkOptions, autoImage }: { card: PromoCard; onChange: (c: PromoCard) => void; linkOptions: LinkOptions; autoImage: string | null }) {
  const set = <K extends keyof PromoCard>(k: K, v: PromoCard[K]) => onChange({ ...card, [k]: v });
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Field group label="Заглавие">
          <L10nInput value={card.title} onChange={(v) => set("title", v)} label="Заглавие" maxLength={80} />
        </Field>
        <Field group label="Надпис на бутона" hint="По желание.">
          <L10nInput value={card.buttonLabel} onChange={(v) => set("buttonLabel", v)} label="Надпис на бутона" maxLength={40} />
        </Field>
        <Field group label="Текст" className="md:col-span-2">
          <L10nInput value={card.text} onChange={(v) => set("text", v)} label="Текст" maxLength={200} />
        </Field>
        <Field group label="Води към" className="md:col-span-2">
          <LinkPicker value={card.href} onChange={(href) => set("href", href)} options={linkOptions} />
        </Field>
        <Field group label="Цвят">
          <ThemePicker value={card.theme} onChange={(v) => set("theme", v)} />
        </Field>
        <Field
          group
          label="Снимка"
          hint={autoImage && !card.image ? "Сега се ползва автоматичната снимка на избраната категория / цел / марка." : "По желание. Ако картата води към категория, цел или марка, снимката се взима автоматично."}
        >
          <ImageField compact value={card.image} onChange={(v) => set("image", v)} />
        </Field>
      </div>
      <ClaimWarnings
        items={[
          { label: "Заглавие", value: card.title },
          { label: "Текст", value: card.text },
          { label: "Бутон", value: card.buttonLabel },
        ]}
      />
    </div>
  );
}

export function HomeEditor({
  initial,
  linkOptions,
  collage,
  productCount,
  autoImages,
  heroBadge,
}: {
  initial: HomeContent;
  linkOptions: LinkOptions;
  collage: CollageProduct[];
  productCount: number;
  /** Automatic promo-card pictures by link ("/kategoria/proteini" → picture). */
  autoImages: Record<string, string | null>;
  /** The storefront's label under the hero collage ("Подарък над 40 €"), per language. */
  heroBadge: Partial<Record<Lang, string>>;
}) {
  const ed = useEditor(initial, saveHomeAction);
  const home = ed.value;
  const set = <K extends keyof HomeContent>(k: K, v: HomeContent[K]) => ed.setValue((h) => ({ ...h, [k]: v }));
  const [openSlide, setOpenSlide] = useState<string | null>(home.slides[0]?.id ?? null);
  const [openPromo, setOpenPromo] = useState<string | null>(null);
  const [promoLang, setPromoLang] = useState<Lang>("bg");

  const updateSlide = (i: number, s: HeroSlide) => set("slides", home.slides.map((x, j) => (j === i ? s : x)));
  const updatePromo = (i: number, c: PromoCard) => set("promos", home.promos.map((x, j) => (j === i ? c : x)));

  const addSlide = () => {
    const s: HeroSlide = {
      id: newId(),
      enabled: true,
      layout: "text-image",
      eyebrow: EMPTY,
      title: { bg: "Нов банер", en: "" },
      highlight: EMPTY,
      text: EMPTY,
      image: EMPTY,
      mobileImage: EMPTY,
      href: "",
      theme: "mint",
      primary: { label: { bg: "Разгледай", en: "Shop now" }, href: "/produkti" },
      secondary: { label: EMPTY, href: "" },
    };
    set("slides", [...home.slides, s]);
    setOpenSlide(s.id);
  };
  const addPromo = () => {
    const c: PromoCard = {
      id: newId(),
      enabled: true,
      title: { bg: "Нова карта", en: "" },
      text: EMPTY,
      image: "",
      href: "/promotsii",
      buttonLabel: { bg: "Виж", en: "See more" },
      theme: "mint",
    };
    set("promos", [...home.promos, c]);
    setOpenPromo(c.id);
  };

  const autoImage = Object.fromEntries(home.promos.map((p) => [p.id, autoImages[p.href] ?? null]));
  const a = home.announcement;
  const annTheme = THEMES[a.theme];

  return (
    <div className="space-y-6">
      <Card
        title={
          <span className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-brand" /> Обява над менюто
          </span>
        }
        description="Цветна лента най-отгоре на всяка страница — за кратки съобщения като „Безплатна доставка този уикенд“."
      >
        <div className="space-y-4">
          <Toggle checked={a.enabled} onChange={(v) => set("announcement", { ...a, enabled: v })} label="Показвай обявата" />
          {a.enabled ? (
            <>
              <Field group label="Текст">
                <L10nInput value={a.text} onChange={(text) => set("announcement", { ...a, text })} label="Текст на обявата" maxLength={200} />
              </Field>
              <Field group label="При натискане води към">
                <LinkPicker value={a.href} onChange={(href) => set("announcement", { ...a, href })} options={linkOptions} />
              </Field>
              <Field group label="Цвят">
                <ThemePicker value={a.theme} onChange={(v) => set("announcement", { ...a, theme: v })} />
              </Field>
              <ClaimWarnings items={[{ label: "Обява", value: a.text }]} />
              <div className="space-y-1.5">
                <div className="text-sm font-extrabold text-muted">Преглед</div>
                {(["bg", "en"] as const).map((l) => (
                  // .shop-theme sets the text colour itself, so the strip's colours go on an inner element.
                  <div key={l} className="shop-theme pointer-events-none">
                    <div
                      className={clsx("flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-center text-sm font-semibold", annTheme.dark ? "text-white" : "text-ink")}
                      style={{ background: annTheme.background }}
                    >
                      <span className="mr-1 rounded bg-black/10 px-1.5 text-[0.65rem] font-bold">{l === "bg" ? "БГ" : "EN"}</span>
                      {loc(a.text, l) || "Текст на обявата"} {a.href ? <ArrowRight className="h-4 w-4 shrink-0" /> : null}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </Card>

      <Card
        title="Банери (голямата снимка най-горе)"
        description="Ако има повече от един показан банер, те се сменят автоматично. Подредете ги със стрелките."
        actions={
          home.slides.length < MAX_SLIDES ? (
            <button type="button" onClick={addSlide} className="btn btn-primary h-11 px-5 !shadow-none">
              <Plus className="h-4 w-4" /> Добави банер
            </button>
          ) : null
        }
      >
        <div className="space-y-3">
          {home.slides.map((s, i) => {
            const thumb = s.image.bg;
            const name = s.title.bg || (s.layout === "image-only" ? "Готова картинка" : "Без заглавие");
            return (
              <div key={s.id} className={clsx("rounded-2xl border-2", openSlide === s.id ? "border-ink" : "border-line")}>
                <div className="flex flex-wrap items-center gap-3 p-3">
                  <button type="button" onClick={() => setOpenSlide(openSlide === s.id ? null : s.id)} className="flex min-w-[13rem] flex-1 items-center gap-3 text-left" aria-expanded={openSlide === s.id}>
                    <span className="grid h-12 w-20 shrink-0 place-items-center overflow-hidden rounded-lg" style={{ background: THEMES[s.theme].background }}>
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                      ) : (
                        <span className={clsx("text-xs font-black", THEMES[s.theme].dark && "text-white")}>{i + 1}</span>
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-black">{name}</span>
                        <MissingTranslation values={slideTexts(s)} />
                        <ClaimFlag values={slideTexts(s)} />
                      </span>
                      <span className="text-sm text-muted">
                        Банер {i + 1} · {s.layout === "image-only" ? "Готова картинка" : "Текст + снимка"}
                      </span>
                    </span>
                    <ChevronDown className={clsx("ml-auto h-5 w-5 shrink-0 text-muted transition", openSlide === s.id && "rotate-180")} />
                  </button>
                  <ListControls
                    index={i}
                    count={home.slides.length}
                    what={`Банер ${i + 1}`}
                    enabled={s.enabled}
                    onToggle={() => updateSlide(i, { ...s, enabled: !s.enabled })}
                    onMove={(d) => set("slides", move(home.slides, i, d))}
                    onDuplicate={
                      home.slides.length < MAX_SLIDES
                        ? () => set("slides", [...home.slides.slice(0, i + 1), { ...s, id: newId(), title: { ...s.title, bg: `${s.title.bg} (копие)` } }, ...home.slides.slice(i + 1)])
                        : undefined
                    }
                    onRemove={() => set("slides", home.slides.filter((_, j) => j !== i))}
                  />
                </div>
                {openSlide === s.id ? (
                  <div className="border-t border-line p-4 md:p-5">
                    <SlideEditor slide={s} onChange={(v) => updateSlide(i, v)} linkOptions={linkOptions} collage={collage} productCount={productCount} badge={heroBadge} />
                  </div>
                ) : null}
              </div>
            );
          })}
          {!home.slides.length ? <p className="rounded-2xl border-2 border-dashed border-line p-6 text-center text-ink-soft">Няма банери — началната страница започва с промо картите.</p> : null}
          <Field label="Смяна на банерите на всеки">
            <select className="field w-60 cursor-pointer" value={home.autoplaySeconds} onChange={(e) => set("autoplaySeconds", Number(e.target.value))}>
              <option value={0}>Без автоматична смяна</option>
              {[4, 5, 6, 8, 10, 15].map((n) => (
                <option key={n} value={n}>
                  {n} секунди
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      <Card
        title="Промо карти (под банерите)"
        description="До 6 цветни карти с връзки — към категория, марка, цел или промоция."
        actions={
          home.promos.length < MAX_PROMOS ? (
            <button type="button" onClick={addPromo} className="btn btn-primary h-11 px-5 !shadow-none">
              <Plus className="h-4 w-4" /> Добави карта
            </button>
          ) : null
        }
      >
        <div className="space-y-3">
          {home.promos.map((c, i) => (
            <div key={c.id} className={clsx("rounded-2xl border-2", openPromo === c.id ? "border-ink" : "border-line")}>
              <div className="flex flex-wrap items-center gap-3 p-3">
                <button type="button" onClick={() => setOpenPromo(openPromo === c.id ? null : c.id)} className="flex min-w-[13rem] flex-1 items-center gap-3 text-left" aria-expanded={openPromo === c.id}>
                  <span className="h-10 w-10 shrink-0 rounded-lg" style={{ background: THEMES[c.theme].background }} />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-black">{c.title.bg || "Без заглавие"}</span>
                      <MissingTranslation values={[c.title, c.text, c.buttonLabel]} />
                      <ClaimFlag values={[c.title, c.text, c.buttonLabel]} />
                    </span>
                    <span className="block truncate text-sm text-muted">{c.href || "без връзка"}</span>
                  </span>
                  <ChevronDown className={clsx("ml-auto h-5 w-5 shrink-0 text-muted transition", openPromo === c.id && "rotate-180")} />
                </button>
                <ListControls
                  index={i}
                  count={home.promos.length}
                  what={c.title.bg || `Карта ${i + 1}`}
                  enabled={c.enabled}
                  onToggle={() => updatePromo(i, { ...c, enabled: !c.enabled })}
                  onMove={(d) => set("promos", move(home.promos, i, d))}
                  onRemove={() => set("promos", home.promos.filter((_, j) => j !== i))}
                />
              </div>
              {openPromo === c.id ? (
                <div className="border-t border-line p-4 md:p-5">
                  <PromoEditor card={c} onChange={(v) => updatePromo(i, v)} linkOptions={linkOptions} autoImage={autoImages[c.href] ?? null} />
                </div>
              ) : null}
            </div>
          ))}
          {home.promos.some((p) => p.enabled && p.title.bg) ? (
            <div>
              <div className="mb-2 mt-4 flex items-center justify-between gap-2">
                <span className="text-sm font-extrabold text-muted">Преглед</span>
                <PreviewLang value={promoLang} onChange={setPromoLang} />
              </div>
              <div className="shop-theme pointer-events-none" aria-hidden>
                <div style={{ zoom: 0.75 }}>
                  <PromoCards promos={home.promos} lang={promoLang} autoImage={autoImage} />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </Card>

      <Card title="Какво да се показва на началната страница" description="Секциите се показват в този ред под банерите и промо картите.">
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(SECTION_LABELS) as (keyof HomeContent["sections"])[]).map((k) => (
            <Toggle key={k} checked={home.sections[k]} onChange={(v) => set("sections", { ...home.sections, [k]: v })} label={SECTION_LABELS[k]} />
          ))}
        </div>
      </Card>

      <SaveBar
        dirty={ed.dirty}
        pending={ed.pending}
        status={ed.status}
        onSave={ed.submit}
        onReset={ed.reset}
        extra={
          <a href="/" target="_blank" rel="noopener" className="btn btn-ghost h-12 px-5">
            <ExternalLink className="h-4 w-4" /> Виж сайта
          </a>
        }
      />
    </div>
  );
}
