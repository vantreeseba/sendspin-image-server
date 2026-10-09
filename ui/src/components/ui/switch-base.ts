export type SwitchProps = {
  checked?: boolean | undefined;
  /** Where an uncontrolled switch starts. Ignored once `checked` is passed. */
  defaultChecked?: boolean | undefined;
  onCheckedChange?: ((checked: boolean) => void) | undefined;
  /** Web only: what a `<label htmlFor>` points at. */
  id?: string | undefined;
  disabled?: boolean | undefined;
  /** See `checkbox-base.ts`: a bound field marks itself touched from this. */
  onBlur?: (() => void) | undefined;
  /**
   * The switch's name, as `aria-label`. What names it on device, where there is no
   * `<label htmlFor>` to borrow one from; on the web a label pointed at `id` can do it instead.
   */
  accessibilityLabel?: string | undefined;
  /**
   * The name by reference: the id of visible text that names the switch, such as a `SettingRow`'s
   * title. The web honours it, Android reads it, iOS does not — a native caller that needs the
   * name on an iPhone passes `accessibilityLabel` too.
   */
  "aria-labelledby"?: string | undefined;
  /**
   * What says more about the switch — a `SwitchField`'s `description` — by id. Web only: React
   * Native has no description relation, so on device the line is read where it is drawn.
   */
  "aria-describedby"?: string | undefined;
  className?: string | undefined;
};

/** Shared between the two files so the track cannot drift between platforms. */
export const SWITCH_TRACK_CLASS =
  "h-5 w-9 shrink-0 flex-row items-center rounded-full border-2 border-transparent";
/** The switch's thumb: the circle that slides along the track. */
export const SWITCH_THUMB_CLASS = "h-4 w-4 rounded-full bg-background";
