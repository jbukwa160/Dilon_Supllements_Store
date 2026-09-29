"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { fmt } from "@/i18n";
import { useDict, useLang } from "@/i18n/client";
import { localizeHref } from "@/lib/links";

// Unexpected errors in a storefront page (the shop header and footer stay). "Опитай отново" re-fetches the page.
// The digest identifies the error in the server log without exposing its details.
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const lang = useLang();
  const dict = useDict();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="container-shop flex flex-col items-center py-16 text-center md:py-24" role="alert">
      <span className="grid h-16 w-16 place-items-center rounded-full bg-accent text-ink" aria-hidden>
        <TriangleAlert className="h-8 w-8" strokeWidth={1.75} />
      </span>
      <h1 className="mt-6 text-balance text-3xl font-bold md:text-4xl">{dict.errors.genericTitle}</h1>
      <p className="mt-3 max-w-xl text-lg text-muted">{dict.errors.genericText}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => retry()} className="btn btn-primary h-12 px-7">
          <RotateCcw className="h-5 w-5" aria-hidden /> {dict.common.retry}
        </button>
        <Link href={localizeHref("/", lang)} className="btn btn-outline h-12 px-7">
          {dict.common.backHome}
        </Link>
      </div>
      {error.digest ? <p className="mt-6 text-xs text-muted">{fmt(dict.errors.code, { code: error.digest })}</p> : null}
    </div>
  );
}
