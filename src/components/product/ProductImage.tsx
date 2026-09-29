"use client";

import { useCallback, useRef, useState } from "react";
import clsx from "clsx";

const PLACEHOLDER = "/placeholder.svg";

// Owner: C (port of /web).
// Product photos are hotlinked from dozens of supplier hosts, so next/image's allow-list doesn't fit;
// a plain <img> with a friendly fallback does. No referrer, so hosts that block hotlinking by referrer still work.
export function ProductImage({
  src,
  alt,
  className,
  eager = false,
  dim = false,
}: {
  src: string | null;
  alt: string;
  className?: string;
  /** Above the fold (first cards, product page main photo): load at once instead of lazily. */
  eager?: boolean;
  /** Out of stock: faded. */
  dim?: boolean;
}) {
  // The address that failed to load (remembered per address, so a new `src` on the same element gets its chance).
  const [failed, setFailed] = useState<string | null>(null);
  // Set once the element is committed. During hydration React attaches the <img>'s error listener before the
  // component is committed; an error in that window must not update state (React would warn about an update on a
  // component that hasn't mounted yet, and drop it) — the check on commit below catches it instead.
  const mounted = useRef(false);
  const url = !src || failed === src ? PLACEHOLDER : src;
  // A server-rendered photo can fail before React hydrates (or before the commit): check when the element is attached.
  const attach = useCallback(
    (img: HTMLImageElement | null) => {
      mounted.current = !!img;
      if (img && src && img.complete && img.naturalWidth === 0 && img.getAttribute("src") === src) setFailed(src);
    },
    [src],
  );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={attach}
      src={url}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => {
        if (src && mounted.current) setFailed(src);
      }}
      className={clsx("h-full w-full object-contain", dim && "opacity-60 grayscale-35", className)}
    />
  );
}
