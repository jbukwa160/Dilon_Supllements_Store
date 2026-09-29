"use client";

import { useSyncExternalStore } from "react";

// Who is signed in, for the header account button. The shop pages are static, so the browser asks
// GET /api/account/me once per page load; the account pages (dynamic, they know the customer) push the answer in
// directly through <AccountSync>, and sign-in / sign-out forms update it as they succeed.
// Other modules (e.g. the checkout creating an account) call refreshAccount() after changing the session.

export type AccountMe = { firstName: string; lastName?: string; email: string } | null;
export type AccountState = { status: "unknown" | "ready"; customer: AccountMe };

const SERVER: AccountState = { status: "unknown", customer: null };
let state: AccountState = SERVER;
const listeners = new Set<() => void>();
let seq = 0;
let loading: Promise<void> | null = null;

function emit(next: AccountState) {
  state = next;
  for (const l of listeners) l();
}

function same(a: AccountMe, b: AccountMe) {
  return a === b || (!!a && !!b && a.firstName === b.firstName && a.lastName === b.lastName && a.email === b.email);
}

/** Sets the signed-in customer (null = signed out). Newer than any request still in flight. */
export function setAccount(customer: AccountMe) {
  seq++;
  if (state.status === "ready" && same(state.customer, customer)) return;
  emit({ status: "ready", customer });
}

/** Asks the server who is signed in (once per page load unless `force`). */
export function refreshAccount(force = true): Promise<void> {
  if (!force && (state.status === "ready" || loading)) return loading ?? Promise.resolve();
  const mine = ++seq;
  const p = fetch("/api/account/me", { cache: "no-store", credentials: "same-origin", headers: { Accept: "application/json" } })
    .then((r) => (r.ok ? (r.json() as Promise<{ customer?: AccountMe }>) : { customer: null }))
    .then((d) => {
      if (mine !== seq) return;
      const c = d.customer;
      const customer =
        c && typeof c.firstName === "string" && typeof c.email === "string" ? { firstName: c.firstName, lastName: c.lastName ?? "", email: c.email } : null;
      if (!(state.status === "ready" && same(state.customer, customer))) emit({ status: "ready", customer });
    })
    .catch(() => {
      // Offline or the server is restarting: keep what we know; show "Вход" if we knew nothing.
      if (mine === seq && state.status === "unknown") emit({ status: "ready", customer: null });
    })
    .finally(() => {
      if (loading === p) loading = null;
    });
  loading = p;
  return p;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useAccount(): AccountState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER,
  );
}
