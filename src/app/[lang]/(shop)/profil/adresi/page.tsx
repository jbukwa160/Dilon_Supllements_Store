import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDict } from "@/i18n";
import { isLang } from "@/i18n/config";
import { requireCustomer } from "@/lib/customer-auth";
import { listCustomerAddresses } from "@/lib/customer-addresses";
import { alternates } from "@/lib/seo";
import { AddressBook } from "@/components/account/AddressBook";

// Saved delivery addresses: add / edit / delete / make default.

export async function generateMetadata({ params }: PageProps<"/[lang]/profil/adresi">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  return { title: getDict(lang).account.addresses, alternates: alternates("/profil/adresi", lang), robots: { index: false, follow: false } };
}

export default async function AccountAddressesPage({ params }: PageProps<"/[lang]/profil/adresi">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const c = await requireCustomer(lang, "/profil/adresi");
  const t = getDict(lang).account;
  return (
    <div className="space-y-5">
      <h1 className="h-display text-[1.6rem] md:text-4xl">{t.addresses}</h1>
      <AddressBook addresses={listCustomerAddresses(c.id)} />
    </div>
  );
}
