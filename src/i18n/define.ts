// Dictionaries are written as { bg: {...}, en: {...} }. Bulgarian is the source of truth; the
// English half must have exactly the same keys (a missing or extra key fails `tsc`).

/** Same shape as T, with every string literal widened to `string`. */
export type Widen<T> = T extends string ? string : { [K in keyof T]: Widen<T[K]> };

export function defineMessages<T>(m: { bg: T; en: Widen<T> }) {
  return m;
}
