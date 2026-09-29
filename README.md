# Dilon Nutrition — sports nutrition store

A Bulgarian / English e-shop for **sports nutrition and fitness products** (protein, creatine, amino acids,
pre-workouts, weight management, sports food, sports vitamins, gym accessories), built from the Dilon product export
(`entire products_export (9).csv`), with a Bulgarian admin panel for non-technical staff.
Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4, data in SQLite (`better-sqlite3`, FTS5 search),
e-mail with `nodemailer`.

## Quick start

```bash
npm install                              # .npmrc: ignore-scripts=true (see below)
npm run import                           # CSV → data/catalog.db (≈35 s, 13 845 products)
npm run admin:user -- --user admin       # create the admin login (prints a password)
npm run dev                              # http://localhost:3000  ·  admin: http://localhost:3000/admin
# production (set NEXT_PUBLIC_SITE_URL in .env.local BEFORE building — it is baked into the build):
npm run build && npm start               # or: npm run build && npx next start -p 3950
```

- **`.npmrc` has `ignore-scripts=true`.** better-sqlite3 ships prebuilt binaries, but npm would still run
  `node-gyp rebuild` for it and fail on machines without a C++ toolchain. No dependency needs its install script;
  `npm run …` scripts are not affected. If you ever need a native rebuild: `npm rebuild better-sqlite3 --ignore-scripts=false`.
- Copy `.env.example` to `.env.local` for the optional settings (site address, couriers, SMTP, proxy) — everything
  works locally without it. Checks: `npx tsc --noEmit -p .`, `npx eslint src scripts`, `npx next build`.

## What gets imported (fitness only)

The shop sells **fitness products only**. The scope is one list, `IMPORTED_CATEGORIES` in `src/lib/taxonomy.ts`:

| Category | Imported |
| --- | --- |
| Протеини, Креатин, Аминокиселини, Предтренировъчни и енергия, Спортни аксесоари | everything the classifier puts there |
| Отслабване | fat burners, L-carnitine, CLA / appetite control, meal replacements (sports brands / words only) — no detox |
| Здравословни храни | protein bars & snacks, nut butters, oats / pancakes, zero syrups & sweeteners, protein drinks (sports products only) |
| Витамини и минерали | 10 subcategories (multivitamins, D, C, B, zinc, magnesium, iron, calcium…) — sports brands / words only |

Everything else (health & immunity, herbs, beauty, omega, joints, hormonal health, medicines, cosmetics,
electronics, pets, clothing, junk food…) is dropped by `scripts/lib/classify*.ts` and the scope. Current numbers:
438 006 rows → **13 845 products → 8 432 cards** (families of flavours / sizes); 6 659 products / **4 715 cards have
a picture** and are shown while "Скрий продукти без снимка" is on. 450 brands; `/marki` lists the 231 with at least
2 cards in the shop (`getBrands()`; `getBrands({ minCount: 1 })` = all). `data/import-report.txt` has the full counts.

The built-in categories outside the scope stay in the taxonomy (Admin → Категории marks them "Извън асортимента"),
have no page (404) and are not offered in the link pickers. Moving products into one in the admin brings it back.
Goals ("Цели") with fewer than 25 cards (`MIN_GOAL_CARDS` in `src/lib/catalog.ts`, e.g. Красота, Сърце) are not
listed in the menu, on the home page, `/tseli` or the sitemap; their `/tsel/…` page still opens.

```bash
npm run import                                             # default CSV ../entire products_export (9).csv
npm run import -- --csv "D:/path/export.csv" --prices data/prices.csv
npm run import -- --vacuum                                 # also compact catalog.db (locks it a few seconds: run when quiet)
```

- **Safe while the site runs**: the catalogue is built in a temporary file and copied into the live `catalog.db`
  (WAL) in one transaction, which also re-applies admin edits saved during the import; a failed import leaves the
  live catalogue untouched. At the end the importer asks the running site to refresh its cached pages
  (`SITE_INTERNAL_URL`, see Environment).
