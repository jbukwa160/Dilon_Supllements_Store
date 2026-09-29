import "server-only";
import type { City, Office } from "@/lib/checkout";
import { cached, titleCase } from "./cache";

// Speedy REST API — https://api.speedy.bg/web-api.html
const BASE = "https://api.speedy.bg/v1";
const COUNTRY_BG = 100;
const SERVICE_STANDARD = 505;

function auth() {
  const userName = process.env.SPEEDY_USERNAME;
  const password = process.env.SPEEDY_PASSWORD;
  return userName && password ? { userName, password, language: "BG" } : null;
}

export function speedyConfigured(): boolean {
  return auth() !== null;
}

async function call<T>(path: string, body: Record<string, unknown>, timeoutMs = 10_000): Promise<T> {
  const a = auth();
  if (!a) throw new Error("Speedy credentials are not configured (SPEEDY_USERNAME / SPEEDY_PASSWORD).");
  const res = await fetch(`${BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...a, ...body }),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  const json = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok || json.error) throw new Error(`Speedy ${path}: ${json.error?.message ?? res.status}`);
  return json;
}

type SpeedyAddress = { siteName?: string; postCode?: string; fullAddressString?: string; localAddressString?: string };
type SpeedyOffice = { id: number; name: string; type: string; address: SpeedyAddress };
type SpeedySite = { id: number; type: string; name: string; region: string; postCode: string };

export function speedyOffices(): Promise<Office[]> {
  return cached("speedy:offices", 12 * 3600_000, async () => {
    const { offices } = await call<{ offices: SpeedyOffice[] }>("location/office", { countryId: COUNTRY_BG }, 30_000);
    return offices.map((o) => ({
      id: String(o.id),
      courier: "speedy" as const,
      name: titleCase(o.name),
      city: titleCase(o.address?.siteName ?? ""),
      postCode: o.address?.postCode ?? "",
      address: titleCase(o.address?.localAddressString || o.address?.fullAddressString || ""),
      locker: o.type === "APT",
    }));
  });
}

function toCity(s: SpeedySite): City {
  return { id: String(s.id), courier: "speedy", name: `${s.type} ${titleCase(s.name)}`.trim(), region: titleCase(s.region ?? ""), postCode: s.postCode ?? "" };
}

export function speedyCities(query: string): Promise<City[]> {
  const q = query.trim().toUpperCase();
  return cached(`speedy:sites:${q}`, 7 * 24 * 3600_000, async () => {
    const { sites } = await call<{ sites: SpeedySite[] }>("location/site", { countryId: COUNTRY_BG, name: q });
    // Towns first, then villages; bigger places tend to come first already.
    return sites
      .sort((a, b) => Number(b.type.startsWith("гр")) - Number(a.type.startsWith("гр")))
      .slice(0, 25)
      .map(toCity);
  });
}

export function speedyCity(id: string): Promise<City | null> {
  if (!/^\d{1,12}$/.test(id)) return Promise.resolve(null);
  return cached(`speedy:site:${id}`, 30 * 24 * 3600_000, async () => {
    const { site } = await call<{ site?: SpeedySite }>(`location/site/${id}`, {});
    return site ? toCity(site) : null;
  });
}

/** Price (EUR, incl. VAT) Speedy charges us for one parcel; null if it can't be calculated. */
export async function speedyQuote(input: { officeId?: string; siteId?: string; weight: number; codAmount?: number }): Promise<number | null> {
  const recipient = input.officeId
    ? { privatePerson: true, pickupOfficeId: Number(input.officeId) }
    : { privatePerson: true, addressLocation: { siteId: Number(input.siteId) } };
  try {
    const res = await call<{ calculations: { price?: { total: number; currency: string }; error?: { message: string } }[] }>("calculate", {
      recipient,
      service: {
        autoAdjustPickupDate: true,
        serviceIds: [SERVICE_STANDARD],
        ...(input.codAmount ? { additionalServices: { cod: { amount: Math.round(input.codAmount * 100) / 100, processingType: "CASH" } } } : {}),
      },
      content: { parcelsCount: 1, totalWeight: Math.max(0.1, Math.round(input.weight * 100) / 100) },
      payment: { courierServicePayer: "SENDER" },
    });
    const c = res.calculations?.[0];
    if (!c?.price || c.error || c.price.currency !== "EUR") return null;
    return c.price.total;
  } catch (e) {
    console.error("[speedy] quote failed:", (e as Error).message);
    return null;
  }
}
