// Privacy Policy (EN) — courtesy translation of privacy-bg.tsx (legal-content.md C.3-EN). Keep both in sync.
import Link from "next/link";
import type { LegalCtx } from "../legal-context";
import { DataTable, Ext, MailLink, PhoneLink, type LegalDoc } from "../prose";

export function privacyEn(ctx: LegalCtx): LegalDoc {
  const { store, company: c, policy: p } = ctx;
  const L = ctx.href;
  return {
    intro: <p>How we collect, use and protect your personal data when you shop at {store.name}, and what your rights are.</p>,
    sections: [
      {
        id: "administrator",
        title: "1. Who processes your data",
        body: (
          <>
            <p>
              The controller of your personal data is <strong>{c.legalName}</strong>, UIC {c.eik}, registered office {c.registeredAddress}.
            </p>
            <p>
              For questions about personal data, e-mail <MailLink email={store.privacyEmail} /> or call <PhoneLink ctx={ctx} />.
            </p>
            <p>We process data under the General Data Protection Regulation (EU) 2016/679 (GDPR) and the Bulgarian Personal Data Protection Act.</p>
          </>
        ),
      },
      {
        id: "danni",
        title: "2. What we process, why, and for how long",
        body: (
          <>
            <DataTable
              caption="Purposes, data, legal bases and retention periods"
              head={["Purpose", "Data", "Legal basis", "Retention"]}
              rows={[
                ["Customer account", "name, e-mail, hashed password, phone, delivery addresses, age (18+) declaration, preferences", "contract (Art. 6(1)(b) GDPR)", "until you delete the account"],
                [
                  "Orders, delivery, invoicing",
                  "name, phone, e-mail, delivery address or office, items, amounts, payment method, notes, invoice details",
                  "contract; legal obligation (Art. 6(1)(c))",
                  `${p.ordersYears} years from the order; accounting records for the periods required by Bulgarian accounting and tax law`,
                ],
                ["Age check for “18+” products", "declaration (checkbox), date and time", "legal obligation (Child Protection Act)", "with the order"],
                [
                  "Withdrawals, complaints, support (e-mail, phone, contact form, chat)",
                  "contact details, order number, messages, photos; for withdrawals also IP address, date and time",
                  "contract; legal obligation; legitimate interest in answering you and defending our rights (Art. 6(1)(f))",
                  `${p.casesYears} years after the case is closed; chat not linked to an order — ${p.chatMonths} months`,
                ],
                [
                  "Newsletter (confirmed by e-mail)",
                  `e-mail, language, date and time of the subscription and of its confirmation; unconfirmed requests are deleted after ${p.pendingNewsletterDays} days`,
                  "consent (Art. 6(1)(a))",
                  `until you unsubscribe; proof of consent up to ${p.consentProofYears} years after`,
                ],
                ["Security and abuse prevention", "IP address, browser, date and time, sign-in attempts", "legitimate interest (Art. 6(1)(f))", `up to ${p.logsMonths} months`],
                ["Cookies and browser storage", "see the Cookie Policy", "necessity / consent", "see the Cookie Policy"],
              ]}
            />
            <p>
              Order data are required to perform the contract; without them we cannot deliver your order. We do not use automated
              decision-making, including profiling, that produces legal effects for you.
            </p>
          </>
        ),
      },
      {
        id: "zdrave",
        title: "3. Health-related information",
        body: (
          <p>
            We do not ask for or collect information about your health. Please do not send us such information (e.g. diagnoses or
            medication) via the chat, the contact form or order notes. The contents of your orders are confidential, visible only to staff
            who process them, and never used for profiling or advertising without your explicit consent.
          </p>
        ),
      },
      {
        id: "poluchateli",
        title: "4. Who receives your data",
        body: (
          <>
            <ul>
              <li>couriers ({ctx.couriers}) — name, phone, delivery address or office and the cash-on-delivery amount;</li>
              <li>hosting and e-mail service providers under a data processing agreement with us;</li>
              <li>accountants, IT support and lawyers — where needed and under a duty of confidentiality;</li>
              <li>public authorities (National Revenue Agency, Consumer Protection Commission, BFSA, courts) where required by law.</li>
            </ul>
            <p>
              We do not sell personal data. If a provider processes data outside the European Union or the European Economic Area, this
              happens only with appropriate safeguards (e.g. EU standard contractual clauses).
            </p>
            <p>
              <strong>Product pictures.</strong> Some product pictures are loaded directly from the websites of the manufacturers and their
              suppliers. When your browser shows such a picture, that server receives the technical data every internet request carries —
              your IP address, the type of browser and the time. We do not send it the page you are viewing or any other data about you.
              These servers are run by the manufacturers and suppliers themselves, who are responsible for processing those data.
            </p>
          </>
        ),
      },
      {
        id: "sigurnost",
        title: "5. Security",
        body: <p>The site uses a secure connection (HTTPS). Passwords are stored as cryptographic hashes. Access to data is restricted to authorised staff.</p>,
      },
      {
        id: "prava",
        title: "6. Your rights",
        body: (
          <>
            <p>You have the right to:</p>
            <ul>
              <li>access your data;</li>
              <li>rectification;</li>
              <li>erasure (you can also delete your account yourself under “My account”);</li>
              <li>restriction of processing;</li>
              <li>data portability;</li>
              <li>object, including an absolute right to object to direct marketing;</li>
              <li>withdraw your consent at any time, without affecting processing before the withdrawal.</li>
            </ul>
            <p>
              Write to <MailLink email={store.privacyEmail} />; we reply within one month. You may complain to the Commission for Personal
              Data Protection: 2 Prof. Tsvetan Lazarov Blvd., 1592 Sofia, <MailLink email="kzld@cpdp.bg" />,{" "}
              <Ext href="https://cpdp.bg" lang={ctx.lang}>
                cpdp.bg
              </Ext>
              .
            </p>
          </>
        ),
      },
      {
        id: "nepalnoletni",
        title: "7. Minors",
        body: <p>The shop is intended for adults (18+) only. We do not knowingly collect data of minors; if we learn that we have, we delete it.</p>,
      },
      {
        id: "biskvitki",
        title: "8. Cookies",
        body: (
          <p>
            Which cookies and browser storage we use and how to change your choice is explained in the{" "}
            <Link href={L("/biskvitki")}>Cookie Policy</Link>.
          </p>
        ),
      },
      {
        id: "promeni",
        title: "9. Changes",
        body: <p>We will announce material changes to this policy on the site or by e-mail.</p>,
      },
    ],
  };
}
