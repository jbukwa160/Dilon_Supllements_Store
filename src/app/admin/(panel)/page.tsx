import type { Metadata } from "next";
import Link from "next/link";
import { FileSpreadsheet, Gift, Images, MailWarning, MessagesSquare, PackagePlus, Percent, ShoppingBag, TriangleAlert, Truck } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getDashboardData } from "@/lib/admin/dashboard";
import { getSettings } from "@/lib/settings";
import { ORDER_STATUSES } from "@/lib/orders";
import { formatDateTime, formatPrice } from "@/lib/format";
import { PageHeader } from "@/components/admin/PageHeader";
import { DashboardBanner, QuickAction, SectionTitle, StatTile, StatusPill } from "@/components/admin/Dashboard";
import { ScrollArea } from "@/components/admin/ScrollArea";

export const metadata: Metadata = { title: "Табло" };

const eur = (n: number) => formatPrice(n, "bg");
const num = (n: number) => n.toLocaleString("bg-BG");
const orders = (n: number) => (n === 1 ? "1 поръчка" : `${num(n)} поръчки`);
const products = (n: number) => (n === 1 ? "1 продукт" : `${num(n)} продукта`);

export default async function DashboardPage() {
  const admin = await requireAdmin();
  const d = getDashboardData();
  const { hideNoImage } = getSettings();
  const g = d.giftTiers;

  return (
    <>
      <PageHeader title={`Здравейте, ${admin.username}!`} description="Кратък преглед на магазина: поръчки, продукти, промоции и подаръци. Натиснете плочка, за да отидете в съответния раздел." />

      {d.chats.unread > 0 ? (
        <DashboardBanner icon={MessagesSquare} tone="brand" href="/admin/chat" action="Към чата">
          {d.chats.unread === 1 ? "1 разговор в чата чака отговор." : `${num(d.chats.unread)} разговора в чата чакат отговор.`}
        </DashboardBanner>
      ) : null}
      {d.mail.failed > 0 ? (
        <DashboardBanner icon={MailWarning} tone="brand">
          Неизпратени имейли: {num(d.mail.failed)} — ще бъдат изпратени отново автоматично; проверете SMTP настройките на сървъра (файлът .env).
          {d.mail.lastAt ? <span className="block text-sm font-semibold text-ink-soft">Последен неуспешен опит: {formatDateTime(d.mail.lastAt, "bg")}</span> : null}
        </DashboardBanner>
      ) : null}
      {d.products.demo > 0 ? (
        <DashboardBanner icon={TriangleAlert} tone="sun" href="/admin/tseni?tab=excel" action="Качи цените">
          {products(d.products.demo)} в магазина все още {d.products.demo === 1 ? "е" : "са"} с примерни (демо) цени. Качете реалните цени от „Цени и промоции“ → „Цени от Excel“.
        </DashboardBanner>
      ) : null}
      {g.running && g.empty > 0 ? (
        <DashboardBanner icon={Gift} tone="sun" href="/admin/tseni?tab=podaratsi" action="Избери подаръци">
          {g.empty === 1 ? "1 праг за подарък няма" : `${g.empty} прага за подарък нямат`} наличен продукт за избор — клиентът, който го достигне, няма да получи подарък.
        </DashboardBanner>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Поръчки днес" value={num(d.orders.today.count)} sub={eur(d.orders.today.revenue)} href="/admin/poruchki" />
        <StatTile label="Последните 7 дни" value={num(d.orders.week.count)} sub={eur(d.orders.week.revenue)} href="/admin/poruchki" />
        <StatTile label="Последните 30 дни" value={num(d.orders.month.count)} sub={eur(d.orders.month.revenue)} href="/admin/poruchki" />
        <StatTile
          label="Чакат обработка"
          value={num(d.orders.toHandle)}
          sub={`нови · ${orders(d.orders.total)} общо`}
          href="/admin/poruchki?status=new"
          tone={d.orders.toHandle > 0 ? "attention" : undefined}
        />
      </div>
      <p className="mt-2 text-xs text-muted">Оборотът е с ДДС и доставка, без отказаните и върнатите поръчки.</p>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Продукти в магазина"
          value={num(d.products.inShop)}
          sub={
            <>
              {num(d.products.inShopInStock)} налични · {num(d.products.hiddenByAdmin)} скрити от вас
              {d.products.noImageOut ? <> · {num(d.products.noImageOut)} без снимка (не се показват)</> : null}
            </>
          }
          href="/admin/produkti?filter=visible"
        />
        <StatTile
          label="В промоция"
          value={num(d.products.sale)}
          sub={`${d.promotions.active === 1 ? "1 активна промоция" : `${num(d.promotions.active)} активни промоции`}${d.promotions.scheduled ? ` · ${num(d.promotions.scheduled)} насрочени` : ""}`}
          href="/admin/tseni?tab=promotsii"
        />
        <StatTile label="Регистрирани клиенти" value={num(d.customers.total)} sub={`+${num(d.customers.new30)} за 30 дни`} href="/admin/poruchki/klienti" />
        <StatTile
          label={d.freeShippingOver ? "Безплатна доставка над" : "Безплатна доставка"}
          value={d.freeShippingOver == null ? "Изключена" : d.freeShippingOver === 0 ? "Винаги" : eur(d.freeShippingOver)}
          sub="сума на продуктите в поръчката"
          href="/admin/tseni?tab=dostavka"
        />
      </div>

      <SectionTitle>Бързи действия</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <QuickAction href="/admin/tseni?tab=promotsii" icon={Percent} title="Нова промоция" text="% отстъпка за категория, марка или всичко" />
        <QuickAction href="/admin/nachalna" icon={Images} title="Банери" text="Снимки и текстове на началната страница" />
        <QuickAction href="/admin/tseni?tab=podaratsi" icon={Gift} title="Подаръци над сума" text="Подарък по избор при 40 / 60 / 80 €" />
        <QuickAction href="/admin/tseni?tab=dostavka" icon={Truck} title="Безплатна доставка" text="Сума, над която доставката е безплатна" />
        <QuickAction href="/admin/produkti/nov" icon={PackagePlus} title="Нов продукт" text="Продукт, който го няма във файла" />
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <SectionTitle href="/admin/poruchki" link="Всички поръчки">
            Последни поръчки
          </SectionTitle>
          {d.orders.recent.length ? (
            <ScrollArea className="rounded-3xl border border-line bg-white">
              <table className="w-full min-w-[560px] text-left text-[0.95rem]">
                <tbody className="divide-y divide-line">
                  {d.orders.recent.map((o) => (
                    <tr key={o.id} className="hover:bg-canvas">
                      <td className="px-5 py-3 font-black">
                        <Link href={`/admin/poruchki/${o.id}`} className="hover:text-brand">
                          №{o.number}
                        </Link>
                      </td>
                      <td className="px-2 py-3 text-ink-soft">{formatDateTime(o.createdAt, "bg")}</td>
                      <td className="px-2 py-3">{o.name}</td>
                      <td className="px-2 py-3 font-bold">{eur(o.total)}</td>
                      <td className="px-5 py-3 text-right">
                        <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${ORDER_STATUSES[o.status].color}`}>{ORDER_STATUSES[o.status].label}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          ) : (
            <div className="flex items-center gap-3 rounded-3xl border border-dashed border-line bg-white p-6 text-ink-soft">
              <ShoppingBag className="h-6 w-6" /> Все още няма поръчки.
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-5 lg:mt-[4.25rem]">
          <section className="rounded-3xl border border-line bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-lg font-black">
                <Gift className="h-5 w-5 text-brand" /> Подаръци над сума
              </h2>
              <StatusPill on={g.running ? (g.empty ? "warn" : true) : false}>{g.running ? "Активни" : !g.enabled ? "Изключени" : "Извън периода"}</StatusPill>
            </div>
            {g.tiers.length ? (
              <ul className="mt-3 space-y-2">
                {g.tiers.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 rounded-2xl bg-canvas px-3 py-2 text-sm">
                    <span className={t.enabled ? "font-bold" : "font-bold text-muted line-through"}>над {eur(t.threshold)}</span>
                    <span className={t.enabled && !t.available ? "font-bold text-brand" : "text-ink-soft"}>
                      {t.gifts ? `${t.gifts === 1 ? "1 подарък" : `${t.gifts} подаръка`}${t.available < t.gifts ? ` (${t.available} налични)` : ""}` : "няма избрани подаръци"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted">Няма прагове.</p>
            )}
            <p className="mt-3 text-xs text-muted">
              {g.mode === "perTier" ? "Клиентът избира по един подарък за всеки достигнат праг." : "Клиентът избира един подарък от достигнатите прагове."}
              {g.window ? ` Период: ${g.window}.` : ""}
            </p>
            <Link href="/admin/tseni?tab=podaratsi" className="btn btn-ghost mt-3 h-10 w-full text-sm">
              Настрой подаръците
            </Link>
          </section>

          <section className="rounded-3xl border border-line bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-lg font-black">
                <MessagesSquare className="h-5 w-5 text-brand" /> Чат
              </h2>
              <StatusPill on={d.chats.unread ? "warn" : true}>{d.chats.unread ? `${num(d.chats.unread)} непрочетени` : "Няма чакащи"}</StatusPill>
            </div>
            {d.chats.latest.length ? (
              <ul className="mt-3 space-y-2">
                {d.chats.latest.map((c) => (
                  <li key={c.id}>
                    <Link href="/admin/chat" className="block rounded-2xl bg-canvas px-3 py-2 text-sm hover:bg-line/60">
                      <span className="flex justify-between gap-2">
                        <b className="truncate">{c.name}</b>
                        <span className="shrink-0 text-xs text-muted">{formatDateTime(c.at, "bg")}</span>
                      </span>
                      {c.text ? <span className="line-clamp-2 text-ink-soft">{c.text}</span> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted">Всички съобщения са прочетени.</p>
            )}
          </section>

          <section className="rounded-3xl border border-line bg-white p-5 text-sm">
            <h2 className="flex items-center gap-2 text-lg font-black">
              <FileSpreadsheet className="h-5 w-5 text-brand" /> Каталог
            </h2>
            {/* Same numbers as the filters they link to (Продукти → Покажи). */}
            <ul className="mt-3 space-y-1.5 text-ink-soft">
              <li className="flex justify-between gap-3">
                <span>Всички продукти</span> <b className="text-ink">{num(d.products.total)}</b>
              </li>
              <li className="flex justify-between gap-3">
                <Link href="/admin/produkti?filter=visible" className="hover:text-brand">
                  Показват се в магазина
                </Link>
                <b className="text-ink">{num(d.products.inShop)}</b>
              </li>
              <li className="flex justify-between gap-3">
                <Link href="/admin/produkti?filter=hidden" className="hover:text-brand">
                  Скрити от вас
                </Link>
                <b className="text-ink">{num(d.products.hiddenByAdmin)}</b>
              </li>
              <li className="flex justify-between gap-3">
                <Link href="/admin/produkti?filter=noimage" className="hover:text-brand">
                  {hideNoImage ? "Без снимка — не се показват" : "Без снимка"}
                </Link>
                <b className="text-ink">{num(d.products.noImage)}</b>
              </li>
              <li className="flex justify-between gap-3">
                <Link href="/admin/produkti?filter=demo" className="hover:text-brand">
                  С демо цена
                </Link>
                <b className="text-ink">{num(d.products.demoAll)}</b>
              </li>
              <li className="flex justify-between gap-3">
                <Link href="/admin/produkti?filter=custom" className="hover:text-brand">
                  Добавени ръчно
                </Link>
                <b className="text-ink">{num(d.products.custom)}</b>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
