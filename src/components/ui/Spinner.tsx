import clsx from "clsx";
import { LoaderCircle } from "lucide-react";

/** Loading indicator. With a `label` (e.g. dict.common.loading) it is announced politely; without, it is decorative. */
export function Spinner({ className, label }: { className?: string; label?: string }) {
  const icon = <LoaderCircle className={clsx("h-5 w-5 animate-spin", className)} aria-hidden />;
  if (!label) return icon;
  return (
    <span role="status" className="inline-flex items-center">
      {icon}
      <span className="sr-only">{label}</span>
    </span>
  );
}
