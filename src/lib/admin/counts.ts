import "server-only";
import { storeDb } from "@/lib/db";

// Numbers for the admin menu badges. They must never break the panel (a fresh store.db, a table another module
// hasn't filled yet), so any error counts as 0.

function count(sql: string): number {
  try {
    return (storeDb().prepare(sql).get() as { n: number } | undefined)?.n ?? 0;
  } catch {
    return 0;
  }
}

/** Orders waiting to be confirmed (status "new"): the Поръчки badge. */
export function newOrdersCount(): number {
  return count("SELECT COUNT(*) AS n FROM orders WHERE status = 'new'");
}

/** Conversations with messages nobody from the shop has read yet: the Чат badge. */
export function unreadChatCount(): number {
  return count("SELECT COUNT(*) AS n FROM chat_conversations WHERE unread_admin > 0");
}
