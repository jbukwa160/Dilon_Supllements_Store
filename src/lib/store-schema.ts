// Schema of data/store.db: everything that must survive a catalogue re-import (orders, customers, settings,
// admin edits, blog, chat…). Shared by the app (lib/db.ts) and the CLI scripts, so no Next-only imports here.
// Every column is in CREATE TABLE; later additions go at the end of a table as an ALTER in lib/db.ts.

/** Bump when STORE_SCHEMA or the migrations in lib/db.ts change, so an already-open connection applies them too. */
export const STORE_SCHEMA_REV = 4;

export const STORE_SCHEMA = `
  -- Admin-edited settings as JSON: store, home, menu, giftTiers, chat, categories, goals
  -- (and the internal "_secret" used to sign the "orders placed in this browser" cookie).
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- Admin changes to products. Re-applied after every CSV import so they are never lost.
  CREATE TABLE IF NOT EXISTS product_edits (
    sku TEXT PRIMARY KEY,
    custom INTEGER NOT NULL DEFAULT 0,
    deleted INTEGER NOT NULL DEFAULT 0,
    data TEXT NOT NULL,
    -- catalogue values before the first admin change, for "restore original"
    original TEXT,
    updated_at TEXT NOT NULL
  );

  -- Every change of a product's effective price (Omnibus: "lowest price in the last 30 days"). demo = written while the
  -- product had a placeholder price, never a reference for real prices. Older than 60 days: pruned (lib/scheduler.ts).
  CREATE TABLE IF NOT EXISTS price_history (
    id INTEGER PRIMARY KEY,
    sku TEXT NOT NULL,
    price REAL NOT NULL,
    at TEXT NOT NULL,
    demo INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS price_history_sku ON price_history(sku, at);

  -- Percentage promotions, optionally scheduled (Цени и промоции). The lowest applicable price wins.
  CREATE TABLE IF NOT EXISTS promotions (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    percent REAL NOT NULL,
    scope TEXT NOT NULL DEFAULT 'all', -- 'all' | 'category' | 'brand' | 'goal' | 'skus'
    scope_value TEXT,                  -- slug, or a JSON array of SKUs for 'skus'
    round99 INTEGER NOT NULL DEFAULT 0,
    starts_at TEXT,
    ends_at TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    badge TEXT,                        -- JSON L10n shown on product cards, e.g. {"bg":"Black Friday","en":"Black Friday"}
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS promotions_window ON promotions(enabled, starts_at, ends_at);

  -- Price files uploaded in the admin panel, kept until the admin confirms them.
  CREATE TABLE IF NOT EXISTS price_imports (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    number INTEGER NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    customer TEXT NOT NULL,       -- JSON snapshot { firstName, lastName, phone, email } as used for this order
    delivery TEXT NOT NULL,       -- JSON OrderDelivery
    payment TEXT NOT NULL,
    items TEXT NOT NULL,          -- JSON OrderLine[] (paid lines and gift lines)
    subtotal REAL NOT NULL,
    shipping REAL NOT NULL,
    total REAL NOT NULL,
    note TEXT,
    admin_note TEXT,
    customer_id INTEGER,          -- registered customer who placed it (NULL = guest / deleted account)
    email TEXT,                   -- lower-cased copy for look-ups (withdrawal form)
    locale TEXT NOT NULL DEFAULT 'bg',
    checkout_token TEXT UNIQUE    -- idempotency: a double submit returns the same order
  );
  CREATE INDEX IF NOT EXISTS orders_created ON orders(created_at);
  CREATE INDEX IF NOT EXISTS orders_status ON orders(status, number);
  CREATE INDEX IF NOT EXISTS orders_customer ON orders(customer_id, number);
  CREATE INDEX IF NOT EXISTS orders_email ON orders(email);

  -- Customer accounts (separate from the admin users).
  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    locale TEXT NOT NULL DEFAULT 'bg',
    marketing_consent_at TEXT,    -- newsletter opt-in (never pre-ticked); NULL = no consent
    email_verified_at TEXT,
    blocked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    last_login_at TEXT
  );
  CREATE TABLE IF NOT EXISTS customer_sessions (
    token_hash TEXT PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    ip TEXT,
    user_agent TEXT,
    -- 1 = "remember me" (cookie kept 30 days), 0 = until the browser is closed
    persistent INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS customer_sessions_customer ON customer_sessions(customer_id);
  CREATE TABLE IF NOT EXISTS customer_addresses (
    id INTEGER PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    label TEXT NOT NULL DEFAULT '',
    method TEXT NOT NULL,         -- DeliveryKey
    office TEXT,                  -- JSON Office snapshot
    city TEXT,                    -- JSON City snapshot
    address TEXT,
    is_default INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT ''  -- phone for the courier ("" = the profile's phone); rev 2
  );
  CREATE INDEX IF NOT EXISTS customer_addresses_customer ON customer_addresses(customer_id);
  -- One-time tokens (password reset, e-mail verification), stored hashed.
  CREATE TABLE IF NOT EXISTS customer_tokens (
    token_hash TEXT PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL,        -- 'reset' | 'verify'
    expires_at TEXT NOT NULL,
    used_at TEXT
  );
  CREATE INDEX IF NOT EXISTS customer_tokens_customer ON customer_tokens(customer_id, purpose);

  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_login_at TEXT
  );
  CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    ip TEXT,
    user_agent TEXT
  );
  -- Failed sign-ins (admin keys "name|ip" / "user:name", customer keys "c:email|ip" / "c:user:email").
  CREATE TABLE IF NOT EXISTS login_attempts (
    key TEXT PRIMARY KEY,
    failures INTEGER NOT NULL,
    first_at TEXT NOT NULL,
    locked_until TEXT
  );

  -- Newsletter with double opt-in (lib/newsletter.ts): a row is only a subscriber once confirmed_at is set (the
  -- address clicked the e-mailed link). Pending rows are deleted after a few days (lib/retention.ts).
  CREATE TABLE IF NOT EXISTS newsletter (
    email TEXT PRIMARY KEY COLLATE NOCASE,
    locale TEXT NOT NULL DEFAULT 'bg',
    created_at TEXT NOT NULL,
    confirmed_at TEXT,            -- NULL = waiting for the confirmation click; rev 3
    confirm_hash TEXT,            -- sha256 of the confirmation link token (cleared once used); rev 3
    confirm_sent_at TEXT          -- when the last confirmation e-mail went out; rev 3
  );

  -- Request limits that must hold across addresses and restarts (lib/rate-limit.ts subjectLimited): per e-mail
  -- address, per order number, and shop-wide caps. key = "<bucket>:<sha256 of the subject>" (no e-mail in clear).
  CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    reset_at INTEGER NOT NULL     -- end of the current window, ms since 1970
  );

  -- Office / city lists downloaded from the couriers (refreshed automatically).
  CREATE TABLE IF NOT EXISTS courier_cache (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    fetched_at TEXT NOT NULL
  );

  -- Chat bubble: one conversation per visitor (identified by a cookie), answered in the admin panel.
  CREATE TABLE IF NOT EXISTS chat_conversations (
    id INTEGER PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    name TEXT,
    contact TEXT,
    page TEXT,
    ip TEXT,
    user_agent TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL,
    last_message_at TEXT NOT NULL,
    -- messages not seen yet by the admin / by the visitor
    unread_admin INTEGER NOT NULL DEFAULT 0,
    unread_visitor INTEGER NOT NULL DEFAULT 0,
    -- language of the visitor (staff reply in it) and the signed-in customer, if any
    locale TEXT NOT NULL DEFAULT 'bg',
    customer_id INTEGER
  );
  CREATE INDEX IF NOT EXISTS chat_conversations_last ON chat_conversations(last_message_at);
  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY,
    conversation_id INTEGER NOT NULL,
    sender TEXT NOT NULL, -- 'visitor' | 'admin'
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS chat_messages_conversation ON chat_messages(conversation_id, id);

  -- Blog (/blog, /en/blog), written in the admin panel. Bulgarian and English posts are separate rows;
  -- translation_of links a translation to its original (hreflang, language switcher).
  CREATE TABLE IF NOT EXISTS blog_posts (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    excerpt TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    cover TEXT NOT NULL DEFAULT '',
    theme TEXT NOT NULL DEFAULT 'sunrise',
    topic TEXT NOT NULL DEFAULT '',
    meta_title TEXT NOT NULL DEFAULT '',
    meta_description TEXT NOT NULL DEFAULT '',
    published INTEGER NOT NULL DEFAULT 0,
    published_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    locale TEXT NOT NULL DEFAULT 'bg',
    translation_of INTEGER,
    UNIQUE (locale, slug)
  );
  CREATE INDEX IF NOT EXISTS blog_posts_list ON blog_posts(locale, published, published_at);
  -- Old addresses of posts whose address was changed, so links and Google results keep working.
  CREATE TABLE IF NOT EXISTS blog_redirects (
    old_slug TEXT PRIMARY KEY,
    post_id INTEGER NOT NULL
  );

  -- Food business operator / manufacturer per brand, shown on every product of the brand.
  CREATE TABLE IF NOT EXISTS manufacturers (
    brand_slug TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- Cookie consent decisions (optional proof of consent; no personal data).
  CREATE TABLE IF NOT EXISTS consent_log (
    id INTEGER PRIMARY KEY,
    consent TEXT NOT NULL,        -- JSON { necessary, preferences, analytics, marketing }
    version INTEGER NOT NULL,
    locale TEXT NOT NULL DEFAULT 'bg',
    created_at TEXT NOT NULL
  );

  -- Withdrawal statements sent through "Откажете се от договора тук" (/otkaz-ot-dogovor).
  CREATE TABLE IF NOT EXISTS withdrawals (
    id INTEGER PRIMARY KEY,
    order_id TEXT,
    order_number INTEGER,
    email TEXT NOT NULL,
    items TEXT NOT NULL DEFAULT '[]', -- JSON: the lines the customer withdraws from ([] = the whole order)
    reason TEXT,
    locale TEXT NOT NULL DEFAULT 'bg',
    ip TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS withdrawals_order ON withdrawals(order_id);
`;
