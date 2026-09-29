"use client";

import { useState } from "react";
import clsx from "clsx";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Ban,
  ChevronDown,
  Columns3,
  ExternalLink,
  Image as ImageIcon,
  LayoutGrid,
  Link as LinkIcon,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { saveMenuAction } from "@/app/admin/_actions/content";
import type { Lang } from "@/i18n/config";
import { loc, missingEn, type L10n } from "@/lib/l10n";
import {
  DEFAULT_APPEARANCE,
  INK,
  MENU_ICONS,
  MENU_STYLES,
  contrastText,
  type MenuAppearance,
  type MenuColumn,
  type MenuConfig,
  type MenuItem,
  type MenuItemKind,
  type MenuStyle,
} from "@/lib/settings-types";
import { MenuLabel, menuItemProps } from "@/components/layout/MenuLabel";
import { MENU_ICON_COMPONENTS } from "@/components/layout/MenuIcon";
import { MenuColumnView } from "@/components/layout/NavDropdown";
import { Card, ColorField, Field, ImageField, L10nInput, SaveBar, Toggle, useEditor } from "./ui";
import { LinkPicker, type LinkOptions } from "./LinkPicker";

const newId = () => Math.random().toString(36).slice(2, 10);
const EMPTY: L10n = { bg: "", en: "" };
const MAX_ITEMS = 14;
const MAX_COLUMNS = 5;
const MAX_LINKS = 15;

/** Bulgarian names of the icons (the admin sees them as tooltips). */
const ICON_NAMES: Record<(typeof MENU_ICONS)[number], string> = {
  none: "Без иконка",
  gift: "Подарък",
  percent: "Процент",
  tag: "Етикет",
  star: "Звезда",
  sparkles: "Искри",
  flame: "Пламък",
  heart: "Сърце",
  dumbbell: "Дъмбел",
  zap: "Мълния (енергия)",
  leaf: "Листо",
  pill: "Капсула",
  shield: "Щит (имунитет)",
  moon: "Луна (сън)",
  sun: "Слънце",
  trophy: "Купа",
  target: "Цел",
  crown: "Корона",
  snowflake: "Снежинка",
  truck: "Камион (доставка)",
  bell: "Камбанка",
  book: "Книга",
};

const KIND_INFO: Record<MenuItemKind, { label: string; icon: typeof LinkIcon; help: string }> = {
  link: { label: "Връзка", icon: LinkIcon, help: "Бутон, който води към страница, категория, марка, цел, продукт…" },
  dropdown: { label: "Падащо меню с колони", icon: Columns3, help: "При посочване се отваря панел с колони от връзки или снимки." },
};

function move<T>(list: T[], i: number, d: number): T[] {
  const next = [...list];
  const [x] = next.splice(i, 1);
  next.splice(i + d, 0, x);
  return next;
}

const emptyColumn = (): MenuColumn => ({ id: newId(), kind: "links", title: EMPTY, href: "", image: "", links: [] });

function itemTexts(i: MenuItem): L10n[] {
  return [i.label, ...i.columns.flatMap((c) => [c.title, ...c.links.map((l) => l.label)])];
}

function StylePicker({ label, appearance, onChange }: { label: string; appearance: MenuAppearance; onChange: (s: MenuStyle) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Вид на бутона">
      {(Object.keys(MENU_STYLES) as MenuStyle[]).map((s) => {
        const a = { ...appearance, style: s };
        const p = menuItemProps(a);
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={appearance.style === s}
            onClick={() => onChange(s)}
            className={clsx("flex flex-col items-center gap-1.5 rounded-2xl border-2 bg-white p-2.5 transition", appearance.style === s ? "border-ink" : "border-line hover:border-ink-soft")}
          >
            <span className="shop-theme pointer-events-none">
              <span className={clsx(p.className, "!text-sm")} style={p.style}>
                <MenuLabel label={label || "Пример"} appearance={a} />
              </span>
            </span>
            <span className="text-xs font-bold text-muted">{MENU_STYLES[s]}</span>
          </button>
        );
      })}
    </div>
  );
}

