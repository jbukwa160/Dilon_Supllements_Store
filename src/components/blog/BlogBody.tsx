import Link from "next/link";
import clsx from "clsx";
import { ArrowRight, Lightbulb } from "lucide-react";
import type { Lang } from "@/i18n/config";
import type { ProductCard as Card } from "@/lib/catalog-types";
import type { Block, Inline } from "@/lib/blog-markup";
import { isExternalHref, localizeHref } from "@/lib/links";
import { ProductCard } from "@/components/product/ProductCard";

// Renders a post's blocks (see lib/blog-markup.ts). No hooks and no server-only code: used on the site and in the
// admin editor's live preview. Stored links are language-neutral; English pages get "/en" here.

const linkClass = "font-semibold text-primary underline decoration-primary/35 underline-offset-[3px] hover:decoration-primary";

function SmartLink({ href, lang, className, children }: { href: string; lang: Lang; className?: string; children: React.ReactNode }) {
  if (isExternalHref(href)) {
    return (
      <a href={href} target="_blank" rel="noopener" className={className}>
        {children}
      </a>
    );
  }
  if (!href.startsWith("/")) {
    // mailto: / tel:
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={localizeHref(href, lang)} className={className}>
      {children}
    </Link>
  );
}

function Inlines({ nodes, lang }: { nodes: Inline[]; lang: Lang }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.t) {
          case "text":
            return n.v;
          case "br":
            return <br key={i} />;
          case "b":
            return (
              <strong key={i} className="font-bold text-ink">
                <Inlines nodes={n.c} lang={lang} />
              </strong>
            );
          case "i":
            return (
              <em key={i}>
                <Inlines nodes={n.c} lang={lang} />
              </em>
            );
          case "a":
            return (
              <SmartLink key={i} href={n.href} lang={lang} className={linkClass}>
                <Inlines nodes={n.c} lang={lang} />
              </SmartLink>
            );
        }
      })}
    </>
  );
}

export function BlogBody({ blocks, products, lang }: { blocks: Block[]; products: Record<string, Card>; lang: Lang }) {
  return (
    <div className="text-[1.0625rem] leading-[1.75] text-ink-soft">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "h2":
            return (
              <h2 key={i} id={b.id} className="h-title mb-3 mt-10 scroll-mt-28 text-[1.45rem] text-ink md:text-[1.8rem]">
                {b.text}
              </h2>
            );
          case "h3":
            return (
              <h3 key={i} id={b.id} className="mb-2 mt-7 scroll-mt-28 text-xl font-bold leading-snug text-ink">
                {b.text}
              </h3>
            );
          case "p":
            return (
              <p key={i} className="my-4">
                <Inlines nodes={b.c} lang={lang} />
              </p>
            );
          case "ul":
            return (
              <ul key={i} className="my-4 list-disc space-y-2 pl-6 marker:text-primary">
                {b.items.map((it, j) => (
                  <li key={j} className="pl-1">
                    <Inlines nodes={it} lang={lang} />
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="my-4 list-decimal space-y-2 pl-6 marker:font-bold marker:text-primary">
                {b.items.map((it, j) => (
                  <li key={j} className="pl-1">
                    <Inlines nodes={it} lang={lang} />
                  </li>
                ))}
              </ol>
            );
          case "quote":
            return (
              <aside key={i} className="my-6 flex gap-3 rounded-lg border-l-4 border-accent-600 bg-primary-50 px-5 py-4 font-medium text-ink">
                <Lightbulb className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden />
                <p>
                  <Inlines nodes={b.c} lang={lang} />
                </p>
              </aside>
            );
          case "image":
            return (
              <figure key={i} className="my-7">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b.src} alt={b.alt} loading="lazy" referrerPolicy="no-referrer" className="w-full rounded-lg border border-line bg-surface object-contain" />
                {b.alt ? <figcaption className="mt-2 text-center text-sm text-muted">{b.alt}</figcaption> : null}
              </figure>
            );
          case "products": {
            const list = b.skus.map((s) => products[s]).filter((p): p is Card => !!p);
            if (!list.length) return null;
            return (
              <div key={i} className="my-7 rounded-xl border border-line bg-primary-50/60 p-3 sm:p-4">
                <ul className={clsx("grid gap-3", list.length === 1 ? "max-w-[15rem] grid-cols-1" : "grid-cols-2 md:grid-cols-3")}>
                  {list.map((p) => (
                    <li key={p.id}>
                      <ProductCard product={p} lang={lang} />
                    </li>
                  ))}
                </ul>
              </div>
            );
          }
          case "button":
            return (
              <p key={i} className="my-8 text-center">
                <SmartLink href={b.href} lang={lang} className="btn btn-primary h-auto min-h-12 max-w-full whitespace-normal px-7 py-3">
                  {b.label} <ArrowRight className="h-4 w-4" aria-hidden />
                </SmartLink>
              </p>
            );
        }
      })}
    </div>
  );
}
