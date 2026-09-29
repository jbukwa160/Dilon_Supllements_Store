// Returns and withdrawal (EN) — courtesy translation of returns-bg.tsx (legal-content.md C.6-EN). Keep both in sync.
import Link from "next/link";
import { PrintButton } from "../PrintButton";
import { WithdrawCta } from "../WithdrawCta";
import type { LegalCtx } from "../legal-context";
import { MailLink, Steps, YesNo, type LegalDoc } from "../prose";

export function returnsEn(ctx: LegalCtx): LegalDoc {
  const { store } = ctx;
  const L = ctx.href;
  return {
    intro: (
      <p>
        You may withdraw from a purchase within {ctx.returnDays} days without giving a reason. Unopened products in their original packaging
        can be returned.
      </p>
    ),
    before: (
      <>
        <WithdrawCta lang={ctx.lang} />
        <Steps
          items={[
            {
              title: "Tell us",
              text: (
                <>
                  Click “<Link href={L("/otkaz-ot-dogovor")}>Withdraw from the contract here</Link>”, e-mail <MailLink email={store.email} /> or
                  send the form below — before the {ctx.returnDays}-day period ends.
                </>
              ),
            },
            { title: "Send the items back", text: <>Without undue delay and no later than 14 days after notifying us, to: {ctx.returnAddress}.</> },
            { title: "Get your money back", text: "We refund you no later than 14 days after receiving your withdrawal." },
          ]}
        />
      </>
    ),
    sections: [
      {
        id: "koi-produkti",
        title: "1. What can be returned",
        body: (
          <>
            <YesNo
              yesLabel="You can return"
              noLabel="You cannot return"
              yes={["Unopened products with an intact seal, foil or ring, in the original packaging.", "Unused accessories (shakers, pill boxes, etc.)."]}
              no={[
                <>
                  <strong>Sealed products opened after delivery</strong> — food supplements, proteins, foods and drinks with an opened or
                  broken foil, seal or cap ring, and opened individual wrappers (bars, sachets). They cannot be returned for health-protection
                  and hygiene reasons (Art. 57(5) of the Bulgarian Consumer Protection Act).
                </>,
                "Products liable to deteriorate rapidly or with a short shelf life (Art. 57(4)), where stated on the product page.",
              ]}
            />
            <p>
              These exceptions do not affect your rights for faulty products — see “<a href="#defekt">Faulty, damaged or wrong item</a>”.
            </p>
          </>
        ),
      },
      {
        id: "srok",
        title: "2. Period",
        body: (
          <p>
            The period is {ctx.returnDays} days from the day you, or a person you designate (other than the courier), receive the goods. For
            split deliveries it runs from receipt of the last parcel. You can also withdraw before you receive the goods.
          </p>
        ),
      },
      {
        id: "pari",
        title: "3. Refunds",
        body: (
          <ul>
            <li>
              We refund all payments, including standard delivery. We do not refund the extra cost if you chose a delivery option more
              expensive than the cheapest standard one.
            </li>
            <li>
              We pay without undue delay and no later than 14 days after receiving your withdrawal. We may wait until we receive the items or
              proof that you have sent them, whichever is earlier.
            </li>
            <li>
              We refund using the same payment method you used; for cash on delivery by bank transfer to the IBAN you give us. The refund is
              free of charge.
            </li>
          </ul>
        ),
      },
      {
        id: "razhodi",
        title: "4. Costs and condition of the items",
        body: (
          <p>
            Direct return costs are borne by you. You are liable only for diminished value resulting from handling beyond what is necessary
            to establish the nature and characteristics of the goods.
          </p>
        ),
      },
      {
        id: "podaratsi",
        title: "5. Free gifts",
        body: (
          <p>
            If a partial withdrawal brings the value of the products you keep below a gift threshold, please return the gift unopened as well
            (<Link href={L("/obshti-usloviya#podaratsi")}>gift conditions</Link>).
          </p>
        ),
      },
      {
        id: "defekt",
        title: "6. Faulty, damaged or wrong item",
        body: (
          <p>
            Separately from the right of withdrawal you have a 2-year legal guarantee. E-mail us at <MailLink email={store.email} /> with your
            order number and a photo — we replace the product or refund you at no cost. Details in{" "}
            <Link href={L("/obshti-usloviya#garantsiya")}>section 10 of the Terms and Conditions</Link>.
          </p>
        ),
      },
      {
        id: "formular-info",
        title: "7. Model withdrawal form",
        body: (
          <>
            <p>
              You don’t have to use the form — you can use the “<Link href={L("/otkaz-ot-dogovor")}>Withdraw from the contract here</Link>”
              function or write to us in your own words. If you prefer, print the form below, fill it in and send it scanned or photographed
              to <MailLink email={store.email} />, or by post to {ctx.returnAddress}. We will acknowledge receipt by e-mail.
            </p>
            <div>
              <PrintButton />
            </div>
          </>
        ),
      },
    ],
  };
}
