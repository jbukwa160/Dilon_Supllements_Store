import { Fragment } from "react";

/**
 * Like fmt() from @/i18n, but the values may be React nodes (links inside a translated sentence):
 * fmtNodes("Повече — в {link}.", { link: <Link …>Политиката</Link> }). Unknown tokens stay as text.
 */
export function fmtNodes(template: string, vars: Record<string, React.ReactNode>): React.ReactNode {
  const parts = template.split(/(\{\w+\})/g);
  return parts.map((p, i) => {
    const m = p.match(/^\{(\w+)\}$/);
    return <Fragment key={i}>{m && m[1] in vars ? vars[m[1]] : p}</Fragment>;
  });
}
