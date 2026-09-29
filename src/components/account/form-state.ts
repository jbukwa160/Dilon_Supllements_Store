// State returned by the account Server Actions to their forms (useActionState). Plain types: imported by the
// "use server" action files and by the client forms.
import type { Dict } from "@/i18n";

/** A key of dict.account.errors. */
export type AccountError = keyof Dict["account"]["errors"];

export type FormState = {
  /** The action succeeded (forms that stay on the page show their success message). */
  ok?: boolean;
  /** Form-level error (shown in the alert above the submit button). */
  error?: AccountError;
  /** Values for the error message ({minutes} of "locked", {n} of "too_many"). */
  vars?: Record<string, string | number>;
  /** Field-level errors by input name. */
  fields?: Partial<Record<string, AccountError>>;
  /** Values echoed back (React resets the form after an action); never passwords. */
  values?: Record<string, string>;
} | null;

/** Language-neutral paths of the sign-in pages (never used as the "next" page after signing in). */
export const AUTH_PATHS = ["/vhod", "/registratsia", "/zabravena-parola", "/nova-parola"];

/** Account area pages (signed-in only). */
export const ACCOUNT_PATH = /^\/profil(?:[/?#]|$)/;
