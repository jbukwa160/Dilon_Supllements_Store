// Delivery and payment (EN) — courtesy translation of delivery-bg.tsx (legal-content.md C.5-EN). Keep both in sync.
import Link from "next/link";
import { DeliveryOptions } from "../DeliveryOptions";
import type { LegalCtx } from "../legal-context";
import { Callout, MailLink, type LegalDoc } from "../prose";

export function deliveryEn(ctx: LegalCtx): LegalDoc {
  const { shipping: sh } = ctx;
  const L = ctx.href;
  const approx = sh.mode === "courier" ? "approx." : undefined;
  const freeScope = sh.freeScope === "office" ? " to an office or locker" : "";
  const freeText = sh.freeOver ? (sh.freeAll ? `Free delivery${freeScope} on every order` : `Free delivery${freeScope} on orders of ${sh.freeOver} or more`) : null;
  return {
    intro: (
      <p>
        We deliver nationwide with {ctx.couriers} to an office, a parcel locker or your address in {ctx.deliveryDays}.
        {freeText ? ` ${freeText}.` : ""}
      </p>
    ),
    before: (
      <DeliveryOptions
        options={[
          { kind: "office", title: "To a courier office", text: `Collect the parcel from a ${ctx.couriers} office of your choice.`, price: sh.office, priceNote: approx },
          { kind: "locker", title: "To a parcel locker", text: "An Econtomat or Speedy locker — collect the parcel whenever it suits you.", price: sh.office, priceNote: approx },
          { kind: "address", title: "To your address", text: "The courier brings the parcel to the address you give.", price: sh.address, priceNote: approx },
        ]}
        free={freeText ? { title: freeText, text: sh.freeAll ? "" : "Value of the products after discounts, excluding delivery and free gifts." } : null}
      />
    ),
    sections: [
      {
        id: "tseni",
        title: "1. Delivery prices",
        body: (
          <>
            <ul>
              <li>
                To a {ctx.couriers} office or locker — {approx ? `${approx} ` : ""}
                {sh.office}
              </li>
              <li>
                To your address — {approx ? `${approx} ` : ""}
                {sh.address}
              </li>
              {sh.freeOver ? (
                <li>
                  <strong>Free delivery</strong>
                  {freeScope}
                  {sh.freeAll ? " on every order" : ` on orders of ${sh.freeOver} or more (value of the products after discounts, excluding delivery and gifts)`}
                </li>
              ) : null}
            </ul>
            <p>
              Prices are in euro and include VAT. Delivery is not included in product prices — it is shown separately in the cart and before
              you confirm the order.
              {sh.mode === "courier"
                ? " The exact price is calculated from the courier’s tariff based on the parcel weight and the destination; for cash on delivery it includes the courier’s cash-on-delivery fee."
                : null}
            </p>
          </>
        ),
      },
      {
        id: "srok",
        title: "2. Delivery time",
        body: (
          <p>
            We process orders on working days, in the order received. Delivery takes {ctx.deliveryDays}. Once we ship the parcel, you
            receive the waybill number so you can track it.
          </p>
        ),
      },
      {
        id: "kade",
        title: "3. Where we deliver",
        body: <p>We deliver within Bulgaria only. “18+” products are handed only to adults — the courier may ask for ID.</p>,
      },
      {
        id: "plashtane",
        title: "4. Payment methods",
        body: (
          <>
            <ul>
              <li>
                <strong>Cash on delivery</strong> — you pay the courier when you receive the parcel.
              </li>
              <li>
                <strong>Bank transfer</strong> — the payment details are in the order confirmation e-mail. We ship the parcel once the
                payment reaches our account.
              </li>
            </ul>
            <p>
              If you need an invoice, give the invoice details in the order note or e-mail us at <MailLink email={ctx.store.email} />.
            </p>
          </>
        ),
      },
      {
        id: "sahranenie",
        title: "5. Storage in transit",
        body: (
          <p>
            Products travel in their original factory packaging. In hot weather we recommend delivery to an address or office rather than a
            locker, and collecting the parcel promptly. After delivery, follow the storage instructions on the label.
          </p>
        ),
      },
      {
        id: "preglad",
        title: "6. Inspection on delivery",
        body: (
          <>
            <p>You may inspect the parcel and the products in front of the courier. If the package is visibly damaged, note it with the courier.</p>
            <Callout tone="warning">
              <p>Please don’t break any safety seals or foils when inspecting — sealed products opened after delivery cannot be returned under the right of withdrawal.</p>
            </Callout>
          </>
        ),
      },
      {
        id: "eko",
        title: "7. Lower-impact delivery",
        body: <p>We currently do not offer a separate delivery option with a lower environmental impact.</p>,
      },
      {
        id: "nepotarseni",
        title: "8. Uncollected and refused parcels",
        body: (
          <p>
            If you don’t collect the parcel, the courier returns it to us. For a prepaid order we refund you and may deduct the actual delivery
            and return costs, unless you validly withdrew from the contract as described in “<Link href={L("/vrashtane")}>Returns and withdrawal</Link>”.
          </p>
        ),
      },
      {
        id: "vrashtane",
        title: "9. Returns and complaints",
        body: (
          <p>
            How to withdraw from a purchase and return products: see “<Link href={L("/vrashtane")}>Returns and withdrawal</Link>”. For a
            faulty or wrong product see <Link href={L("/obshti-usloviya#garantsiya")}>section 10 of the Terms and Conditions</Link>.
          </p>
        ),
      },
    ],
  };
}