- **Ids and URLs never change**: `sku_registry` keeps the id / slug of every SKU ever imported (also ones that left
  the scope), and ids of deleted products are never reused (`_last_product_id`).
- Admin product edits are re-applied after every import — **except stock: the CSV is the stock authority**; a stock
  edited in the admin lasts until the next import.
- Flavours: `src/lib/flavours.ts` is the BG ↔ EN dictionary (synonyms are merged, sizes rounded for the chips);
  Admin → Продукти shows how many flavours still lack an English name.
- Family names: the card name is the members' name without flavour / size; Admin → Продукти → product → Вариант →
  "Име на семейството" overrides it for the whole family (empty = automatic).

## Prices

The export has **no prices**: the importer uses `data/prices.csv` (or `--prices <file>`) and, for SKUs not in it,
deterministic **placeholder prices** — the site then shows the purple "Демо версия" bar and the dashboard counts them.

| `prices.csv` | |
| --- | --- |
| Columns (header row) | `sku` (or `код` / `артикул`; or `ean` / `баркод` instead), `price` (`цена`), optional `old_price` (`стара цена`, `compare_at_price`) and `sale_price` (`промо цена`) |
| Separators | comma, semicolon or tab (detected from the header), quoted values allowed |
| Numbers | `24,90` · `24.90` · `1 234,50` · `1.234,50` · `1,234.50` · `24,90 €` — one separator followed by exactly 3 digits is a thousands separator (`1,299` = 1299). Same parser as the admin (`parseMoney`) |
| Meaning | `old_price` above `price` → `price` is a sale price and `old_price` the regular one; `sale_price` below `price` → sale |
| Bad lines | skipped and listed in the import output / report — never guessed |

Real prices can also come from Цени и промоции → Цени от Excel (download → edit → upload with a preview that warns
about changes over ±50 %; the stock column is opt-in) or per product in Продукти. The demo bar disappears when no
visible product has a placeholder price (or switch it off in Настройки).

## Languages

- **Bulgarian is the main language** and lives at the root (`/produkti`, `/produkt/…`); **English** is under `/en`
  with the same path segments. `/bg/…` redirects to the root. No redirect by browser language; the switch in the
  header remembers the choice. Pages send a `Content-Language` header.
- Interface texts are typed dictionaries (`src/i18n/messages/*.ts`; a missing English key fails the type check).
  Admin texts (banners, menu, gift tiers, company data…) have БГ / EN fields — an empty English field falls back to
  Bulgarian. **The admin panel is Bulgarian only.** (English polish is not a priority for now; `/en` works.)

## Admin panel (`/admin`)

| Section | What the admin can do |
| --- | --- |
| Табло | Orders today / 7 / 30 days (with VAT and delivery, without cancelled / returned), waiting orders, products in the shop (in stock, hidden, without a picture), products on sale, demo-price warning, customers, free-delivery threshold, failed e-mails banner, shortcuts |
| Продукти | Search / filter; price, promo price, stock, visibility in the table (card layout below 1280 px); bulk actions; full editor: names БГ/EN, brand, category, photos, flavour / size, **family and family name**, label data, kind, 18+, БАБХ reg. no., goals, diets; price history; add products; restore to the supplier data |
| Категории | Categories and subcategories (order, names, taglines, icon, colours, picture, hide) — out-of-scope ones are marked; goals (thin goals are marked "Под 25 продукта") |
| Производители | Food business operator per brand — shown on every product page of the brand |
| Цени и промоции | **Промоции** (% for everything / categories / brands / goals / SKUs, start / end, preview with the real % range, optional nearest-,99, badge); **Подаръци над сума**; **Безплатна доставка**; **Цени от Excel** |
| Начална страница | Announcement bar, hero carousel, promo cards, home sections |
| Меню | Menu items, dropdowns, styles, icons (link picker offers only pages that exist) |
| Блог | Articles BG / EN with product cards, SEO fields, scheduling |
| Поръчки | Orders (gift lines, typed-town badge, withdrawals, status + note); **Клиенти**; **Абонати** — confirmed newsletter addresses only, CSV export |
| Чат | Conversations from the chat bubble |
| Настройки | Store, contacts, company and БАБХ data (БГ / EN), delivery prices and mode, free delivery, returns, "Скрий продукти без снимка", bank, social, analytics IDs, consent version, demo notice. Saving writes only the fields of this page (a threshold changed meanwhile in Цени и промоции is kept) |
| Профил и парола | Change the admin password (signs out other devices) |

