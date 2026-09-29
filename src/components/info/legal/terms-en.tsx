// Terms and Conditions (EN) — courtesy translation of terms-bg.tsx (legal-content.md C.2-EN). Keep both in sync.
// [ЮРИСТ] Draft; the Bulgarian version prevails.
import Link from "next/link";
import { GuaranteeNotice } from "../GuaranteeNotice";
import type { LegalCtx } from "../legal-context";
import { Callout, Ext, MailLink, MerchantBlock, PhoneLink, type LegalDoc } from "../prose";

export function termsEn(ctx: LegalCtx): LegalDoc {
  const { store, company: c, shipping: sh, gifts: g } = ctx;
  const L = ctx.href;
  return {
    intro: (
      <p>
        Terms of use of the {store.name} online shop and of purchases from it. Please read them before placing an order. This English
        version is a courtesy translation; the Bulgarian version prevails.
      </p>
    ),
    sections: [
      {
        id: "targovets",
        title: "1. Seller and supervisory authorities",
        body: (
          <>
            <p>The online shop {store.domain} is operated by:</p>
            <MerchantBlock ctx={ctx} />
          </>
        ),
      },
      {
        id: "obshti-polozheniya",
        title: "2. General",
        body: (
          <>
            <p>
              2.1. These terms govern the relationship between {c.legalName} (“we”, “the seller”) and the users of the {store.domain} online
              shop (“you”) when browsing the site, creating an account and buying products. They apply together with the Bulgarian Consumer
              Protection Act, Electronic Commerce Act, Food Act and the Act on the Supply of Digital Content and Digital Services and the Sale
              of Goods.
            </p>
            <p>2.2. The contract is concluded in Bulgarian. The English text is a courtesy translation; in case of discrepancy the Bulgarian text prevails.</p>
            <p>2.3. Orders may be placed only by adults (18 or over) and by businesses.</p>
            <p>
              2.4. By placing an order you confirm that you have read and accept these terms. Each order is governed by the terms published
              at the time it was placed.
            </p>
          </>
        ),
      },
      {
        id: "profil",
        title: "3. Customer account",
        body: (
          <>
            <p>3.1. You may shop with an account or as a guest.</p>
            <p>
              3.2. When you register you give an e-mail address and a password and confirm that you are 18 or over. Keep your password
              secret and tell us immediately if you suspect unauthorised access to your account.
            </p>
            <p>
              3.3. In your account you can see your orders and their status, manage your addresses and e-mail preferences, withdraw from a
              contract using the “<Link href={L("/otkaz-ot-dogovor")}>Withdraw from the contract here</Link>” function and delete your
              account at any time. Deleting the account does not affect data we are required to keep by law (e.g. invoices).
            </p>
            <p>
              3.4. We may restrict or close an account in case of abuse (e.g. repeatedly refusing cash-on-delivery parcels or false details),
              after notifying you.
            </p>
          </>
        ),
      },
      {
        id: "produkti",
        title: "4. Products and product information",
        body: (
          <>
            <p>
              4.1. Most products in the shop are food supplements and foods, including sports foods. They are not medicines and are not
              intended to diagnose, treat or prevent any disease.
            </p>
            <p>
              4.2. Each product page shows the mandatory food information: name, ingredients (with allergens highlighted), net quantity,
              recommended daily dose, active substances per daily dose, warnings, storage conditions, the responsible food business operator
              and, for food supplements, the registration number and date in the register of the Bulgarian Food Safety Agency (BFSA).
              Best-before dates are printed on the pack. We ship products with a sufficient remaining shelf life; if it is shorter than usual
              (e.g. a short-dated discount), the product page says so.
            </p>
            <p>
              4.3. Manufacturers sometimes change packs, labels or recipes. Always read the label of the product you receive before use. If
              the product you receive does not match its description, you have the rights described in section 10.
            </p>
            <p>
              4.4. Products marked “18+” (e.g. high-caffeine products under the Bulgarian Child Protection Act) are sold to adults only. By
              ordering them you declare that you are 18 or over. The courier may ask for ID and refuse to hand over the parcel to a minor.
            </p>
            <p>4.5. If you are pregnant, breastfeeding, ill or taking medication, consult a doctor before using food supplements.</p>
          </>
        ),
      },
      {
        id: "tseni",
        title: "5. Prices, promotions and free delivery",
        body: (
          <>
            <p>
              5.1. All prices are in euro (EUR) and include VAT. Delivery is not included in product prices; it is shown separately in the
              cart and before you confirm the order.
            </p>
            <p>
              5.2. When we announce a price reduction, we also show the previous price: the lowest price we applied to the product in the 30
              days before the reduction (Art. 15a of the Bulgarian Consumer Protection Act). The discount percentage is calculated from that
              price.
            </p>
            <p>5.3. Promotions run for the stated period or, where expressly stated, while stocks last.</p>
            {sh.freeOver ? (
              <p>
                {sh.freeAll ? "5.4. Delivery is free for every order" : `5.4. Delivery is free for orders of ${sh.freeOver} or more`}
                {sh.freeScope === "office" ? " delivered to a courier office or locker" : ""}.
                {sh.freeAll ? null : " The value is the sum of the products after all discounts, excluding delivery and free gifts."}
              </p>
            ) : (
              <p>5.4. We currently do not offer free delivery. The delivery price is shown before you confirm the order.</p>
            )}
            <p>
              5.5. If a price is published with an obvious technical error (e.g. €0.10 instead of €10.00), we will contact you before
              dispatch. You may accept the correct price or cancel the order at no cost; any payment already made is refunded in full.
            </p>
          </>
        ),
      },
      {
        id: "porachka",
        title: "6. Ordering and conclusion of the contract",
        body: (
          <>
            <p>6.1. Add products to the cart and proceed to checkout.</p>
            <p>
              6.2. Enter your contact details, delivery method and payment method. Delivery restrictions and accepted payment methods are
              shown at the start of checkout.
            </p>
            <p>
              6.3. Before sending the order you see a summary of items, quantities, the delivery price and the total. You can correct any
              entry by going back to the relevant step or to the cart.
            </p>
            <p>6.4. Press the “Order with obligation to pay” button.</p>
            <p>
              6.5. We immediately confirm receipt of the order by e-mail. The contract is concluded when we confirm the order by e-mail or
              phone, and at the latest when we dispatch it. The e-mail contains an order summary, withdrawal information and links to these
              terms and to the withdrawal function.
            </p>
            <p>
              6.6. We may decline an order if an item is unavailable, if adult age cannot be confirmed for “18+” items, or if abuse is
              reasonably suspected. In that case we notify you and refund any payment.
            </p>
          </>
        ),
      },
      {
        id: "plashtane",
        title: "7. Payment",
        body: (
          <>
            <p>7.1. We accept:</p>
            <ul>
              <li>
                <strong>Cash on delivery</strong> — you pay the courier when you receive the parcel.
              </li>
              <li>
                <strong>Bank transfer</strong> — the payment details are in the order confirmation e-mail. We dispatch the parcel once the
                payment reaches our account.
              </li>
            </ul>
            <p>
              7.2. If you need an invoice, give the invoice details in the order note or e-mail us at <MailLink email={store.email} />.
            </p>
          </>
        ),
      },
      {
        id: "dostavka",
        title: "8. Delivery",
        body: (
          <>
            <p>
              8.1. We deliver within Bulgaria with {ctx.couriers} to an office, a parcel locker or an address in {ctx.deliveryDays}. Prices,
              times and conditions are on the “<Link href={L("/dostavka")}>Delivery and payment</Link>” page.
            </p>
            <p>8.2. The risk of loss or damage passes to you when you, or a person you designate (other than the courier), receive the parcel.</p>
          </>
        ),
      },
      {
        id: "otkaz",
        title: "9. Right of withdrawal",
        body: (
          <>
            <p>
              9.1. You may withdraw from the contract within {ctx.returnDays} days of receiving the goods, without giving a reason and
              without any penalty.
            </p>
            <p>9.2. You can withdraw using:</p>
            <ul>
              <li>
                the “<Link href={L("/otkaz-ot-dogovor")}>Withdraw from the contract here</Link>” function (in your account or at{" "}
                {store.domain}/en/otkaz-ot-dogovor);
              </li>
              <li>
                an e-mail to <MailLink email={store.email} />;
              </li>
              <li>a letter to {store.address}.</li>
            </ul>
            <p>
              You may use the <Link href={L("/vrashtane#formular")}>model withdrawal form</Link>, but you don’t have to.
            </p>
            <p>
              9.3. <strong>The right of withdrawal does not apply</strong> to:
            </p>
            <ul>
              <li>
                sealed goods unsealed after delivery that cannot be returned for health-protection or hygiene reasons (Art. 57(5) of the
                Bulgarian Consumer Protection Act) — food supplements, foods and sports foods with an opened or broken seal, foil or cap ring,
                or an opened individual wrapper (bars, sachets);
              </li>
              <li>goods liable to deteriorate rapidly or with a short shelf life (Art. 57(4));</li>
              <li>goods inseparably mixed with other items after delivery (Art. 57(6)).</li>
            </ul>
            <p>Unopened products in their original packaging can be returned.</p>
            <p>
              9.4. We refund all payments received, including standard delivery, without undue delay and no later than 14 days after
              receiving your withdrawal. We may wait until we receive the goods or proof that you have sent them. Direct return costs are
              borne by you. Details, steps and the form are on the “<Link href={L("/vrashtane")}>Returns and withdrawal</Link>” page.
            </p>
          </>
        ),
      },
      {
        id: "garantsiya",
        title: "10. Legal guarantee and complaints",
        body: (
          <>
            <p>
              10.1. We are liable for any lack of conformity of the goods with the contract that becomes apparent within 2 years of delivery,
              under the Bulgarian Act on the Supply of Digital Content and Digital Services and the Sale of Goods. For foods and food
              supplements this includes fitness for use until the stated best-before date.
            </p>
            <p>
              10.2. In case of non-conformity you are entitled to a free replacement (or repair, where applicable) within a reasonable time.
              If that is impossible or not carried out, you are entitled to a proportionate price reduction or to terminate the contract.
            </p>
            <p>
              10.3. To make a claim, e-mail <MailLink email={store.email} /> or call <PhoneLink ctx={ctx} />. Give the order number, describe
              the problem and, if possible, attach a photo of the product showing the batch number and best-before date. We will reply
              without undue delay.
            </p>
            <p>10.4. If you notice visible damage to the parcel on delivery, describe it to the courier. This helps us but does not limit your rights.</p>
            <GuaranteeNotice lang={ctx.lang} id="terms-guarantee" className="mt-5" />
          </>
        ),
      },
      {
        id: "podaratsi",
        title: "11. Free gifts above an order value",
        body: (
          <>
            {g.active ? (
              <Callout tone="success" title="Current campaign">
                <p>
                  A free gift of your choice on orders of {g.thresholds}
                  {g.from || g.to ? ` (${g.from ? `from ${g.from}` : ""}${g.from && g.to ? " " : ""}${g.to ? `until ${g.to} inclusive` : ""})` : ""}.
                </p>
              </Callout>
            ) : (
              <p>When we run a “free gift above an order value” campaign, the following conditions apply.</p>
            )}
            <p>
              11.1. When the value of the products in your cart (after discounts, excluding delivery and gifts) reaches a published threshold,
              you may choose one free gift offered for that threshold.{" "}
              {g.mode === "single" ? "You receive one gift of your choice from the thresholds reached." : "You receive one gift for each threshold reached."}{" "}
              The gift is chosen in the cart and added to the order free of charge.
            </p>
            <p>11.2. Gifts are subject to availability and may change. They cannot be exchanged for other products or for cash.</p>
            <p>11.3. Gifts are factory-sealed products; their information is available via the “View product” link.</p>
            <p>11.4. Products marked “18+” are never offered as gifts.</p>
            <p>
              11.5. If you withdraw from part of the order and the value of the products you keep falls below the threshold, please return the
              gift unopened together with the returned products.
            </p>
            <p>11.6. A gift is not a price reduction and does not change the prices of the products in the order.</p>
          </>
        ),
      },
      {
        id: "otgovornost",
        title: "12. Liability",
        body: <p>We are not liable for damage caused by use of the products contrary to the label. Nothing in these terms limits your statutory rights.</p>,
      },
      {
        id: "lichni-danni",
        title: "13. Personal data and cookies",
        body: (
          <p>
            We process your personal data in line with our <Link href={L("/poveritelnost")}>Privacy Policy</Link>. Cookies and browser
            storage are described in the <Link href={L("/biskvitki")}>Cookie Policy</Link>.
          </p>
        ),
      },
      {
        id: "sporove",
        title: "14. Complaints and disputes",
        body: (
          <>
            <p>
              14.1. If you have a complaint, please contact us first at <MailLink email={store.email} />. We will do our best to find a
              solution.
            </p>
            <p>
              14.2. You may complain to the Consumer Protection Commission (4A Slaveykov Sq., 1000 Sofia, tel. 0700 111 22,{" "}
              <Ext href="https://kzp.bg" lang={ctx.lang}>
                kzp.bg
              </Ext>
              ).
            </p>
            <p>
              14.3. You may apply to the General Conciliation Committee at the Consumer Protection Commission for out-of-court dispute
              resolution (
              <Ext href="https://kzp.bg/bg/pomiritelna-komisiya/" lang={ctx.lang}>
                kzp.bg/bg/pomiritelna-komisiya
              </Ext>
              ).
            </p>
            <p>14.4. You may also go to the competent Bulgarian court.</p>
          </>
        ),
      },
      {
        id: "pravo",
        title: "15. Governing law and changes",
        body: (
          <p>
            Bulgarian law applies, without prejudice to the mandatory consumer protection rules of the country where you habitually reside.
            We may change these terms; changes do not affect orders already placed.
          </p>
        ),
      },
    ],
  };
}
