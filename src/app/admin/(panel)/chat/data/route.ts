// Polled by the admin panel: the menu badge (?summary=1, every 15 s from AdminShell) and the chat page (conversation
// list + open conversation). Lives under /admin because the admin cookie is only sent to /admin/*. Every call also
// marks the shop as "on line" for the chat bubble (90 s).
import { NextResponse, type NextRequest } from "next/server";
import { getAdmin } from "@/lib/auth";
import {
  getConversation,
  listConversations,
  markReadByAdmin,
  messagesAfter,
  touchAdminPresence,
  unreadConversationCount,
  type ChatFilter,
} from "@/lib/chat";

export async function GET(req: NextRequest) {
  if (!(await getAdmin())) return NextResponse.json({ error: "Влезте отново." }, { status: 401 });
  touchAdminPresence();
  const sp = req.nextUrl.searchParams;
  const headers = { "Cache-Control": "no-store" };
  if (sp.get("summary") === "1") return NextResponse.json({ unread: unreadConversationCount() }, { headers });

  const filter: ChatFilter = sp.get("filter") === "closed" ? "closed" : sp.get("filter") === "all" ? "all" : "open";
  const id = parseInt(sp.get("c") ?? "", 10);
  const after = Math.max(0, parseInt(sp.get("after") ?? "0", 10) || 0);
  const conversation = Number.isInteger(id) && id > 0 ? getConversation(id) : null;
  // Open in the admin = read.
  if (conversation?.unreadAdmin) markReadByAdmin(conversation.id);
  return NextResponse.json(
    {
      unread: unreadConversationCount(),
      conversations: listConversations(filter),
      conversation: conversation ? { ...conversation, unreadAdmin: 0 } : null,
      messages: conversation ? messagesAfter(conversation.id, after) : [],
    },
    { headers },
  );
}
