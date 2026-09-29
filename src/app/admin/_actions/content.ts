"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getSettings, writeSetting } from "@/lib/settings";
import { normalizeHome, normalizeImage, normalizeMenu, normalizeSettings } from "@/lib/settings-normalize";
import { parseColor, safeHref, type HomeContent, type MenuConfig, type StoreSettings } from "@/lib/settings-types";
import type { L10n } from "@/lib/l10n";

type Result = { ok?: boolean; error?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Links must be site paths (/…), full http(s) addresses, mailto: or tel: — anything else is rejected, not silently dropped. */
function badLink(links: { where: string; href: unknown }[]): string | null {
  const bad = links.find((l) => typeof l.href === "string" && l.href.trim() && safeHref(l.href) === null);
  return bad ? `${bad.where}: невалиден линк „${String(bad.href).slice(0, 80)}“. Изберете страница от списъка или поставете адрес, започващ с https://` : null;
}

/** Pictures must be uploaded files or http(s) addresses. */
function badImage(images: { where: string; src: unknown }[]): string | null {
  const bad = images.find((i) => typeof i.src === "string" && i.src.trim() && !normalizeImage(i.src));
  return bad ? `${bad.where}: невалиден адрес на снимка. Качете снимката с „Качи снимка“ или поставете адрес, започващ с https://` : null;
}

const both = (v: L10n | undefined): { lang: string; src: unknown }[] => [
  { lang: "БГ", src: v?.bg },
  { lang: "EN", src: v?.en },
];

export async function saveHomeAction(input: HomeContent): Promise<Result> {
  await requireAdmin();
  const slides = Array.isArray(input?.slides) ? input.slides : [];
  const promos = Array.isArray(input?.promos) ? input.promos : [];
  const linkErr = badLink([
    { where: "Обява над менюто", href: input?.announcement?.href },
    ...slides.flatMap((s, i) => [
      { where: `Банер ${i + 1} — връзка на картинката`, href: s?.href },
      { where: `Банер ${i + 1} — главен бутон`, href: s?.primary?.href },
      { where: `Банер ${i + 1} — втори бутон`, href: s?.secondary?.href },
    ]),
    ...promos.map((p, i) => ({ where: `Промо карта ${i + 1}`, href: p?.href })),
  ]);
  if (linkErr) return { error: linkErr };
  const imageErr = badImage([
    ...slides.flatMap((s, i) => [
      ...both(s?.image).map((x) => ({ where: `Банер ${i + 1} — снимка (${x.lang})`, src: x.src })),
      ...both(s?.mobileImage).map((x) => ({ where: `Банер ${i + 1} — снимка за телефон (${x.lang})`, src: x.src })),
    ]),
    ...promos.map((p, i) => ({ where: `Промо карта ${i + 1} — снимка`, src: p?.image })),
  ]);
  if (imageErr) return { error: imageErr };
  const noPicture = slides.findIndex((s) => s?.enabled && s.layout === "image-only" && !String(s.image?.bg ?? "").trim());
  if (noPicture >= 0) return { error: `Банер ${noPicture + 1} е „Готова картинка“, но няма качена снимка за компютър. Качете снимка или скрийте банера.` };
  writeSetting("home", normalizeHome(input));
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function saveMenuAction(input: MenuConfig): Promise<Result> {
  await requireAdmin();
  const items = Array.isArray(input?.items) ? input.items : [];
  const label = (v: L10n | undefined) => String(v?.bg ?? "").trim();
  const linkErr = badLink(
    items.flatMap((it, i) => [
      { where: `„${label(it?.label) || `Елемент ${i + 1}`}“`, href: it?.href },
      ...(it?.columns ?? []).flatMap((c, ci) => [
        { where: `„${label(it?.label)}“, колона ${ci + 1}`, href: c?.href },
        ...(c?.links ?? []).map((l) => ({ where: `„${label(it?.label)}“ → „${label(l?.label)}“`, href: l?.href })),
      ]),
    ]),
  );
  if (linkErr) return { error: linkErr };
  const imageErr = badImage(items.flatMap((it) => (it?.columns ?? []).map((c, ci) => ({ where: `„${label(it?.label)}“, колона ${ci + 1} — снимка`, src: c?.image }))));
  if (imageErr) return { error: imageErr };
  const colors = [input?.categories?.color, ...items.flatMap((i) => [i?.appearance?.color, i?.appearance?.color2])];
  if (colors.some((c) => typeof c === "string" && !parseColor(c))) return { error: "Има невалиден цвят. Използвайте формат #0a6b5e или 10, 107, 94." };
  if (input?.categories?.show && !label(input.categories.label)) return { error: "Въведете надпис на бутона „Всички категории“." };
  const noLabel = items.findIndex((i) => !label(i?.label));
  if (noLabel >= 0) return { error: `Елемент ${noLabel + 1} от менюто няма надпис на български.` };
  const noHref = items.find((i) => i.kind === "link" && !String(i.href ?? "").trim());
  if (noHref) return { error: `„${label(noHref.label)}“ трябва да води някъде — изберете връзка.` };
  for (const it of items) {
    for (const c of it.columns ?? []) {
      const badSub = (c.links ?? []).find((l) => label(l.label) && !String(l.href ?? "").trim());
      if (badSub) return { error: `Връзката „${label(badSub.label)}“ в „${label(it.label)}“ няма адрес.` };
      const noText = (c.links ?? []).find((l) => String(l.href ?? "").trim() && !label(l.label));
      if (noText) return { error: `Има връзка без надпис в „${label(it.label)}“ — напишете надпис или я премахнете.` };
    }
  }
  writeSetting("menu", normalizeMenu(input));
  revalidatePath("/", "layout");
  return { ok: true };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Three-way merge of a settings form: a field the admin did not change (edited value = the value the form was loaded
 * with) keeps the value stored NOW, which someone may have changed meanwhile elsewhere — e.g. free delivery in
 * Цени и промоции while Настройки was open. Only the fields changed in this form are written.
 */
function changedOnly(stored: unknown, edited: unknown, loaded: unknown): unknown {
  if (same(edited, loaded)) return stored;
  if (isObject(edited) && isObject(loaded) && isObject(stored)) {
    const out: Record<string, unknown> = { ...stored };
    for (const key of Object.keys(edited)) out[key] = changedOnly(stored[key], edited[key], loaded[key]);
    return out;
  }
  return edited;
}

/** `loaded`: the settings the form was opened with (see changedOnly); without it the whole form is saved. */
export async function saveSettingsAction(input: StoreSettings, loaded?: StoreSettings): Promise<Result> {
  await requireAdmin();
  if (!String(input?.name ?? "").trim()) return { error: "Въведете име на магазина." };
  const email = String(input?.email ?? "").trim();
  if (email && !EMAIL_RE.test(email)) return { error: "Невалиден имейл на магазина." };
  const privacy = String(input?.company?.privacyEmail ?? "").trim();
  if (privacy && !EMAIL_RE.test(privacy)) return { error: "Невалиден имейл за лични данни." };
  const returnDays = Number(input?.returnDays);
  if (!Number.isInteger(returnDays) || returnDays < 14 || returnDays > 365) return { error: "Дните за връщане трябва да са цяло число от 14 до 365 (минимумът по закон е 14)." };
  const iban = String(input?.bank?.iban ?? "").replace(/\s+/g, "").toUpperCase();
  if (iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return { error: "Невалиден IBAN (пример: BG80 BNBG 9661 1020 3456 78)." };
  const social = input?.social ?? {};
  const badSocial = Object.entries(social).find(([, v]) => typeof v === "string" && v.trim() && !/^https:\/\/[^\s<>"']+$/i.test(v.trim()));
  if (badSocial) return { error: `Линкът към ${badSocial[0]} трябва да е пълен адрес, започващ с https://` };
  const ga4 = String(input?.tracking?.ga4Id ?? "").trim().toUpperCase();
  if (ga4 && !/^G-[A-Z0-9]{4,20}$/.test(ga4)) return { error: "Google Analytics ID трябва да е във вида G-XXXXXXXXXX." };
  const pixel = String(input?.tracking?.metaPixelId ?? "").trim();
  if (pixel && !/^\d{5,20}$/.test(pixel)) return { error: "Meta Pixel ID съдържа само цифри (напр. 123456789012345)." };
  const freeOver = input?.shipping?.freeOver;
  if (freeOver !== null && (typeof freeOver !== "number" || !Number.isFinite(freeOver) || freeOver < 0 || freeOver > 100000)) {
    return { error: "Проверете сумата за безплатна доставка (0 или повече, напр. 50)." };
  }
  const edited = normalizeSettings(input);
  writeSetting("store", loaded ? normalizeSettings(changedOnly(getSettings(), edited, normalizeSettings(loaded))) : edited);
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Free delivery only (Цени и промоции → Безплатна доставка): changes just these fields of the stored settings, so
 * it can't overwrite anything else someone changed in Настройки meanwhile.
 */
export async function saveFreeShippingAction(input: { freeOver: number | null; freeScope: "all" | "office" }): Promise<Result & { value?: StoreSettings["shipping"] }> {
  await requireAdmin();
  const freeOver = input?.freeOver;
  if (freeOver !== null && (typeof freeOver !== "number" || !Number.isFinite(freeOver) || freeOver < 0 || freeOver > 100000)) {
    return { error: "Въведете сума от 0 нагоре (напр. 50) — или изключете безплатната доставка." };
  }
  const current = getSettings();
  const next = normalizeSettings({
    ...current,
    shipping: { ...current.shipping, freeOver: freeOver === null ? null : Math.round(freeOver * 100) / 100, freeScope: input?.freeScope === "office" ? "office" : "all" },
  });
  writeSetting("store", next);
  revalidatePath("/", "layout");
  return { ok: true, value: next.shipping };
}
