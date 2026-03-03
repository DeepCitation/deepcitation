import type { MutableRefObject, Ref } from "react";

/** Safely assign a value to a React ref (callback or object). */
export function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (!ref) return;
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  (ref as MutableRefObject<T | null>).current = value;
}

/** Compose multiple refs into a single callback ref. */
export function composeRefs<T>(...refs: Array<Ref<T> | undefined>) {
  return (node: T | null) => {
    for (const ref of refs) {
      assignRef(ref, node);
    }
  };
}
