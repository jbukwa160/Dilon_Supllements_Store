import "server-only";
import type { City, Office } from "@/lib/checkout";
import { cached, titleCase } from "./cache";

// Econt JSON API — https://ee.econt.com/services/ (office & city lists are public; prices need a login).
const BASE = "https://ee.econt.com/services";

function basicAuth(): string | null {
  const u = process.env.ECONT_USERNAME;
  const p = process.env.ECONT_PASSWORD;
  return u && p ? `Basic ${Buffer.from(`${u}:${p}`).toString("base64")}` : null;
}

async function call<T>(path: string, body: Record<string, unknown>, opts: { auth?: boolean; timeoutMs?: number } = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.auth) {
    const a = basicAuth();
    if (!a) throw new Error("Econt credentials are not configured (ECONT_USERNAME / ECONT_PASSWORD).");
    headers.Authorization = a;
  }
  const res = await fetch(`${BASE}/${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
    cache: "no-store",
  });
  const json = (await res.json()) as T & { type?: string; message?: string };
  if (!res.ok || (json.type && json.message)) throw new Error(`Econt ${path}: ${json.message ?? res.status}`);
  return json;
}

type EcontCity = { id: number; name: string; postCode: string; regionName: string | null };
type EcontAddress = { city?: EcontCity; fullAddress?: string; street?: string; num?: string; quarter?: string; other?: string };
type EcontOffice = { code: string; name: string; isAPS: boolean; address: EcontAddress };

export function econtOffices(): Promise<Office[]> {
  return cached("econt:offices", 12 * 3600_000, async () => {
    const { offices } = await call<{ offices: EcontOffice[] }>("Nomenclatures/NomenclaturesService.getOffices.json", { countryCode: "BGR" }, { timeoutMs: 45_000 });
    return offices.map((o) => {
      const city = o.address?.city?.name ?? "";
      const full = (o.address?.fullAddress ?? "").trim();
      return {
        id: o.code,
        courier: "econt" as const,
        name: titleCase(o.name),
        city,
        postCode: o.address?.city?.postCode ?? "",
        address: full.startsWith(city) ? full.slice(city.length).trim() : full,
        locker: !!o.isAPS,
      };
    });
  });
}

export function econtCities(): Promise<City[]> {
  return cached("econt:cities", 7 * 24 * 3600_000, async () => {
    const { cities } = await call<{ cities: EcontCity[] }>("Nomenclatures/NomenclaturesService.getCities.json", { countryCode: "BGR" }, { timeoutMs: 45_000 });
    return cities.map((c) => ({ id: String(c.id), courier: "econt" as const, name: c.name, region: c.regionName ?? "", postCode: c.postCode ?? "" }));
  });
}

type Profile = { client: { name: string; phones?: string[] }; addresses?: EcontAddress[] };

/**
 * The account's sender profile. Checked at most every 6 hours, so wrong credentials can't
 * trigger a flood of failed logins (which could lock the Econt account).
 */
function econtSender(): Promise<Profile | null> {
  if (!basicAuth()) return Promise.resolve(null);
  return cached("econt:profile", 6 * 3600_000, async () => {
    try {
      const { profiles } = await call<{ profiles: Profile[] }>("Profile/ProfileService.getClientProfiles.json", {}, { auth: true });
      return profiles?.find((p) => p.addresses?.length) ?? null;
    } catch (e) {
      console.error("[econt] login failed — Econt prices fall back to the fixed prices:", (e as Error).message);
      return null;
    }
  });
}

/** Price (EUR) Econt charges us for one parcel; null if it can't be calculated. */
export async function econtQuote(input: { officeCode?: string; city?: City; weight: number; codAmount?: number }): Promise<number | null> {
  const sender = await econtSender();
  if (!sender?.addresses?.length) return null;
  try {
    const res = await call<{ label?: { totalPrice?: number; currency?: string; senderDueAmount?: number } }>(
      "Shipments/LabelService.createLabel.json",
      {
        mode: "calculate",
        label: {
          senderClient: { name: sender.client.name, phones: sender.client.phones ?? [] },
          senderAddress: sender.addresses[0],
          receiverClient: { name: "Клиент", phones: ["0888888888"] },
          ...(input.officeCode
            ? { receiverOfficeCode: input.officeCode }
            : { receiverAddress: { city: { name: input.city?.name, postCode: input.city?.postCode, country: { code3: "BGR" } }, street: "", num: "" } }),
          packCount: 1,
          shipmentType: "PACK",
          weight: Math.max(0.1, Math.round(input.weight * 100) / 100),
          ...(input.codAmount ? { services: { cdAmount: Math.round(input.codAmount * 100) / 100, cdType: "get", cdCurrency: "EUR" } } : {}),
          paymentSenderMethod: "credit",
        },
      },
      { auth: true },
    );
    const price = res.label?.senderDueAmount ?? res.label?.totalPrice;
    if (price == null || (res.label?.currency && res.label.currency !== "EUR")) return null;
    return price;
  } catch (e) {
    console.error("[econt] quote failed:", (e as Error).message);
    return null;
  }
}
