// Data exchanged between the withdrawal function's Server Actions (app/[lang]/(shop)/otkaz-ot-dogovor/actions.ts) and
// its client component (WithdrawalFlow). Everything is already formatted for the page's language.

/**
 * The order as the customer sees it in steps 2–3 (after the order number + e-mail were verified). Deliberately
 * minimal — whoever knows a number + e-mail pair must not learn more than needed to pick the lines: no prices, and
 * the name shortened ("Иван П.") unless the signed-in owner looks it up.
 */
export type WithdrawalOrderView = {
  number: number;
  /** Order date, formatted. */
  date: string;
  /** Customer name on the order (shortened for look-ups by number + e-mail). */
  name: string;
  /** Where the acknowledgement goes (the order's e-mail). */
  ackEmail: string;
  /** "До:" line of the statement: the merchant's legal name, address and e-mail. */
  trader: string;
  lines: { line: number; kind: "item" | "gift"; name: string; variant: string | null; qty: number }[];
  /** Earlier statements for this order ("29 септември 2026 г., 14:05"). */
  previous: string[];
};

export type WithdrawalError = "invalid" | "notFound" | "rateLimited" | "expired" | "cancelled" | "noItems" | "failed";

export type LookupState = { ok: true; order: WithdrawalOrderView } | { ok: false; error: WithdrawalError };

/** What the success step repeats from the acknowledgement e-mail. */
export type WithdrawalReceipt = {
  id: number;
  orderNumber: number;
  date: string;
  time: string;
  email: string;
  /** The acknowledgement e-mail was sent. */
  mailed: boolean;
  returnAddress: string;
  refund: string;
  cod: boolean;
  /** Partial withdrawal from an order with a free gift. */
  giftNote: boolean;
  wholeOrder: boolean;
  lines: string[];
  reason: string | null;
};

export type ConfirmState = { ok: true; receipt: WithdrawalReceipt } | { ok: false; error: WithdrawalError };
