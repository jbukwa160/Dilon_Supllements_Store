"use client";

import { useEffect } from "react";

/**
 * Sets the tab title from the browser. For the 404 page only: Next streams a notFound() page as its error shell and
 * renders the tree in the browser from the original request's data, whose metadata is the shop's default title — the
 * localized title in the server HTML (not-found.tsx generateMetadata) would otherwise be replaced after hydration.
 */
export function DocumentTitle({ title }: { title: string }) {
  useEffect(() => {
    document.title = title;
  }, [title]);
  return null;
}
