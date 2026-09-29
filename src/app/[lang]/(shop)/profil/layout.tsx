import { notFound } from "next/navigation";
import { fmt, getDict } from "@/i18n";
import { isLang } from "@/i18n/config";
import { getCustomer } from "@/lib/customer-auth";
import { formatDate } from "@/lib/format";
import { AccountNav } from "@/components/account/AccountNav";
import { AccountSync } from "@/components/account/AccountSync";

// Frame of the account area: navigation (sidebar on desktop, capsule tabs on phones) + the page. Every page also
// calls requireCustomer() itself (layouts are not re-run on client navigation, and they are no security boundary).

export default async function AccountLayout({ children, params }: LayoutProps<"/[lang]/profil">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const c = await getCustomer();
  if (!c) return children;
  const t = getDict(lang).account;
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ");
  const initials = (c.firstName.charAt(0) + c.lastName.charAt(0)).toUpperCase();

  return (
    <div className="container-shop pb-12 pt-4 md:pb-16 md:pt-6">
      <AccountSync customer={{ firstName: c.firstName, lastName: c.lastName, email: c.email }} />
      <div className="grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-10">
        <AccountNav name={name} email={c.email} initials={initials} memberSince={fmt(t.area.memberSince, { date: formatDate(c.createdAt, lang) })} />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
