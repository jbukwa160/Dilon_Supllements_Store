import { Fragment } from "react";

/**
 * A dictionary template with React nodes in place of its "{tokens}": <Rich text={t.left} values={{ amount: <strong>7,60 €</strong> }} />.
 * Unknown tokens are left as they are. Server- and client-safe (no hooks).
 */
export function Rich({ text, values }: { text: string; values: Record<string, React.ReactNode> }) {
  const parts = text.split(/(\{\w+\})/g);
  return (
    <>
      {parts.map((part, i) => {
        const m = /^\{(\w+)\}$/.exec(part);
        return <Fragment key={i}>{m && m[1] in values ? values[m[1]] : part}</Fragment>;
      })}
    </>
  );
}
