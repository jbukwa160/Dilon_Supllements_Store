// Result of the contact form's Server Action (app/[lang]/(shop)/kontakti/actions.ts), read by ContactForm.
export type ContactField = "name" | "email" | "message";
export type ContactFieldError = "name" | "email" | "message" | "tooLong";

export type ContactState =
  | { ok: true; email: string }
  | { ok: false; error: "fields"; fields: Partial<Record<ContactField, ContactFieldError>> }
  | { ok: false; error: "rateLimited" | "failed" };
