"use client";

import clsx from "clsx";
import { BadgeCheck, Building2, Cookie, CreditCard, ImageOff, Info, RefreshCw, Share2, Store, Truck } from "lucide-react";
import { saveSettingsAction } from "@/app/admin/_actions/content";
import type { StoreSettings } from "@/lib/settings-types";
import { Card, Field, L10nInput, MoneyInput, SaveBar, TextInput, Toggle, useEditor } from "./ui";

// Numbers are edited as text ("3,99") and turned back into numbers when saving.
type Draft = Omit<StoreSettings, "shipping" | "returnDays"> & {
  shipping: { freeOn: boolean; freeOver: string; freeScope: StoreSettings["shipping"]["freeScope"]; office: string; address: string; mode: StoreSettings["shipping"]["mode"] };
  returnDays: string;
};

const txt = (n: number) => String(n).replace(".", ",");
const num = (s: string) => {
  const t = s.replace(/[\s€]/g, "").replace(",", ".");
  return t ? Number(t) : NaN;
};

function toDraft(s: StoreSettings): Draft {
  return {
    ...s,
    shipping: {
      freeOn: s.shipping.freeOver !== null,
      freeOver: s.shipping.freeOver === null ? "50" : txt(s.shipping.freeOver),
      freeScope: s.shipping.freeScope,
      office: txt(s.shipping.office),
      address: txt(s.shipping.address),
      mode: s.shipping.mode,
    },
    returnDays: String(s.returnDays),
  };
}

function Choice<T extends string>({ value, onChange, options, name }: { value: T; onChange: (v: T) => void; options: { key: T; title: string; text: string }[]; name: string }) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {options.map((o) => (
        <label key={o.key} className={clsx("cursor-pointer rounded-2xl border-2 p-4 transition", value === o.key ? "border-brand bg-brand-soft/40" : "border-line hover:border-ink-soft")}>
          <input type="radio" name={name} className="sr-only" checked={value === o.key} onChange={() => onChange(o.key)} />
          <span className="block font-black">{o.title}</span>
          <span className="text-sm text-ink-soft">{o.text}</span>
        </label>
      ))}
    </div>
  );
}

const Title = ({ icon: Icon, children }: { icon: typeof Store; children: React.ReactNode }) => (
  <span className="flex items-center gap-2">
    <Icon className="h-5 w-5 text-brand" /> {children}
  </span>
);

