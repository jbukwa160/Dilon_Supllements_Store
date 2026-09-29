// Cookie Policy (EN) — courtesy translation of cookies-bg.tsx (legal-content.md C.4-EN). Keep both in sync.
import Link from "next/link";
import { CookieSettingsButton } from "../CookieSettingsButton";
import type { LegalCtx } from "../legal-context";
import { DataTable, type LegalDoc } from "../prose";
import { COOKIE_NAMES as N } from "./cookie-names";

const code = (name: string) => <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[0.85em] text-ink">{name}</code>;

export function cookiesEn(ctx: LegalCtx): LegalDoc {
  const L = ctx.href;
  const necessary = "strictly necessary";
  const rows: React.ReactNode[][] = [
    [code(N.session), "first-party HttpOnly cookie", "keeps you signed in", "until the browser is closed, or 30 days with “Remember me”", necessary],
    [
      code(N.device),
      "signed HttpOnly cookie",
      "security: remembers that you have signed in from this browser before, so your sign-in is not slowed down while someone else tries to guess your password",
      "12 months",
      necessary,
    ],
    [code(N.orders), "HttpOnly signed cookie", "lets this browser see the confirmation of the orders it placed", "30 days", necessary],
    [code(N.consent), "cookie", "stores your cookie choice (version, categories, date)", "12 months", necessary],
    [code(N.lang), "cookie", "remembers your language (Bulgarian or English)", "12 months", necessary],
    [code(N.chat), "cookie", "created only if you use the chat; links your browser to the conversation", "90 days", necessary],
    [code(N.cart), "local storage", "cart contents and chosen free gifts", "until you clear it", necessary],
    [code(N.wishlist), "local storage", "your favourites", "until you clear it", necessary],
    [code(N.admin), "HttpOnly cookie", "staff sign-in to the admin panel; never set for visitors", "until the browser is closed, or 30 days with “Remember me”", necessary],
    [code(N.adminDevice), "signed HttpOnly cookie", "the same as " + N.device + " for staff in the admin panel; never set for visitors", "12 months", necessary],
  ];
  if (ctx.tracking.ga4)
    rows.push([
      <>
        {code("_ga")}, {code("_ga_*")}
      </>,
      "Google Analytics cookies (Google Ireland Ltd.)",
      "aggregate visit statistics",
      "up to 2 years",
      "analytics — only with consent",
    ]);
  if (ctx.tracking.metaPixel)
    rows.push([code("_fbp"), "Meta Pixel cookie (Meta Platforms Ireland Ltd.)", "ad measurement and ads on social networks", "3 months", "marketing — only with consent"]);

  const unused = <em>Not used at the moment.</em>;
  return {
    intro: <p>Which cookies and similar technologies {ctx.store.name} uses, what they are for and how you can change your choice at any time.</p>,
    sections: [
      {
        id: "kakvo-sa",
        title: "1. What cookies are",
        body: (
          <p>
            Cookies are small text files a website stores in your browser. We also use similar technologies such as the browser’s local
            storage (localStorage); below we call them all “cookies”. We use them in line with Art. 4a of the Bulgarian Electronic Commerce
            Act and the GDPR.
          </p>
        ),
      },
      {
        id: "kategorii",
        title: "2. Categories",
        body: (
          <>
            <ol>
              <li>
                <strong>Strictly necessary</strong> — required for the site to work: sign-in, cart, security, language and remembering your
                cookie choice. No consent is needed and they cannot be switched off.
              </li>
              <li>
                <strong>Functional</strong> — remember extra preferences for convenience (e.g. your recent searches on the site). Stored only
                if you allow them.
              </li>
              <li>
                <strong>Analytics</strong> — help us understand how the site is used through aggregate statistics.{" "}
                {ctx.tracking.ga4 ? "Loaded only after your consent." : unused}
              </li>
              <li>
                <strong>Marketing</strong> — used to measure and show interest-based ads on other websites and social networks.{" "}
                {ctx.tracking.metaPixel ? "Loaded only after your consent." : unused}
              </li>
            </ol>
            <p>Categories 2–4 are only ever loaded after your explicit consent. Before we start using a new cookie we add it to the table below.</p>
          </>
        ),
      },
      {
        id: "spisak",
        title: "3. Cookies and storage we use",
        body: (
          <>
            <DataTable caption="Cookies and browser storage" head={["Name", "Type", "Purpose", "Duration", "Category"]} rows={rows} />
            <p>
              {ctx.tracking.ga4 || ctx.tracking.metaPixel
                ? "Third-party cookies in the table load only if you allow the relevant category."
                : "We do not use third-party cookies."}{" "}
              Any future third-party content (e.g. videos or maps) will load only after you consent to the relevant category.
            </p>
          </>
        ),
      },
      {
        id: "upravlenie",
        title: "4. Managing cookies",
        body: (
          <>
            <p>
              You can change or withdraw your consent at any time with the button below or the “Cookie settings” link at the bottom of every
              page — withdrawing is as easy as giving consent. We keep your choice for 12 months and then ask again.
            </p>
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-canvas/60 p-4">
              <CookieSettingsButton />
            </div>
            <p>You can also clear cookies and local storage in your browser settings; this empties your cart and signs you out.</p>
            <p>
              More about personal data in our <Link href={L("/poveritelnost")}>Privacy Policy</Link>.
            </p>
          </>
        ),
      },
    ],
  };
}
