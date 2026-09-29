// /porachka — the checkout. Dynamic: a signed-in customer's details and default address are pre-filled on the server
// (getCustomer reads the session cookie). The cart itself comes from the browser; placeOrder re-prices it. Owner: D.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { getDict } from "@/i18n";
import { isLang } from "@/i18n/config";
import { DELIVERY_METHODS, type SavedDelivery } from "@/lib/checkout";
import { getDefaultCustomerAddress } from "@/lib/customer-addresses";
import { getCustomer } from "@/lib/customer-auth";
import { alternates } from "@/lib/seo";
import { availableDeliveryMethods, warmCourierCaches } from "@/lib/shipping";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CheckoutForm, type CheckoutPrefill } from "@/components/cart/CheckoutForm";

export async function generateMetadata({ params }: PageProps<"/[lang]/porachka">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  return { title: getDict(lang).checkout.title, alternates: alternates("/porachka", lang), robots: { index: false, follow: false } };
}

export default async function CheckoutPage({ params }: PageProps<"/[lang]/porachka">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const dict = getDict(lang);
  const customer = await getCustomer();
  const prefill: CheckoutPrefill = customer
    ? {
        firstName: customer.firstName,
        lastName: customer.lastName,
        phone: customer.phone,
        email: customer.email,
        signedInAs: `${customer.firstName} ${customer.lastName}`.trim() || customer.email,
      }
    : { firstName: "", lastName: "", phone: "", email: "", signedInAs: null };

  // Only couriers the shop can use are offered (Speedy needs its API login). Their office / town lists are kept
  // pre-loaded, so a courier outage later is covered by the stored copy (throttled; after the response).
  const methods = availableDeliveryMethods();
  after(() => warmCourierCaches());

  // The default saved address: courier snapshots (saved by an earlier checkout) are used as they are; an address
  // typed in the address book only pre-fills the method, the street and the town search. A saved method that is no
  // longer offered becomes the same kind of delivery with the first available courier (office / town picked again).
  const address = customer ? getDefaultCustomerAddress(customer.id) : null;
  let saved: SavedDelivery | null = null;
  let cityQuery = "";
  if (address) {
    const kind = DELIVERY_METHODS[address.method].kind;
    const offered = methods.includes(address.method);
    const method = offered ? address.method : methods.find((m) => DELIVERY_METHODS[m].kind === kind);
    const city = offered && address.city?.id ? address.city : null;
    if (method) {
      saved = {
        method,
        office: kind === "office" && offered ? address.office : null,
        city: kind === "address" ? city : null,
        address: kind === "address" ? address.address : "",
      };
      if (kind === "address" && !city) cityQuery = address.cityName;
    }
  }

  return (
    <div className="container-shop py-6 md:py-10">
      <Breadcrumbs items={[{ label: dict.cart.title, href: "/kolichka" }, { label: dict.checkout.title }]} />
      <h1 className="h-display mb-6 mt-3 text-3xl md:mb-8 md:text-4xl">{dict.checkout.title}</h1>
      <CheckoutForm prefill={prefill} saved={saved} cityQuery={cityQuery} methods={methods} />
    </div>
  );
}
