"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { clearCart, hasPendingCheckout } from "@/lib/store";
import { refreshAccount } from "@/components/account/account-store";

/**
 * Rendered by the order page right after placeOrder redirected here (`?nova=1`): empties the cart and the chosen
 * gifts of the browser that submitted the checkout, updates the header account button (the checkout may have created
 * an account and signed in), then drops the query from the URL (a reload or a shared link must not clear a new cart).
 */
export function ClearCartOnOrder({ href }: { href: string }) {
  const router = useRouter();
  useEffect(() => {
    if (hasPendingCheckout()) clearCart();
    void refreshAccount();
    router.replace(href, { scroll: false });
  }, [href, router]);
  return null;
}
