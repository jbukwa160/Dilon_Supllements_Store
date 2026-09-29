// Доставка и плащане (BG) — legal-content.md C.5, with the couriers, prices, free-delivery threshold and delivery
// time from the settings. Payment: cash on delivery and bank transfer only (SPEC §2 — no cards).
import Link from "next/link";
import { DeliveryOptions } from "../DeliveryOptions";
import type { LegalCtx } from "../legal-context";
import { Callout, MailLink, type LegalDoc } from "../prose";

export function deliveryBg(ctx: LegalCtx): LegalDoc {
  const { shipping: sh } = ctx;
  const L = ctx.href;
  const approx = sh.mode === "courier" ? "ориентировъчно" : undefined;
  const freeScope = sh.freeScope === "office" ? " до офис или автомат" : "";
  const freeText = sh.freeOver
    ? sh.freeAll
      ? `Безплатна доставка${freeScope} за всяка поръчка`
      : `Безплатна доставка${freeScope} при поръчка на стойност ${sh.freeOver} или повече`
    : null;
  return {
    intro: (
      <p>
        Доставяме в цялата страна с {ctx.couriers} до офис, автомат или адрес за {ctx.deliveryDays}.{freeText ? ` ${freeText}.` : ""}
      </p>
    ),
    before: (
      <DeliveryOptions
        options={[
          { kind: "office", title: "До офис на куриер", text: `Вземате пратката от избран офис на ${ctx.couriers}.`, price: sh.office, priceNote: approx },
          { kind: "locker", title: "До автомат", text: "Еконтомат или автомат на Спиди — вземате пратката, когато ви е удобно.", price: sh.office, priceNote: approx },
          { kind: "address", title: "До адрес", text: "Куриерът носи пратката до посочения от вас адрес.", price: sh.address, priceNote: approx },
        ]}
        free={
          freeText
            ? { title: freeText, text: sh.freeAll ? "" : "Стойността на продуктите след отстъпките, без доставката и без подаръците." }
            : null
        }
      />
    ),
    sections: [
      {
        id: "tseni",
        title: "1. Цени на доставка",
        body: (
          <>
            <ul>
              <li>
                До офис или автомат на {ctx.couriers} — {approx ? `${approx} ` : ""}
                {sh.office}
              </li>
              <li>
                До адрес — {approx ? `${approx} ` : ""}
                {sh.address}
              </li>
              {sh.freeOver ? (
                <li>
                  <strong>Безплатна доставка</strong>
                  {freeScope}
                  {sh.freeAll
                    ? " за всяка поръчка"
                    : ` за поръчки на стойност ${sh.freeOver} или повече (стойността на продуктите след отстъпките, без доставката и без подаръците)`}
                </li>
              ) : null}
            </ul>
            <p>
              Цените са в евро с включен ДДС. Цената на доставката не е включена в цената на продуктите — показва се отделно в количката и
              преди да потвърдите поръчката.
              {sh.mode === "courier"
                ? " Точната цена се изчислява по тарифата на куриера според теглото на пратката и мястото на доставка. При наложен платеж тя включва и таксата на куриера за наложения платеж."
                : null}
            </p>
          </>
        ),
      },
      {
        id: "srok",
        title: "2. Срок на доставка",
        body: (
          <p>
            Обработваме поръчките в работни дни, по реда на получаването им. Срокът за доставка е {ctx.deliveryDays}. Когато изпратим
            пратката, ще получите номера на товарителницата, за да я проследите.
          </p>
        ),
      },
      {
        id: "kade",
        title: "3. Къде доставяме",
        body: (
          <p>
            Доставяме само на територията на България. Продуктите с отметка „18+“ предаваме само на пълнолетни лица — куриерът може да
            поиска документ за самоличност.
          </p>
        ),
      },
      {
        id: "plashtane",
        title: "4. Начини на плащане",
        body: (
          <>
            <ul>
              <li>
                <strong>Наложен платеж</strong> — плащате на куриера при получаване на пратката.
              </li>
              <li>
                <strong>Банков превод</strong> — изпращаме данните за плащане с имейла за потвърждение на поръчката. Изпращаме пратката,
                след като плащането постъпи по сметката ни.
              </li>
            </ul>
            <p>
              Ако желаете фактура, посочете данните за нея в бележката към поръчката или ни пишете на <MailLink email={ctx.store.email} />.
            </p>
          </>
        ),
      },
      {
        id: "sahranenie",
        title: "5. Съхранение по време на доставката",
        body: (
          <p>
            Продуктите пътуват в оригиналните си фабрични опаковки. В горещите месеци препоръчваме доставка до адрес или офис вместо до
            автомат и получаване на пратката възможно най-скоро. След получаване следвайте условията за съхранение на етикета.
          </p>
        ),
      },
      {
        id: "preglad",
        title: "6. Преглед при получаване",
        body: (
          <>
            <p>
              Можете да прегледате външно пратката и продуктите в присъствието на куриера. Ако пакетът е видимо повреден, отбележете това
              пред куриера.
            </p>
            <Callout tone="warning">
              <p>
                Моля, не отваряйте защитните фолиа и ленти при прегледа — разпечатаните след доставката запечатани продукти не подлежат на
                връщане при отказ от договора.
              </p>
            </Callout>
          </>
        ),
      },
      {
        id: "eko",
        title: "7. Доставка с по-малко въздействие върху околната среда",
        // [ЮРИСТ] Information on environmentally friendly delivery options required by the 2026 ЗИД на ЗЗП — final wording.
        body: <p>В момента не предлагаме отделна опция за доставка с намалено въздействие върху околната среда.</p>,
      },
      {
        id: "nepotarseni",
        title: "8. Непотърсени и отказани пратки",
        // [ЮРИСТ] Deduction of the delivery and return costs for unclaimed prepaid parcels.
        body: (
          <p>
            Ако не получите пратката, куриерът ще я върне при нас. При предплатена поръчка възстановяваме сумата, като може да приспаднем
            реалните разходи за доставката и връщането, освен ако не сте се отказали от договора по реда на „
            <Link href={L("/vrashtane")}>Връщане и отказ от поръчка</Link>“.
          </p>
        ),
      },
      {
        id: "vrashtane",
        title: "9. Връщане и рекламации",
        body: (
          <p>
            Как да се откажете от покупка и да върнете продукти — на страница „<Link href={L("/vrashtane")}>Връщане и отказ от поръчка</Link>
            “. За дефектен или сгрешен продукт вижте <Link href={L("/obshti-usloviya#garantsiya")}>раздел 10 от Общите условия</Link>.
          </p>
        ),
      },
    ],
  };
}
