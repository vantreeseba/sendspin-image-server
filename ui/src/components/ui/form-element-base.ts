import type { ReactNode } from "react";

export type FormElementProps = {
  /** Submits the form. Web wires it to the DOM submit event; native does not. */
  onSubmit: () => void;
  /**
   * The `<form>`'s id on web, for a submit control that sits outside it and names it with
   * `form="…"` — a dialog's footer, a card's. Native has no form element to name.
   */
  id?: string | undefined;
  className?: string | undefined;
  children?: ReactNode;
};
