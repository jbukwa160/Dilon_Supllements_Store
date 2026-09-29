"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Link2, Share2 } from "lucide-react";
import { useDict } from "@/i18n/client";

/** Facebook, Viber, the phone's own share sheet (when there is one) and "copy link". */
export function ShareButtons({ url, title }: { url: string; title: string }) {
  const t = useDict().blog;
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const enc = encodeURIComponent;
  const btn =
    "inline-flex h-10 items-center gap-2 rounded-pill border-[1.5px] border-line bg-surface px-4 text-sm font-semibold text-ink transition hover:border-ink";

  useEffect(() => {
    // navigator.share exists only in the browser (and mostly on phones), so it is checked after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
    return () => clearTimeout(timer.current);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure context / permissions): nothing to do.
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-sm font-semibold text-muted">{t.share}</span>
      <a className={btn} href={`https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`} target="_blank" rel="noopener noreferrer">
        Facebook
      </a>
      <a className={btn} href={`viber://forward?text=${enc(`${title} ${url}`)}`}>
        Viber
      </a>
      {canShare ? (
        <button type="button" className={btn} onClick={() => navigator.share({ title, url }).catch(() => {})}>
          <Share2 className="h-4 w-4" aria-hidden /> {t.shareMore}
        </button>
      ) : null}
      <button type="button" className={btn} onClick={copy}>
        {copied ? <Check className="h-4 w-4 text-success" strokeWidth={3} aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}
        {copied ? t.copied : t.copyLink}
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? t.copied : ""}
      </span>
    </div>
  );
}