Every save refreshes the cached pages of both languages.

### Logins

```bash
npm run admin:user -- --user admin                    # create, or reset a forgotten password (random, printed once)
npm run admin:user -- --user admin --password "…"     # choose the password (10+ chars, letters and digits)
npm run admin:user -- --list
npm run admin:user -- --delete --user someone
```

Passwords are hashed with scrypt; sessions are random tokens (stored hashed) in httpOnly SameSite=Lax cookies
(`sp_admin` scoped to `/admin`, `sp_session` for customers; Secure over HTTPS), 12 h or 30 days with "Запомни ме".
Brute-force protection (`src/lib/login-guard.ts`, admin and customers alike):

| Counter | Rule |
| --- | --- |
| Per visitor IP | 10 failures in 15 min → that IP is locked for 15 min (whatever accounts were tried) |
| Per account | no hard lock (strangers can't lock the owner out); after 5 failures in 24 h a growing wait: 2 s, 4 s, 8 s … up to 15 min |
| Known device | a browser that signed in to the account before (`sp_dev` / `sp_admin_dev` cookie, void after a password change) skips both; 10 failures → that browser waits 15 min |

Registration, password reset, withdrawal look-ups and order e-mails also have per-e-mail / per-order limits in
`store.db` (`rate_limits`), so they hold even without a trusted proxy.

## Marketing features

- **Prices & promotions.** Regular price, a manual promo price (optionally until a date) and scheduled % promotions;
  the lowest price wins. Promotions start and end by themselves (background scheduler, below).
- **Omnibus.** Every price change is logged in `price_history` (kept 60 days + the last row before). A reduced
  product shows the lowest price of the 30 days before the reduction as the struck price ("Най-ниска цена за
  последните 30 дни") and the −% is computed from it. No struck price and no promotion badge without a real
  reduction against that price, and none for products without real price history (placeholder prices are flagged
  `demo` and never count as history).
- **",99" rounding** is **off by default**; when ticked it rounds to the *nearest* ,99 (20,79 → 20,99; 12,39 → 11,99).
  The preview shows the real % range and warns when rounding moves a discount by more than 2 points or when the
  badge promises another %. The bulk price tool uses the same helper.
- **Gift tiers.** Default 40 / 60 / 80 €: the customer picks a free gift per reached tier in the cart drawer, cart
  page or checkout (or one gift in total). Until the tiers are saved, small in-stock fitness products with a picture
  are picked automatically (bars / snacks ≤ 5 €, shakers / small supplements 5–10 €, creatine / multivitamins /
  BCAA / L-carnitine 10–20 €; `src/lib/gift-defaults.ts`) and kept stable (`_autoGifts` settings row — delete it to
  re-pick). Gifts without a picture are allowed (placeholder, "без снимка" chip in the admin). 18+ products are never
  gifts; the server re-checks every gift at checkout.
- The former "Идеи за подаръци" (gift ideas "За него / За нея", `/podaratsi`) feature was removed; only the gift tiers above remain.
- **Free delivery** over a threshold (0 = every order, off = never), for all methods or offices / lockers only — the
  texts then say "до офис" everywhere (top bar, product page, cart bar, legal pages).
- **"Скрий продукти без снимка"** (on by default): products without a picture are left out of listings, counts,
  search suggestions, shelves, gift pickers and the sitemap; their page opens (old links, carts) with `noindex`.

## Background jobs and page refresh

`src/instrumentation.ts` starts a timer in every server process (`next start` / `next dev`, log line
`[scheduler] started`), `src/lib/scheduler.ts`:

| Job | When |
| --- | --- |
| Recompute prices + refresh cached pages | at each promotion / sale start or end (`next_price_change_at`), checked at least every minute; ≈1 s for the whole catalogue, off the request path |
| Retry failed e-mails | every minute |
| Prune price history (60 days), delete expired personal data (`purgeExpiredData`), reload courier lists | 2 min after start, then daily |

Cached pages are refreshed through `POST /api/internal/revalidate` (token = `REVALIDATE_SECRET` or derived from the
secret in `store.db`; anything else gets 404) — the same route `npm run import` calls. Measured under `next start`: a
scheduled promotion showed on the cached home page ≈2 s after its start and was gone ≈1 s after its end.
Safety-net intervals: home 5 min, `/marki`, `/tseli`, legal / info pages 1 h, sitemaps / robots 1 day;
listings, product pages and search are rendered per request. A CDN in front is **not** purged — keep its TTL short.
Run only **one** scheduler per data folder: set `DISABLE_SCHEDULER=1` on every extra Node process.

## Customer accounts and newsletter

`/registratsia` (18+ and terms confirmation), `/vhod`, `/zabravena-parola` (reset link, 1 hour, single use; the token
is removed from the address bar), `/profil` (orders, addresses with courier offices, personal data, password,
newsletter, data export, account deletion — also deletes the account's chat). Guest checkout is allowed; "create an
account with these details" at checkout needs the same 18+ confirmation. Passwords: 8+ characters with a letter and a
digit.

**Newsletter = double opt-in.** The footer / home form and the tick in the account only store a *pending* address and
e-mail a confirmation link (`/byuletin?t=…`); the address becomes a subscriber when the link is used. The account page
says "очаква потвърждение" until then. Only confirmed addresses appear in Admin → Абонати and its CSV; unconfirmed
ones are deleted after 7 days (the link's lifetime).

## Checkout, orders and e-mail

Cash on delivery or bank transfer. Prices, gifts, stock and delivery are recalculated on the server (`priceCart`);
the order is saved in one transaction with an idempotency token tied to the cart contents (a retry of the same cart
returns the same order, a changed cart makes a new one). The order page is only visible to the browser that placed
it, the account or the admin. The submit button says "Поръчка със задължение за плащане". Orders do **not** reduce
stock (the export is the stock authority).

E-mails (order to customer and shop, welcome, reset, withdrawal, newsletter confirmation): with `SMTP_HOST` they are
sent via SMTP; otherwise written to `data/outbox/*.eml`. **Failed sends** (SMTP down or refusing) are kept in
`data/outbox/failed/` (`.eml` + `.json`) and retried automatically (5 min → 24 h backoff, 8 attempts, removed after
30 days); the dashboard shows a banner while any are waiting.

## Delivery: Speedy and Econt

| Courier | Needs | Without credentials |
| --- | --- | --- |
| Econt (office / Econtomat / address) | `ECONT_USERNAME`, `ECONT_PASSWORD` for live prices | office and town lists are public → always offered, fixed prices from Настройки |
| Speedy (office / locker / address) | `SPEEDY_USERNAME`, `SPEEDY_PASSWORD` for everything | **not offered** at checkout |

Office and town lists are loaded at start, daily and on demand, cached in `store.db` (`courier_cache`, the last good
copy is used when a courier is down). If a live price fails, the fixed price is charged. If the town search is down,
the customer can type the town and post code for address delivery (fixed price; "въведено ръчно" badge on the admin
order). Courier data is Bulgarian, so English visitors search offices in Bulgarian. Waybills are not created
automatically.

## Cookies, tracking, legal

- Cookie banner (bottom bar on ≥ 1024 px): "Приеми всички" / "Отхвърли" (equally prominent) / "Настройки"; choice
  kept 12 months (`sp_consent`) and logged anonymously. GA4 and Meta Pixel load only after consent and never on
  account, password-reset and order pages; page URLs are sent without query strings. **In GA4 switch off Enhanced
  measurement → "Page changes based on browser history events"** (the site sends its own page views).
- Legal pages `/obshti-usloviya`, `/poveritelnost`, `/biskvitki`, `/dostavka`, `/vrashtane`, `/kontakti`,
  `/otkaz-ot-dogovor` (withdrawal by order number + e-mail, separate confirm step) are filled from Настройки in both
  languages (company fields have БГ / EN values).
- **Retention** periods live in one place, `RETENTION` in `src/lib/retention.ts` (the privacy policy quotes them via
  `LEGAL_POLICY`): security logs 6 months, chats 12 months, withdrawal IPs and consent proof 3 years, unconfirmed
  newsletter 7 days, orders 5 years (not purged automatically). The purge runs daily.

## Security and deployment

Run `next start` behind a reverse proxy (nginx / Caddy / IIS) that terminates HTTPS, and keep the Node port reachable
only from the proxy. The visitor IP (rate limits, locks, sessions) is taken from forwarding headers only when the proxy
is trusted — `TRUST_PROXY`:

| `TRUST_PROXY` | Meaning |
| --- | --- |
| empty | 1 proxy when `NEXT_PUBLIC_SITE_URL` is `https://…`, none otherwise |
| `0` | never trust `X-Forwarded-For` (every visitor shares one limit key) |
| `1` … `5` | that many proxies; the client is the Nth address from the right of `X-Forwarded-For` |
| `x-real-ip` | use `X-Real-IP` set by the proxy |

```nginx
server {
  listen 443 ssl http2;
  server_name shop.example.bg;
  client_max_body_size 16m;                      # admin uploads: pictures 10 MB, price files 15 MB
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

- Server Actions (all public forms) accept at most 1 MB; admin uploads go through route handlers with their own
  limits (`/admin/upload` pictures 10 MB, content-sniffed JPG / PNG / WEBP / GIF / AVIF; `/admin/tseni/import` price
  files 15 MB), admin session checked on every page, action and download.
- `src/proxy.ts` serves only known dotted paths (`FILES`: favicon, icon, robots, sitemaps, placeholder) and answers a
  plain 404 for anything else — **add new files in `public/` to `FILES`**.
- Security headers on every response; HSTS (1 year) is sent when `NEXT_PUBLIC_SITE_URL` is https at build time.

## Environment (`.env.local`)

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Public address (canonical URLs, sitemap, e-mail links, HSTS). **Set before `next build`** |
| `DATA_DIR` | Data folder (default `./data`) — app, importer and admin CLI |
| `ORDER_VIEW_SECRET` | 32+ random characters signing the order-page cookie (empty = generated in `store.db`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SHOP_NOTIFY_EMAIL` | E-mail (empty host = `data/outbox`) |
| `SPEEDY_USERNAME`, `SPEEDY_PASSWORD`, `ECONT_USERNAME`, `ECONT_PASSWORD` | Couriers (see Delivery) |
| `TRUST_PROXY` | Which proxy to believe for the client IP (see Security) |
| `REVALIDATE_SECRET` | Token of the internal revalidate route (empty = derived from `store.db`; set it when scripts run elsewhere) |
| `SITE_INTERNAL_URL` | Where scripts reach the running site (default `http://localhost:$PORT`, i.e. 3000), e.g. `http://127.0.0.1:3950` |
| `DISABLE_SCHEDULER` | `1` = no background jobs in this process (extra processes on the same data) |

## Data files (`data/`)

| File | Contents | Back up? |
| --- | --- | --- |
| `catalog.db` | Products, families, facets, search index, SKU registry — rebuilt by `npm run import` | No |
| `store.db` | Orders, customers, admin logins, settings, banners, menu, gifts, promotions, price history, **admin product edits**, blog, chat, manufacturers, withdrawals, newsletter, courier cache | **Yes** |
| `uploads/` | Photos uploaded in the admin | **Yes** |
| `outbox/` | E-mails written instead of sent, `failed/` = queued for retry — contain customer data | Delete when read |
| `prices.csv` (optional) | Real prices for the importer | Yes, if you use it |

## Storefront notes

Headings: Unbounded only for short uppercase labels, long headings use Onest 800 (`.h-title`). The phone search row
collapses on scroll down. The chat bubble is hidden on cart / checkout below 1440 px unless a reply is waiting. The
blog starts with 6 BG + 4 EN articles (`src/lib/blog-seed`, added once).

## Where things are

| What | Where |
| --- | --- |
| Shop scope, taxonomy, goals | `src/lib/taxonomy.ts` (`IMPORTED_CATEGORIES`, `GOALS`), `src/lib/categories.ts` |
| Default settings, home content, menu, gift texts | `src/lib/settings-types.ts` |
| Automatic gift-tier picks | `src/lib/gift-defaults.ts` |
| Catalogue reads / search / writes | `src/lib/catalog.ts`, `src/lib/search.ts`, `src/lib/catalog-write.ts`, `src/lib/catalog-sync.ts` |
| Prices, promotions, Omnibus, scheduler, revalidation | `src/lib/price-engine.ts`, `pricing-rules.ts`, `price-history.ts`, `scheduler.ts`, `revalidate.ts` |
| Cart, gifts, checkout, orders, couriers | `src/lib/pricing.ts`, `cart-gifts.ts`, `checkout.ts`, `orders.ts`, `src/lib/shipping/` |
| Auth, login guard, client IP, rate limits | `src/lib/auth.ts`, `customer-auth.ts`, `login-guard.ts`, `client-ip.ts`, `rate-limit.ts` |
| Newsletter, retention, e-mail | `src/lib/newsletter.ts`, `retention.ts`, `mail.ts`, `src/lib/emails/` |
| Dictionaries / legal texts | `src/i18n/messages/`, `src/components/info/legal/` |
| Importer / price file / admin CLI | `scripts/import-catalog.ts`, `scripts/lib/price-file.ts`, `scripts/admin-user.ts` |

## Before going live

- **Rotate the test admin**: delete `admin` (test password) and create a personal, non-default username with a strong password
- `NEXT_PUBLIC_SITE_URL=https://…` in `.env.local` **before** `npm run build`; HTTPS proxy as above, `TRUST_PROXY`
  checked, Node port private; `ORDER_VIEW_SECRET` set
- **Real prices** (`data/prices.csv` or Excel upload), then the demo notice goes away
- **Company and БАБХ data** in Настройки (BG and EN), bank account; **SMTP** configured and a test order e-mail received
- Courier credentials (Speedy is hidden without them); a test order to an office and to an address
- Backups of `data/store.db` + `data/uploads/` (e.g. nightly); one scheduler per data folder (`DISABLE_SCHEDULER=1` elsewhere)
- GA4 / Meta IDs and the GA4 enhanced-measurement setting above; bump the consent version after changing trackers
- **Lawyer review** of the terms, privacy, cookie, returns texts and the withdrawal flow ([ЮРИСТ] marks in the code),
  EU legal guarantee notice artwork
- **Label data** (ingredients, nutrition per dose, directions, warnings, БАБХ numbers) for the supplements you sell
- **Pictures**: ≈7 200 products have none and stay hidden; product photos are hotlinked from supplier sites (disclosed
  in the privacy policy) — consider mirroring them
- Review the automatic 18+ marks, the automatic gift picks and a sample of categories
