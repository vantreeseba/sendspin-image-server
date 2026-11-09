export type CheckboxProps = {
  checked?: boolean | undefined;
  /** Where an uncontrolled box starts. Ignored once `checked` is passed. */
  defaultChecked?: boolean | undefined;
  onCheckedChange?: ((checked: boolean) => void) | undefined;
  disabled?: boolean | undefined;
  /**
   * Fired when the control loses focus. A bound field marks itself touched from
   * this, which is what decides whether an error is shown yet — so a checkbox
   * without one is a required field that never reports itself as unfilled.
   */
  onBlur?: (() => void) | undefined;
  /**
   * Required on device: the box carries no visible label of its own, and there is no
   * `<label htmlFor>` to borrow one from. (On web a `<Label htmlFor={id}>` or an `aria-label` does
   * it, so the web half does not ask for this — but takes it, as the box's `aria-label`, so a call
   * site shared across both halves is named on both.)
   */
  accessibilityLabel: string;
  /**
   * The value was refused: a validator's error. The edge turns `negative`, over the `active` edge
   * of a checked one, so a required box that is wrong says so whichever state it is in. A bound
   * field sets it; the web half takes it as radix's attribute.
   */
  "aria-invalid"?: boolean | "true" | "false" | undefined;
  className?: string | undefined;
};

/**
 * The box, shared so the two halves cannot drift apart visually.
 *
 * @border-colour each half adds it beside this, from the checked state.
 */
export const CHECKBOX_CLASS = "h-4 w-4 shrink-0 items-center justify-center rounded-sm border";
