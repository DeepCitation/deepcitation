import "react-dom";

declare module "react-dom" {
  import type { ReactNode } from "react";

  export function render(element: ReactNode, container: Element | DocumentFragment | null): void;
  export function unmountComponentAtNode(container: Element | DocumentFragment): void;
}
