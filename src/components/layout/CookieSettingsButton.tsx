"use client";

import { Cookie } from "lucide-react";
import { useDict } from "@/i18n/client";
import { useConsent } from "@/components/consent/ConsentProvider";

/** Footer link "Настройки за бисквитки": re-opens the cookie settings at any time (withdrawing consent is as easy as giving it). */
export function CookieSettingsButton({ className }: { className?: string }) {
  const dict = useDict();
  const { openSettings } = useConsent();
  return (
    <button type="button" onClick={openSettings} className={className} aria-haspopup="dialog">
      <Cookie className="h-4 w-4 shrink-0" aria-hidden />
      {dict.footer.cookieSettings}
    </button>
  );
}
