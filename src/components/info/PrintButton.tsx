"use client";

import { Printer } from "lucide-react";
import { useDict } from "@/i18n/client";

/** Prints the page; the print styles of the model withdrawal form leave only the form on paper. */
export function PrintButton() {
  const t = useDict().info;
  return (
    <button type="button" onClick={() => window.print()} className="btn btn-outline print:hidden">
      <Printer className="h-5 w-5" aria-hidden />
      {t.printForm}
    </button>
  );
}
