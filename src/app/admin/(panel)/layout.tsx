import { requireAdmin } from "@/lib/auth";
import { newOrdersCount, unreadChatCount } from "@/lib/admin/counts";
import { getSettings } from "@/lib/settings";
import { AdminShell } from "@/components/admin/AdminShell";

// Pages check the session themselves too (layouts don't re-run on every navigation).
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <AdminShell username={admin.username} storeName={getSettings().name} newOrders={newOrdersCount()} unreadChats={unreadChatCount()}>
      {children}
    </AdminShell>
  );
}
