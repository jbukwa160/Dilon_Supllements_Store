import { notFound } from "next/navigation";

// Any unknown address under a language -> the localized app/[lang]/not-found.tsx (inside the shop header/footer).
export default function CatchAll() {
  notFound();
}
