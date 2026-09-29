import "server-only";
import { parseJson, storeDb } from "./db";
import { DELIVERY_METHODS, isDeliveryKey, type City, type DeliveryKey, type Office } from "./checkout";

// Saved delivery addresses of a customer (store.db customer_addresses): the address book in /profil/adresi and the
// prefill of the checkout. Two kinds of rows:
//  - saved from the checkout (agent D): `office` / `city` are real courier snapshots with ids — the DeliveryPicker
//    can start from them without calling the courier;
//  - typed in the address book: `office` is null, `city` has `id: ""` (only name / post code), `address` is free
//    text (street… for address delivery, the office name / address for office delivery). The checkout pre-fills
//    what it can and asks the customer to pick the courier's city / office.
// Every function takes the customer id from requireCustomer() and only touches that customer's rows.

export const MAX_ADDRESSES = 20;
const LABEL_MAX = 60;
const CITY_MAX = 80;
const ADDRESS_MAX = 200;

export type SavedAddress = {
  id: number;
  label: string;
  method: DeliveryKey;
  /** Courier office / locker picked in the checkout (null for addresses typed in the address book). */
  office: Office | null;
  /** Courier city snapshot; `id: ""` when typed by hand. */
  city: City | null;
  /** City name for display (office city for office delivery). */
  cityName: string;
  postCode: string;
  /** Street address, or the office description typed by the customer. */
  address: string;
  /** Phone for the courier ("" = use the phone of the profile). */
  phone: string;
  isDefault: boolean;
  updatedAt: string;
};

export type AddressInput = {
  label: string;
  method: DeliveryKey;
  office?: Office | null;
  city?: City | null;
  address: string;
  phone: string;
  /** true = make it the default; the first address is always the default. */
  isDefault?: boolean;
};

type Row = {
  id: number;
  label: string;
  method: string;
  office: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  is_default: number;
  updated_at: string;
};

/** store.db (customer_addresses.phone is part of STORE_SCHEMA since rev 2; older files get it in lib/db.ts). */
const db = storeDb;

function toAddress(r: Row): SavedAddress | null {
  if (!isDeliveryKey(r.method)) return null;
  const office = parseJson<Office>(r.office);
  const city = parseJson<City>(r.city);
  return {
    id: r.id,
    label: r.label ?? "",
    method: r.method,
    office: office && typeof office === "object" && office.id ? office : null,
    city: city && typeof city === "object" ? city : null,
    cityName: office?.city || city?.name || "",
    postCode: office?.postCode || city?.postCode || "",
    address: r.address ?? "",
    phone: r.phone ?? "",
    isDefault: !!r.is_default,
    updatedAt: r.updated_at,
  };
}

const COLS = "id, label, method, office, city, address, phone, is_default, updated_at";

/** The customer's addresses: the default first, then the most recently used / edited. */
export function listCustomerAddresses(customerId: number): SavedAddress[] {
  const rows = db()
    .prepare(`SELECT ${COLS} FROM customer_addresses WHERE customer_id = ? ORDER BY is_default DESC, updated_at DESC, id DESC`)
    .all(customerId) as Row[];
  return rows.flatMap((r) => toAddress(r) ?? []);
}

export function getCustomerAddress(customerId: number, id: number): SavedAddress | null {
  const row = db().prepare(`SELECT ${COLS} FROM customer_addresses WHERE id = ? AND customer_id = ?`).get(id, customerId) as Row | undefined;
  return row ? toAddress(row) : null;
}

/** The default address (or the newest one), for the checkout prefill. */
export function getDefaultCustomerAddress(customerId: number): SavedAddress | null {
  return listCustomerAddresses(customerId)[0] ?? null;
}

export type AddressError = "too_many" | "not_found" | "method_invalid";

/**
 * Adds (no `id`) or updates an address. Values are clipped; a city typed by hand becomes a `City` snapshot with
 * `id: ""`. Making an address the default clears the flag on the others.
 */