export function SettingsEditor({ initial }: { initial: StoreSettings }) {
  const ed = useEditor(toDraft(initial), async (d: Draft) => {
    const [freeOver, office, address, returnDays] = [d.shipping.freeOver, d.shipping.office, d.shipping.address, d.returnDays].map(num);
    if ((d.shipping.freeOn && !(freeOver >= 0)) || !(office >= 0) || !(address >= 0)) return { error: "Проверете цените за доставка — трябва да са 0 или повече (напр. 3,99)." };
    if (!Number.isInteger(returnDays) || returnDays < 14 || returnDays > 365) return { error: "Дните за връщане трябва да са цяло число от 14 до 365 (минимумът по закон е 14)." };
    return saveSettingsAction(
      {
        ...d,
        shipping: { freeOver: d.shipping.freeOn ? freeOver : null, freeScope: d.shipping.freeScope, office, address, mode: d.shipping.mode },
        returnDays,
      },
      // Only the fields changed here are saved (free delivery may have been changed in Цени и промоции meanwhile).
      initial,
    );
  });
  const s = ed.value;
  const set = (patch: Partial<Draft>) => ed.setValue((v) => ({ ...v, ...patch }));
  const setShipping = (patch: Partial<Draft["shipping"]>) => ed.setValue((v) => ({ ...v, shipping: { ...v.shipping, ...patch } }));
  const setCompany = (patch: Partial<Draft["company"]>) => ed.setValue((v) => ({ ...v, company: { ...v.company, ...patch } }));
  const setBank = (patch: Partial<Draft["bank"]>) => ed.setValue((v) => ({ ...v, bank: { ...v.bank, ...patch } }));
  const setSocial = (patch: Partial<Draft["social"]>) => ed.setValue((v) => ({ ...v, social: { ...v.social, ...patch } }));
  const setTracking = (patch: Partial<Draft["tracking"]>) => ed.setValue((v) => ({ ...v, tracking: { ...v.tracking, ...patch } }));
  const consentBumped = s.tracking.consentVersion !== initial.tracking.consentVersion;

  return (
    <div className="space-y-6">
      <Card title={<Title icon={Store}>Магазин и контакти</Title>}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Име на магазина" hint="Показва се в логото, заглавието на страниците и долу в сайта.">
            <TextInput value={s.name} onChange={(e) => set({ name: e.target.value })} maxLength={60} invalid={!s.name.trim()} />
          </Field>
          <Field group label="Кратко описание (подзаглавие)">
            <L10nInput value={s.tagline} onChange={(tagline) => set({ tagline })} label="Подзаглавие" maxLength={120} />
          </Field>
          <Field group label="Описание на магазина" hint="Показва се долу в сайта и в резултатите на Google." className="md:col-span-2">
            <L10nInput value={s.description} onChange={(description) => set({ description })} label="Описание на магазина" maxLength={400} multiline rows={2} />
          </Field>
          <Field label="Телефон">
            <TextInput value={s.phone} onChange={(e) => set({ phone: e.target.value })} maxLength={40} inputMode="tel" />
          </Field>
          <Field label="Имейл" hint="За въпроси на клиентите; копия на поръчките също идват тук.">
            <TextInput type="email" value={s.email} onChange={(e) => set({ email: e.target.value })} maxLength={120} />
          </Field>
          <Field group label="Адрес за кореспонденция" hint="Показва се в „Контакти“ и долу в сайта.">
            <L10nInput value={s.address} onChange={(address) => set({ address })} label="Адрес" maxLength={200} />
          </Field>
          <Field group label="Работно време">
            <L10nInput value={s.workingHours} onChange={(workingHours) => set({ workingHours })} label="Работно време" maxLength={120} />
          </Field>
        </div>
      </Card>

      <Card title={<Title icon={Truck}>Доставка и връщане</Title>}>
        <div className="space-y-5">
          <Field group label="Как се изчислява цената на доставката">
            <Choice
              name="shipping-mode"
              value={s.shipping.mode}
              onChange={(mode) => setShipping({ mode })}
              options={[
                { key: "courier", title: "Цена от куриера (препоръчително)", text: "Клиентът вижда точната цена на Спиди/Еконт за избрания офис или адрес. Ако куриерът не отговори, се ползват цените по-долу." },
                { key: "fixed", title: "Фиксирани цени", text: "Винаги се ползват цените по-долу, независимо от куриера и теглото." },
              ]}
            />
          </Field>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Фиксирана цена до офис / автомат">
              <MoneyInput value={s.shipping.office} onChange={(office) => setShipping({ office })} invalid={!(num(s.shipping.office) >= 0)} />
            </Field>
            <Field label="Фиксирана цена до адрес">
              <MoneyInput value={s.shipping.address} onChange={(address) => setShipping({ address })} invalid={!(num(s.shipping.address) >= 0)} />
            </Field>
            <Field group label="Срок за доставка" hint="Текст, напр. „1–3 работни дни“.">
              <L10nInput value={s.deliveryDays} onChange={(deliveryDays) => set({ deliveryDays })} label="Срок за доставка" maxLength={60} />
            </Field>
          </div>

          <div className="space-y-4 rounded-2xl bg-canvas p-4">
            <Toggle
              checked={s.shipping.freeOn}
              onChange={(freeOn) => setShipping({ freeOn })}
              label="Безплатна доставка над определена сума"
              description="Същата настройка е и в „Цени и промоции → Безплатна доставка“."
            />
            {s.shipping.freeOn ? (
              <div className="grid gap-4 md:grid-cols-[16rem_minmax(0,1fr)]">
                <Field label="Безплатна над" hint="Сумата на продуктите след намаленията. 0 = винаги безплатна.">
                  <MoneyInput value={s.shipping.freeOver} onChange={(freeOver) => setShipping({ freeOver })} invalid={!(num(s.shipping.freeOver) >= 0)} />
                </Field>
                <Field group label="За кои начини на доставка?">
                  <Choice
                    name="free-scope"
                    value={s.shipping.freeScope}
                    onChange={(freeScope) => setShipping({ freeScope })}
                    options={[
                      { key: "all", title: "За всички", text: "До офис, автомат и адрес." },
                      { key: "office", title: "Само до офис или автомат", text: "Доставката до адрес остава платена." },
                    ]}
                  />
                </Field>
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Дни за връщане" hint="Поне 14 дни по закон. Показва се в сайта и в „Общи условия“.">
              <TextInput value={s.returnDays} onChange={(e) => set({ returnDays: e.target.value.replace(/\D/g, "").slice(0, 3) })} inputMode="numeric" invalid={!(Number(s.returnDays) >= 14)} />
            </Field>
          </div>
          <Toggle
            checked={s.allowOutOfStockOrders}
            onChange={(v) => set({ allowOutOfStockOrders: v })}
            label="Разреши поръчки на изчерпани продукти"
            description="Ако е изключено, продуктите с наличност 0 не могат да се добавят в количката. Подаръците над сума никога не се дават, ако са изчерпани."
          />
        </div>
      </Card>

      <Card
        title={<Title icon={Building2}>Фирмени данни</Title>}
        description="Задължителни по закон за онлайн магазин. Показват се долу в сайта, в „Контакти“, „Общи условия“, „Политика за поверителност“ и на страниците на продуктите."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field group label="Наименование на фирмата" hint="Напр. „Дилон“ ООД. На английски — изписването на латиница от Търговския регистър (напр. Dilon OOD).">
            <L10nInput value={s.company.legalName} onChange={(legalName) => setCompany({ legalName })} label="Наименование на фирмата" maxLength={200} />
          </Field>
          <Field label="ЕИК">
            <TextInput value={s.company.eik} onChange={(e) => setCompany({ eik: e.target.value })} maxLength={40} inputMode="numeric" />
          </Field>
          <Field label="ДДС номер" hint="Празно, ако фирмата не е регистрирана по ДДС.">
            <TextInput value={s.company.vatNumber} onChange={(e) => setCompany({ vatNumber: e.target.value })} maxLength={40} placeholder="BG123456789" />
          </Field>
          <Field group label="Представляващ (управител)" hint="На английски — името на латиница.">
            <L10nInput value={s.company.representative} onChange={(representative) => setCompany({ representative })} label="Представляващ" maxLength={120} />
          </Field>
          <Field group label="Адрес на управление (седалище)" className="md:col-span-2">
            <L10nInput value={s.company.registeredAddress} onChange={(registeredAddress) => setCompany({ registeredAddress })} label="Адрес на управление" maxLength={300} />
          </Field>
          <Field group label="Регистрация по Закона за храните" hint="Номер и дата на удостоверението за регистрация на обекта (показва се в „Общи условия“).">
            <L10nInput value={s.company.foodRegistration} onChange={(foodRegistration) => setCompany({ foodRegistration })} label="Регистрация по Закона за храните" maxLength={200} />
          </Field>
          <Field label="Рег. № в БАБХ за търговия от разстояние" hint="Показва се долу в сайта и на страниците на продуктите.">
            <TextInput value={s.company.babhRegNo} onChange={(e) => setCompany({ babhRegNo: e.target.value })} maxLength={80} />
          </Field>
          <Field group label="Контролен орган" hint="Областната дирекция, издала регистрацията, напр. „ОДБХ – София-град“ (EN: Regional Food Safety Directorate – Sofia City).">
            <L10nInput value={s.company.babhAuthority} onChange={(babhAuthority) => setCompany({ babhAuthority })} label="Контролен орган" maxLength={120} />
          </Field>
          <Field label="Имейл за лични данни (GDPR)" hint="За искания за достъп и изтриване на данни. Празно = имейлът на магазина.">
            <TextInput type="email" value={s.company.privacyEmail} onChange={(e) => setCompany({ privacyEmail: e.target.value })} maxLength={120} />
          </Field>
          <Field group label="Адрес за връщане на стоки" hint="Празно = адресът за кореспонденция." className="md:col-span-2">
            <L10nInput value={s.company.returnAddress} onChange={(returnAddress) => setCompany({ returnAddress })} label="Адрес за връщане" maxLength={300} />
          </Field>
        </div>
      </Card>

      <Card title={<Title icon={CreditCard}>Банкова сметка</Title>} description="Показва се на клиентите, избрали „Банков превод“ — в потвърждението на поръчката и в имейла.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Титуляр">
            <TextInput value={s.bank.holder} onChange={(e) => setBank({ holder: e.target.value })} maxLength={120} />
          </Field>
          <Field label="Банка">
            <TextInput value={s.bank.bank} onChange={(e) => setBank({ bank: e.target.value })} maxLength={120} />
          </Field>
          <Field label="IBAN">
            <TextInput value={s.bank.iban} onChange={(e) => setBank({ iban: e.target.value.toUpperCase() })} maxLength={42} placeholder="BG80 BNBG 9661 1020 3456 78" className="font-mono" />
          </Field>
          <Field label="BIC">
            <TextInput value={s.bank.bic} onChange={(e) => setBank({ bic: e.target.value.toUpperCase() })} maxLength={20} placeholder="BNBGBGSD" className="font-mono" />
          </Field>
        </div>
        {!s.bank.iban.trim() ? <p className="mt-3 text-sm font-bold text-muted">Без IBAN плащането по банков път няма какво да покаже на клиента — попълнете го или не предлагайте този начин.</p> : null}
      </Card>

      <Card title={<Title icon={Share2}>Социални мрежи</Title>} description="Иконки долу в сайта. Празно = иконката не се показва.">
        <div className="grid gap-4 md:grid-cols-2">
          {(
            [
              ["facebook", "Facebook", "https://www.facebook.com/…"],
              ["instagram", "Instagram", "https://www.instagram.com/…"],
              ["tiktok", "TikTok", "https://www.tiktok.com/@…"],
              ["youtube", "YouTube", "https://www.youtube.com/@…"],
            ] as const
          ).map(([key, label, placeholder]) => (
            <Field key={key} label={label}>
              <TextInput type="url" value={s.social[key]} onChange={(e) => setSocial({ [key]: e.target.value.trim() })} maxLength={300} placeholder={placeholder} />
            </Field>
          ))}
        </div>
      </Card>

      <Card title={<Title icon={Cookie}>Бисквитки и анализи</Title>} description="Статистика (Google Analytics) и реклама (Meta Pixel).">
        <div className="space-y-5">
          <p className="flex items-start gap-2 rounded-2xl bg-sky-soft/60 p-4 text-[0.95rem]">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-sky" />
            <span>
              Скриптовете се зареждат <b>само след съгласие</b> на посетителя в банера за бисквитки: Google Analytics — при „Анализи“, Meta Pixel — при „Маркетинг“.
              Без ID полетата остават празни и нищо не се зарежда.
            </span>
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Google Analytics 4 — Measurement ID" hint="Във вида G-XXXXXXXXXX (Google Analytics → Администриране → Потоци от данни).">
              <TextInput value={s.tracking.ga4Id} onChange={(e) => setTracking({ ga4Id: e.target.value.trim().toUpperCase() })} maxLength={30} placeholder="G-XXXXXXXXXX" className="font-mono" />
            </Field>
            <Field label="Meta Pixel ID" hint="Само цифри (Meta Events Manager → Източници на данни).">
              <TextInput value={s.tracking.metaPixelId} onChange={(e) => setTracking({ metaPixelId: e.target.value.replace(/\D/g, "") })} maxLength={20} inputMode="numeric" placeholder="123456789012345" className="font-mono" />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-line p-4">
            <BadgeCheck className="h-6 w-6 shrink-0 text-mint" />
            <div className="min-w-0 flex-1">
              <div className="font-black">
                Версия на съгласието: {s.tracking.consentVersion}
                {consentBumped ? <span className="ml-2 rounded-full bg-sun-soft px-2 py-0.5 text-xs font-bold">след запазване</span> : null}
              </div>
              <p className="text-sm text-ink-soft">
                Ако добавите нов инструмент за статистика или реклама, поискайте съгласие отново — банерът за бисквитки ще се покаже на всички посетители при следващото им
                влизане.
              </p>
            </div>
            <button
              type="button"
              disabled={consentBumped}
              onClick={() => confirm("Банерът за бисквитки ще се покаже отново на всички посетители (след „Запази“). Продължаваме ли?") && setTracking({ consentVersion: s.tracking.consentVersion + 1 })}
              className="btn btn-ghost h-11 px-4"
            >
              <RefreshCw className="h-4 w-4" /> Поискай съгласие отново
            </button>
          </div>
        </div>
      </Card>

      <Card title={<Title icon={ImageOff}>Продукти в магазина</Title>}>
        <Toggle
          checked={s.hideNoImage}
          onChange={(v) => set({ hideNoImage: v })}
          label="Скрий продукти без снимка"
          description="Продуктите без снимка не се показват в списъците, търсенето, препоръките, подаръците и картата на сайта (страницата им остава достъпна по директен линк, но не се индексира от Google). В „Продукти“ в админ панела се виждат всички — там ги намирате с филтъра „Без снимка“ и им добавяте снимка."
        />
      </Card>

      <Card title="Демо известие">
        <Toggle
          checked={s.showDemoNotice}
          onChange={(v) => set({ showDemoNotice: v })}
          label="Показвай лентата „Демо версия“, докато има продукти с примерни цени"
          description="Изключете я, когато цените в сайта са реални."
        />
      </Card>

      <SaveBar dirty={ed.dirty} pending={ed.pending} status={ed.status} onSave={ed.submit} onReset={ed.reset} />
    </div>
  );
}
