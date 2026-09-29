"use server";

// Contact form → e-mail to the store address from Настройки (reply-to = the visitor). Honeypot field "website"
// (bots fill it: we pretend success and send nothing) and a per-IP rate limit. Nothing is stored in the database.
import type { ContactField, ContactFieldError, ContactState } from "@/components/info/contact-types";
import { isLang } from "@/i18n/config";
import { EMAIL_RE } from "@/lib/customer-auth";
import { sendMail } from "@/lib/mail";
import { rateLimited } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";

const MAX_MESSAGE = 5000;

function field(fd: FormData, name: string, max: number): string {
  const v = fd.get(name);
  return typeof v === "string" ? v.slice(0, max) : "";
}

/** One line of user input for an e-mail header-like line (no line breaks). */
const oneLine = (s: string) => s.replace(/[\r\n\t]+/g, " ").trim();

export async function sendContactMessage(_prev: ContactState | null, fd: FormData): Promise<ContactState> {
  if (field(fd, "website", 200).trim()) return { ok: true, email: "" };

  const lang = isLang(field(fd, "lang", 5)) ? field(fd, "lang", 5) : "bg";
  const name = oneLine(field(fd, "name", 200)).slice(0, 100);
  const email = oneLine(field(fd, "email", 300)).slice(0, 200);
  const phone = oneLine(field(fd, "phone", 100)).slice(0, 40);
  const order = oneLine(field(fd, "order", 100)).slice(0, 30);
  const rawMessage = field(fd, "message", MAX_MESSAGE + 1).replace(/\r\n?/g, "\n").trim();

  const fields: Partial<Record<ContactField, ContactFieldError>> = {};
  if (!name) fields.name = "name";
  if (!EMAIL_RE.test(email)) fields.email = "email";
  if (rawMessage.length < 10) fields.message = "message";
  else if (rawMessage.length > MAX_MESSAGE) fields.message = "tooLong";
  if (Object.keys(fields).length) return { ok: false, error: "fields", fields };

  if (await rateLimited("contact-form", 5, 10 * 60_000)) return { ok: false, error: "rateLimited" };

  const s = getSettings();
  const text = [
    `Съобщение от формата за контакт на сайта (${lang === "en" ? "английска" : "българска"} версия).`,
    "",
    `Име: ${name}`,
    `Имейл: ${email}`,
    `Телефон: ${phone || "—"}`,
    `Номер на поръчка: ${order || "—"}`,
    "",
    rawMessage,
    "",
    "— Отговорете направо на този имейл, за да пишете на клиента.",
  ].join("\n");
  const res = await sendMail({ to: s.email, replyTo: email, subject: `Съобщение от сайта — ${name}${order ? ` (поръчка ${order})` : ""}`, text });
  if (!res.ok) return { ok: false, error: "failed" };
  return { ok: true, email };
}
