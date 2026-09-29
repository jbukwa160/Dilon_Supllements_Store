"use client";

import { Cookie } from "lucide-react";
import { useDict } from "@/i18n/client";
import { useConsent } from "@/components/consent/ConsentProvider";

/** Opens the cookie settings dialog of the consent banner (the same as the footer link "Настройки за бисквитки"). */
export function CookieSettingsButton() {
  const { openSettings } = useConsent();
  const t = useDict().info.cookieSettings;
  return (
    <button type="button" onClick={() => openSettings()} className="btn btn-primary">
      <Cookie className="h-5 w-5" aria-hidden />
      {t.button}
    </button>
  );
}
