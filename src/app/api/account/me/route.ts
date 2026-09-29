// GET -> { customer: { firstName, lastName, email } | null }: the header's account button asks here, so the shop
// pages stay static. It also slides the "remember me" cookie (only Route Handlers / Server Actions can re-send
// cookies). `lastName` is an additive field (initials in the header); firstName + email are the original contract.
import { NextResponse } from "next/server";
import { getCustomer, refreshCustomerCookie } from "@/lib/customer-auth";

export type MeResponse = { customer: { firstName: string; email: string; lastName?: string } | null };

export async function GET() {
  const c = await getCustomer();
  if (c) await refreshCustomerCookie();
  const body: MeResponse = { customer: c ? { firstName: c.firstName, lastName: c.lastName, email: c.email } : null };
  return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
}
