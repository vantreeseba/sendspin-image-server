import type { ReactNode } from "react";

export type LabelProps = {
  /**
   * Associates the label with a control's `id`, so clicking it focuses the
   * control. Web only — there is no native equivalent, and the native file
   * ignores it rather than pretending otherwise.
   */
  htmlFor?: string | undefined;
  /**
   * What a control's `aria-labelledby` points at — the way to name a control no `htmlFor` can
   * reach, on either platform. React Native takes `id` as the `Text`'s `nativeID`.
   */
  id?: string | undefined;
  className?: string | undefined;
  children?: ReactNode;
};

/**
 * Shared between both implementations so the two cannot drift on type size or
 * weight. `peer-disabled:` is a DOM-only variant and simply does not apply on
 * native, where a disabled control does not dim its label.
 */
export const LABEL_CLASS =
  "text-foreground text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70";
