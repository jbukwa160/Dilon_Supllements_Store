"use client";

import { useEffect } from "react";
import { setAccount } from "./account-store";

/**
 * Rendered by the (dynamic) account and sign-in pages, which know from the session cookie who is signed in:
 * tells the header account button without another request, and corrects it after signing in / out.
 */
export function AccountSync({ customer }: { customer: { firstName: string; lastName: string; email: string } | null }) {
  const firstName = customer?.firstName ?? null;
  const lastName = customer?.lastName ?? "";
  const email = customer?.email ?? null;
  useEffect(() => {
    setAccount(firstName !== null && email !== null ? { firstName, lastName, email } : null);
  }, [firstName, lastName, email]);
  return null;
}
