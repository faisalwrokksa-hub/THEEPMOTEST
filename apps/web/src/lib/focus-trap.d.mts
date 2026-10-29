export function focusWrapTarget<T extends HTMLElement>(
  active: Element | null,
  focusable: readonly T[],
  backwards: boolean,
): T | null;