export function saveCustomerAddress(customerId: number, input: AddressInput, id?: number): { ok: true; id: number } | { ok: false; code: AddressError } {
  if (!isDeliveryKey(input.method)) return { ok: false, code: "method_invalid" };
  const d = db();
  const courier = DELIVERY_METHODS[input.method].courier;
  const city: City | null = input.city
    ? {
        id: String(input.city.id ?? "").slice(0, 40),
        courier,
        name: String(input.city.name ?? "")
          .trim()
          .slice(0, CITY_MAX),
        region: String(input.city.region ?? "")
          .trim()
          .slice(0, CITY_MAX),
        postCode: String(input.city.postCode ?? "")
          .trim()
          .slice(0, 12),
      }
    : null;
  const office = DELIVERY_METHODS[input.method].kind === "office" && input.office?.id ? input.office : null;
  const now = new Date().toISOString();
  const values = [
    String(input.label ?? "")
      .trim()
      .slice(0, LABEL_MAX),
    input.method,
    office ? JSON.stringify(office) : null,
    city ? JSON.stringify(city) : null,
    String(input.address ?? "")
      .trim()
      .slice(0, ADDRESS_MAX),
    String(input.phone ?? "")
      .trim()
      .slice(0, 30),
  ];
  return d
    .transaction((): { ok: true; id: number } | { ok: false; code: AddressError } => {
      const count = (d.prepare("SELECT COUNT(*) AS n FROM customer_addresses WHERE customer_id = ?").get(customerId) as { n: number }).n;
      let rowId: number;
      if (id) {
        const r = d
          .prepare(
            "UPDATE customer_addresses SET label = ?, method = ?, office = ?, city = ?, address = ?, phone = ?, updated_at = ? WHERE id = ? AND customer_id = ?",
          )
          .run(...values, now, id, customerId);
        if (!r.changes) return { ok: false, code: "not_found" };
        rowId = id;
      } else {
        if (count >= MAX_ADDRESSES) return { ok: false, code: "too_many" };
        const r = d
          .prepare(
            "INSERT INTO customer_addresses (customer_id, label, method, office, city, address, phone, is_default, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)",
          )
          .run(customerId, ...values, now);
        rowId = Number(r.lastInsertRowid);
      }
      const hasDefault = !!d.prepare("SELECT 1 FROM customer_addresses WHERE customer_id = ? AND is_default = 1 AND id <> ?").get(customerId, rowId);
      if (input.isDefault || !hasDefault) setDefault(customerId, rowId);
      return { ok: true, id: rowId };
    })
    .immediate();
}

function setDefault(customerId: number, id: number) {
  const d = db();
  d.prepare("UPDATE customer_addresses SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE customer_id = ?").run(id, customerId);
}

/** Makes this address the default one. False if it isn't the customer's. */
export function setDefaultCustomerAddress(customerId: number, id: number): boolean {
  const d = db();
  if (!d.prepare("SELECT 1 FROM customer_addresses WHERE id = ? AND customer_id = ?").get(id, customerId)) return false;
  setDefault(customerId, id);
  return true;
}

/** Deletes an address; if it was the default, the most recent remaining one becomes the default. */
export function deleteCustomerAddress(customerId: number, id: number): boolean {
  const d = db();
  return d.transaction(() => {
    const r = d.prepare("DELETE FROM customer_addresses WHERE id = ? AND customer_id = ?").run(id, customerId);
    if (!r.changes) return false;
    if (!d.prepare("SELECT 1 FROM customer_addresses WHERE customer_id = ? AND is_default = 1").get(customerId)) {
      const next = d.prepare("SELECT id FROM customer_addresses WHERE customer_id = ? ORDER BY updated_at DESC, id DESC LIMIT 1").get(customerId) as
        { id: number } | undefined;
      if (next) setDefault(customerId, next.id);
    }
    return true;
  })();
}
