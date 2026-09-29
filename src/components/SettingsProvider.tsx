"use client";

import { createContext, useContext } from "react";
import { DEFAULT_SETTINGS, publicSettings, type PublicSettings } from "@/lib/settings-types";

// Store settings for client components (free-shipping threshold, shipping prices, contacts…), already in the page's
// language. ShopChrome fills it with publicSettings(getSettings(), lang); without a provider (admin previews of
// storefront components) the defaults are used.
const Ctx = createContext<PublicSettings>(publicSettings(DEFAULT_SETTINGS));

export function SettingsProvider({ value, children }: { value: PublicSettings; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Store settings edited in the admin panel (Настройки). */
export function useSettings(): PublicSettings {
  return useContext(Ctx);
}
