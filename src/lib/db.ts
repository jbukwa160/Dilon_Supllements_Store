import "server-only";
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { CATALOG_SCHEMA_REV, ensureCatalogSchema } from "./catalog-schema";
import { STORE_SCHEMA, STORE_SCHEMA_REV } from "./store-schema";

// DATA_DIR lets a second copy of the site (e.g. for testing) use its own data folder.
export const DATA_DIR = process.env.DATA_DIR ? path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR) : path.join(process.cwd(), "data");
export const CATALOG_PATH = path.join(DATA_DIR, "catalog.db");
export const STORE_PATH = path.join(DATA_DIR, "store.db");

// Reuse connections across hot reloads in development.
const g = globalThis as unknown as { __catalogDb?: Database.Database; __catalogRev?: number; __storeDb?: Database.Database; __storeRev?: number };

/** Product catalogue (rebuilt by `npm run import`, edited by the admin panel). */
export function catalogDb(): Database.Database {
  if (!g.__catalogDb) {
    const exists = fs.existsSync(CATALOG_PATH);
    if (!exists) {
      // No catalogue yet: start with an empty one so the site builds and runs; `npm run import` fills it.
      fs.mkdirSync(DATA_DIR, { recursive: true });
      console.warn(`[db] Catalog database not found at ${CATALOG_PATH}; created an empty one. Run "npm run import" to load the products.`);
    }
    const db = new Database(CATALOG_PATH);
    db.pragma("busy_timeout = 5000");
    // WAL: `npm run import` swaps the whole catalogue in one write transaction while the shop keeps reading the old
    // one (rollback-journal mode would block every reader for the length of the swap).
    try {
      db.pragma("journal_mode = WAL");
    } catch {
      /* another process holds the file; the importer sets WAL too (it is stored in the file) */
    }
    g.__catalogDb = db;
  }
  // Also for a connection that was already open (a dev server that hot-reloaded).
  if (g.__catalogRev !== CATALOG_SCHEMA_REV) {
    ensureCatalogSchema(g.__catalogDb);
    g.__catalogRev = CATALOG_SCHEMA_REV;
  }
  return g.__catalogDb;
}

/** Everything that must survive a catalogue re-import: orders, customers, settings, admin edits, admin users. */
export function storeDb(): Database.Database {
  if (!g.__storeDb) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const db = new Database(STORE_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 5000");
    db.pragma("foreign_keys = ON");
    g.__storeDb = db;
  }
  if (g.__storeRev !== STORE_SCHEMA_REV) {
    g.__storeDb.exec(STORE_SCHEMA);
    migrateStore(g.__storeDb);
    g.__storeRev = STORE_SCHEMA_REV;
  }
  return g.__storeDb;
}

/**
 * Additive migrations for files created by an older STORE_SCHEMA (new files already have every column from
 * CREATE TABLE): ALTER TABLE … ADD COLUMN, each guarded by PRAGMA table_info so it runs once.
 */
function migrateStore(db: Database.Database) {
  const addColumn = (table: string, column: string, def: string) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
  };
  // rev 2: courier phone per saved address.
  addColumn("customer_addresses", "phone", "TEXT NOT NULL DEFAULT ''");
  // rev 3: newsletter double opt-in (rows from before stay unconfirmed: they never confirmed their address).
  addColumn("newsletter", "confirmed_at", "TEXT");
  addColumn("newsletter", "confirm_hash", "TEXT");
  addColumn("newsletter", "confirm_sent_at", "TEXT");
  db.exec("CREATE INDEX IF NOT EXISTS newsletter_confirm ON newsletter(confirm_hash)");
  // rev 4: price history rows written while the product had a placeholder (demo) price.
  addColumn("price_history", "demo", "INTEGER NOT NULL DEFAULT 0");
}

/** Reads a JSON column; null for NULL, empty or corrupt values. */
export function parseJson<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
