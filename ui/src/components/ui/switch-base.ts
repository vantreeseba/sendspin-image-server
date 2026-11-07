import type { TooltipSide } from "@/components/ui/tooltip-base";

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
  /**
   * The switch's tooltip, as on `Button`: shown on hover and focus on the web and on a long press on
   * device, and the switch's description. With it, `disabled` keeps the switch focusable and
   * refuses the press (`aria-disabled`), so the reason it cannot be changed can still be read —
   * "Turn the task on first".
   */
  hint?: string | undefined;
  /** Which edge of the switch the tooltip sits on. The default is `top`. */
  side?: TooltipSide | undefined;
  className?: string | undefined;
};

/**
 * Shared between the two files so the track cannot drift between platforms. No shadow: the track
 * sits in the page's flow, and only what floats draws one.
 */
export const SWITCH_TRACK_CLASS =
  "h-5 w-9 shrink-0 flex-row items-center rounded-full border-2 border-transparent";
/**
 * An on switch's track: the chosen tint, edged in `active` because the tint is not 3:1 from the
 * surface, and a step further under the pointer.
 */
export const SWITCH_TRACK_ON_CLASS = "border-active bg-active/40 hover:bg-active/60";
/**
 * The switch's thumb: the circle that slides along the track. The one part laid over another, so
 * the smallest shadow — not a dialog's `shadow-lg`. Off, it is `background` on the `/50` track; on,
 * it is `foreground`, as a chosen thing's mark is, because `background` on the tint is under 3:1.
 */
export const SWITCH_THUMB_CLASS = "h-4 w-4 rounded-full shadow-sm";
