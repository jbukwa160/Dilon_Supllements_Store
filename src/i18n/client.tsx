"use client";

import { createContext, useContext } from "react";
import { DEFAULT_LANG, type Lang } from "./config";
import { getDict, type Dict } from "./index";

// The page's language for client components. The [lang] layout wraps the shop in <I18nProvider lang={lang}>;
// without a provider (admin previews of storefront components) everything falls back to Bulgarian.
const LangContext = createContext<Lang>(DEFAULT_LANG);

export function I18nProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useLang(): Lang {
  return useContext(LangContext);
}

/** The dictionary of the page's language (small enough to ship to the browser; long legal texts are not in it). */
export function useDict(): Dict {
  return getDict(useContext(LangContext));
}
