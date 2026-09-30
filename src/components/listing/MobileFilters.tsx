"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { fmt } from "@/i18n";
import { useDict, useLang } from "@/i18n/client";
import { plural } from "@/lib/format";
import { Drawer } from "@/components/ui/Drawer";

/**
 * Phones and tablets (< lg): "Филтри (3)" opens a bottom sheet with the server-rendered filter sidebar (`children`).
 * The filters are links, so the sheet stays open while the results update behind it; "Покажи N продукта" closes it.
 */
export function MobileFilters({ active, total, children }: { active: number; total: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const lang = useLang();
  const t = useDict().listing;
  const close = () => setOpen(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className="btn btn-outline h-11 min-h-0 w-full px-4 text-[0.9rem] hover:bg-canvas hover:text-ink sm:w-auto lg:hidden">
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        {active ? fmt(t.filters.withCount, { n: active }) : t.filters.title}
      </button>
      <Drawer
        open={open}
        onClose={close}
        side="bottom"
        title={t.filters.title}
        className="lg:hidden"
        bodyClassName="px-4"
        footer={
          <button type="button" onClick={close} className="btn btn-primary h-12 w-full">
            {plural(lang, total, { one: t.filters.showOne, other: t.filters.show })}
          </button>
        }
      >
        {children}
      </Drawer>
    </>
  );
}
