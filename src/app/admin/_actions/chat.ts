"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { writeSetting } from "@/lib/settings";
import { normalizeChat } from "@/lib/settings-normalize";
import type { ChatSettings } from "@/lib/settings-types";
import { CHAT_LIMITS, addMessage, cleanText, deleteConversation, getConversation, setConversationStatus, type ChatMessage } from "@/lib/chat";

// Чат: replies, open / close / delete a conversation, the bubble's settings.

const validId = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export async function sendChatReplyAction(conversationId: number, text: string): Promise<{ message?: ChatMessage; error?: string }> {
  await requireAdmin();
  const id = validId(conversationId);
  const body = cleanText(text, CHAT_LIMITS.body);
  if (!body) return { error: "Напишете отговор." };
  if (!id || !getConversation(id)) return { error: "Разговорът вече не съществува." };
  return { message: addMessage(id, "admin", body) };
}

export async function setChatStatusAction(conversationId: number, status: "open" | "closed"): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  const id = validId(conversationId);
  if (!id || !getConversation(id)) return { error: "Разговорът вече не съществува." };
  setConversationStatus(id, status === "closed" ? "closed" : "open");
  return { ok: true };
}

export async function deleteChatAction(conversationId: number): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  const id = validId(conversationId);
  if (!id) return { error: "Невалиден разговор." };
  deleteConversation(id);
  return { ok: true };
}

export async function saveChatSettingsAction(input: ChatSettings): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  const title = input?.title;
  const bg = typeof title === "string" ? title : title?.bg;
  if (!String(bg ?? "").trim()) return { error: "Въведете заглавие на чата (на български)." };
  writeSetting("chat", normalizeChat(input));
  revalidatePath("/", "layout");
  return { ok: true };
}