function IconPicker({ value, onChange }: { value: MenuAppearance["icon"]; onChange: (v: MenuAppearance["icon"]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Иконка">
      {MENU_ICONS.map((name) => {
        const Icon = name === "none" ? Ban : MENU_ICON_COMPONENTS[name];
        return (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={value === name}
            aria-label={ICON_NAMES[name]}
            title={ICON_NAMES[name]}
            onClick={() => onChange(name)}
            className={clsx("grid h-10 w-10 place-items-center rounded-xl border-2 transition", value === name ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-ink-soft")}
          >
            <Icon className="h-[1.1rem] w-[1.1rem]" />
          </button>
        );
      })}
    </div>
  );
}

function ColumnEditor({
  column: c,
  index,
  count,
  onChange,
  onMove,
  onRemove,
  linkOptions,
}: {
  column: MenuColumn;
  index: number;
  count: number;
  onChange: (c: MenuColumn) => void;
  onMove: (d: number) => void;
  onRemove: () => void;
  linkOptions: LinkOptions;
}) {
  const set = <K extends keyof MenuColumn>(k: K, v: MenuColumn[K]) => onChange({ ...c, [k]: v });
  const small = "grid h-8 w-8 place-items-center rounded-lg border border-line bg-white hover:border-ink disabled:opacity-30";
  return (
    <div className="rounded-2xl border-2 border-line bg-canvas/60 p-4" role="group" aria-label={`Колона ${index + 1}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-black">Колона {index + 1}</span>
        <div className="flex overflow-hidden rounded-full border-2 border-line bg-white text-sm font-bold" role="radiogroup" aria-label="Вид колона">
          {(["links", "image"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={c.kind === k}
              onClick={() => set("kind", k)}
              className={clsx("flex items-center gap-1 px-3 py-1", c.kind === k ? "bg-ink text-white" : "hover:bg-canvas")}
            >
              {k === "links" ? <LinkIcon className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />} {k === "links" ? "Връзки" : "Снимка"}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-1">
          <button type="button" disabled={index === 0} onClick={() => onMove(-1)} className={small} aria-label="Колоната наляво">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button type="button" disabled={index === count - 1} onClick={() => onMove(1)} className={small} aria-label="Колоната надясно">
            <ArrowRight className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => confirm("Да изтрия ли колоната?") && onRemove()} className={clsx(small, "text-brand hover:border-brand")} aria-label="Изтрий колоната">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {c.kind === "links" ? (
        <div className="space-y-3">
          <Field group label="Заглавие на колоната" hint="По желание, напр. „По цел“.">
            <L10nInput value={c.title} onChange={(v) => set("title", v)} label="Заглавие на колоната" maxLength={60} />
          </Field>
          <Field group label="Заглавието води към (по желание)">
            <LinkPicker value={c.href} onChange={(h) => set("href", h)} options={linkOptions} />
          </Field>
          <div>
            <div className="mb-1.5 text-sm font-extrabold">Връзки</div>
            <ol className="space-y-2">
              {c.links.map((l, li) => (
                <li key={l.id} className="rounded-xl border border-line bg-white p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <L10nInput
                        value={l.label}
                        onChange={(label) => set("links", c.links.map((x) => (x.id === l.id ? { ...x, label } : x)))}
                        label={`Надпис на връзка ${li + 1}`}
                        placeholder="Надпис, напр. Креатин"
                        maxLength={60}
                      />
                    </div>
                    <button type="button" disabled={li === 0} onClick={() => set("links", move(c.links, li, -1))} className="mt-9 grid h-9 w-9 shrink-0 place-items-center rounded-lg hover:bg-canvas disabled:opacity-30" aria-label="Нагоре">
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={li === c.links.length - 1}
                      onClick={() => set("links", move(c.links, li, 1))}
                      className="mt-9 grid h-9 w-9 shrink-0 place-items-center rounded-lg hover:bg-canvas disabled:opacity-30"
                      aria-label="Надолу"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => set("links", c.links.filter((x) => x.id !== l.id))}
                      className="mt-9 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-brand hover:bg-brand-soft"
                      aria-label="Премахни връзката"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-2">
                    <LinkPicker value={l.href} onChange={(h) => set("links", c.links.map((x) => (x.id === l.id ? { ...x, href: h } : x)))} options={linkOptions} allowEmpty={false} />
                  </div>
                </li>
              ))}
            </ol>
            {c.links.length < MAX_LINKS ? (
              <button type="button" onClick={() => set("links", [...c.links, { id: newId(), label: EMPTY, href: "/produkti" }])} className="btn btn-ghost mt-2 h-10 px-4 text-sm">
                <Plus className="h-4 w-4" /> Добави връзка
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <Field group label="Снимка">
            <ImageField compact value={c.image} onChange={(v) => set("image", v)} recommended="Препоръчително: хоризонтална снимка, около 800 × 600 px." />
          </Field>
          <Field group label="Надпис под снимката">
            <L10nInput value={c.title} onChange={(v) => set("title", v)} label="Надпис под снимката" maxLength={60} />
          </Field>
          <Field group label="Снимката води към">
            <LinkPicker value={c.href} onChange={(h) => set("href", h)} options={linkOptions} />
          </Field>
        </div>
      )}
    </div>
  );
}

function ItemEditor({ item, onChange, linkOptions, lang }: { item: MenuItem; onChange: (i: MenuItem) => void; linkOptions: LinkOptions; lang: Lang }) {
  const set = <K extends keyof MenuItem>(k: K, v: MenuItem[K]) => onChange({ ...item, [k]: v });
  const setLook = (patch: Partial<MenuAppearance>) => onChange({ ...item, appearance: { ...item.appearance, ...patch } });
  const a = item.appearance;
  const accent = a.style === "plain" ? INK : a.color;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Field group label="Надпис" error={item.label.bg.trim() ? undefined : "Въведете надпис на български."}>
          <L10nInput value={item.label} onChange={(v) => set("label", v)} label="Надпис" maxLength={40} invalid={!item.label.bg.trim()} />
        </Field>
        <Field label="Вид" hint={KIND_INFO[item.kind].help}>
          <select
            className="field cursor-pointer"
            value={item.kind}
            onChange={(e) => {
              const kind = e.target.value as MenuItemKind;
              onChange({ ...item, kind, columns: kind === "dropdown" && !item.columns.length ? [emptyColumn()] : item.columns });
            }}
          >
            {(Object.keys(KIND_INFO) as MenuItemKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_INFO[k].label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {item.kind === "link" ? (
        <Field group label="Води към">
          <LinkPicker value={item.href} onChange={(h) => set("href", h)} options={linkOptions} allowEmpty={false} />
        </Field>
      ) : item.kind === "dropdown" ? (
        <Field group label="Връзка „Виж всички“ долу в панела (по желание)">
          <LinkPicker value={item.href} onChange={(h) => set("href", h)} options={linkOptions} />
        </Field>
      ) : null}

      <div className="rounded-2xl bg-canvas p-4">
        <div className="mb-3 text-sm font-black uppercase tracking-wide text-muted">Външен вид</div>
        <div className="space-y-4">
          <Field group label="Вид на бутона">
            <StylePicker label={loc(item.label, lang)} appearance={a} onChange={(style) => setLook({ style })} />
          </Field>
          {a.style !== "plain" ? (
            <div className={clsx("grid gap-4", a.style === "gradient" && "lg:grid-cols-2")}>
              <Field group label={a.style === "pill" ? "Цвят на бутона" : a.style === "gradient" ? "Начален цвят" : "Цвят"}>
                <ColorField value={a.color} onChange={(color) => setLook({ color })} />
              </Field>
              {a.style === "gradient" ? (
                <Field group label="Краен цвят">
                  <ColorField value={a.color2} onChange={(color2) => setLook({ color2 })} />
                </Field>
              ) : null}
            </div>
          ) : null}
          {a.style === "pill" ? (
            <p className="text-sm text-muted">Цветът на текста се избира автоматично ({contrastText(a.color) === "#ffffff" ? "бял" : "тъмен"}), за да се чете добре.</p>
          ) : null}
          <Field group label="Иконка (по желание)">
            <IconPicker value={a.icon} onChange={(icon) => setLook({ icon })} />
          </Field>
        </div>
      </div>

      {item.kind === "dropdown" ? (
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-lg font-black">Колони в падащото меню</div>
              <p className="text-sm text-muted">До {MAX_COLUMNS} колони: списък с връзки или снимка с връзка.</p>
            </div>
            {item.columns.length < MAX_COLUMNS ? (
              <button type="button" onClick={() => set("columns", [...item.columns, emptyColumn()])} className="btn btn-primary h-10 px-4 text-sm !shadow-none">
                <Plus className="h-4 w-4" /> Добави колона
              </button>
            ) : null}
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {item.columns.map((c, ci) => (
              <ColumnEditor
                key={c.id}
                column={c}
                index={ci}
                count={item.columns.length}
                onChange={(nc) => set("columns", item.columns.map((x) => (x.id === c.id ? nc : x)))}
                onMove={(d) => set("columns", move(item.columns, ci, d))}
                onRemove={() => set("columns", item.columns.filter((x) => x.id !== c.id))}
                linkOptions={linkOptions}
              />
            ))}
          </div>
          {item.columns.some((c) => (c.kind === "image" ? c.image : c.links.length || c.title.bg)) ? (
            <div className="mt-4">
              <div className="mb-2 text-sm font-extrabold text-muted">Преглед на панела</div>
              <div className="shop-theme pointer-events-none rounded-xl border border-line bg-white p-6 shadow-[var(--shadow-lift)]" aria-hidden>
                <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${Math.max(1, item.columns.length)}, minmax(0, 1fr))` }}>
                  {item.columns.map((c) => (
                    <MenuColumnView key={c.id} column={c} accent={accent} lang={lang} />
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function newItem(kind: MenuItemKind): MenuItem {
  return {
    id: newId(),
    kind,
    label: { bg: kind === "dropdown" ? "Ново меню" : "Нова връзка", en: "" },
    href: kind === "link" ? "/produkti" : "",
    appearance: { ...DEFAULT_APPEARANCE },
    columns: kind === "dropdown" ? [emptyColumn()] : [],
  };
}

export function MenuEditor({ initial, linkOptions }: { initial: MenuConfig; linkOptions: LinkOptions }) {
  const ed = useEditor(initial, saveMenuAction);
  const menu = ed.value;
  const [open, setOpen] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>("bg");
  const setItems = (fn: (items: MenuItem[]) => MenuItem[]) => ed.setValue((m) => ({ ...m, items: fn(m.items) }));

  const add = (kind: MenuItemKind) => {
    const it = newItem(kind);
    setItems((items) => [...items, it]);
    setOpen(it.id);
  };

  return (
    <div className="space-y-6">
      <Card
        title="Преглед"
        description="Така изглежда менюто в сайта (на компютър). Натиснете елемент, за да го редактирате."
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
        <div className="shop-theme flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-xl border border-line bg-white p-3">
          {menu.categories.show ? (
            <span
              className="flex min-h-11 items-center gap-2 whitespace-nowrap rounded-pill px-5 font-semibold"
              style={{ background: menu.categories.color, color: contrastText(menu.categories.color) }}
            >
              <LayoutGrid className="h-5 w-5" /> {loc(menu.categories.label, lang)} <ChevronDown className="h-4 w-4" />
            </span>
          ) : null}
          {menu.items.map((i) => {
            const p = menuItemProps(i.appearance, open === i.id);
            return (
              <button key={i.id} type="button" onClick={() => setOpen(open === i.id ? null : i.id)} className={clsx(p.className, open === i.id && "ring-2 ring-sky")} style={p.style}>
                <MenuLabel label={loc(i.label, lang) || "…"} appearance={i.appearance} />
                {i.kind !== "link" ? <ChevronDown className="h-4 w-4 opacity-60" /> : null}
              </button>
            );
          })}
        </div>
      </Card>

      <Card title="Бутон „Всички категории“" description="Големият бутон вляво, който отваря всички категории и цели.">
        <div className="space-y-4">
          <Toggle checked={menu.categories.show} onChange={(show) => ed.setValue((m) => ({ ...m, categories: { ...m.categories, show } }))} label="Показвай бутона" />
          {menu.categories.show ? (
            <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
              <Field group label="Надпис на бутона">
                <L10nInput value={menu.categories.label} onChange={(label) => ed.setValue((m) => ({ ...m, categories: { ...m.categories, label } }))} label="Надпис на бутона" maxLength={40} />
              </Field>
              <Field group label="Цвят на бутона">
                <ColorField value={menu.categories.color} onChange={(color) => ed.setValue((m) => ({ ...m, categories: { ...m.categories, color } }))} />
              </Field>
            </div>
          ) : null}
        </div>
      </Card>

      <Card
        title="Елементи на менюто"
        description="Добавяйте връзки и падащи менюта с колони. Подредете ги със стрелките."
        actions={
          menu.items.length < MAX_ITEMS ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => add("link")} className="btn btn-primary h-11 px-4 !shadow-none">
                <Plus className="h-4 w-4" /> Връзка
              </button>
              <button type="button" onClick={() => add("dropdown")} className="btn btn-primary h-11 px-4 !shadow-none">
                <Columns3 className="h-4 w-4" /> Падащо меню
              </button>
            </div>
          ) : null
        }
      >
        <ol className="space-y-3">
          {menu.items.map((item, i) => {
            const KindIcon = KIND_INFO[item.kind].icon;
            const p = menuItemProps(item.appearance);
            const isOpen = open === item.id;
            const name = item.label.bg || "Без надпис";
            return (
              <li key={item.id} className={clsx("rounded-2xl border-2", isOpen ? "border-ink" : "border-line")}>
                <div className="flex flex-wrap items-center gap-3 p-3">
                  <button type="button" onClick={() => setOpen(isOpen ? null : item.id)} className="flex min-w-[13rem] flex-1 items-center gap-3 text-left" aria-expanded={isOpen}>
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-canvas">
                      <KindIcon className="h-5 w-5" />
                    </span>
                    <span className="shop-theme pointer-events-none">
                      <span className={p.className} style={p.style}>
                        <MenuLabel label={name} appearance={item.appearance} />
                      </span>
                    </span>
                    <span className="hidden text-sm text-muted sm:inline">
                      {KIND_INFO[item.kind].label}
                      {item.kind === "dropdown" ? ` · ${item.columns.length} ${item.columns.length === 1 ? "колона" : "колони"}` : ""}
                    </span>
                    {itemTexts(item).some(missingEn) ? <span className="rounded-full bg-sun-soft px-2 py-0.5 text-[0.7rem] font-bold text-ink">Липсва превод</span> : null}
                    <ChevronDown className={clsx("ml-auto h-5 w-5 shrink-0 text-muted transition", isOpen && "rotate-180")} />
                  </button>
                  <div className="flex gap-1.5">
                    <button type="button" disabled={i === 0} onClick={() => setItems((items) => move(items, i, -1))} className="grid h-9 w-9 place-items-center rounded-lg border border-line hover:border-ink disabled:opacity-30" aria-label={`${name}: по-напред в менюто`}>
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={i === menu.items.length - 1}
                      onClick={() => setItems((items) => move(items, i, 1))}
                      className="grid h-9 w-9 place-items-center rounded-lg border border-line hover:border-ink disabled:opacity-30"
                      aria-label={`${name}: по-назад в менюто`}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => confirm(`Да премахна ли „${name}“ от менюто?`) && setItems((items) => items.filter((x) => x.id !== item.id))}
                      className="grid h-9 w-9 place-items-center rounded-lg border border-line text-brand hover:border-brand"
                      aria-label={`Премахни ${name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {isOpen ? (
                  <div className="border-t border-line p-4 md:p-5">
                    <ItemEditor item={item} onChange={(it) => setItems((items) => items.map((x) => (x.id === item.id ? it : x)))} linkOptions={linkOptions} lang={lang} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
        {!menu.items.length ? <p className="rounded-2xl border-2 border-dashed border-line p-6 text-center font-bold text-ink-soft">Менюто е празно. Добавете връзка.</p> : null}
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
