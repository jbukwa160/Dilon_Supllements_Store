import { Fragment } from "react";

/**
 * fmt() for JSX: replaces "{name}" tokens in a dictionary string with React nodes, e.g.
 * rich(dict.header.giftOver, { amount: <strong>40 €</strong> }). Unknown tokens stay as they are.
 */
export function rich(template: string, vars: Record<string, React.ReactNode>): React.ReactNode {
  const parts = template.split(/(\{\w+\})/g);
  return parts.map((part, i) => {
    const m = part.match(/^\{(\w+)\}$/);
    return <Fragment key={i}>{m && m[1] in vars ? vars[m[1]] : part}</Fragment>;
  });
}
