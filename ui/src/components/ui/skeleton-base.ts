export const skeletonClass = "rounded-md bg-hover";

/**
 * One pulse, down to half opacity and back: Tailwind's `animate-pulse`, which the web half
 * uses, is `2s cubic-bezier(0.4, 0, 0.6, 1)` over exactly that.
 */
export const PULSE_DURATION_MS = 2000;

/** The opacity at the bottom of a pulse, `animate-pulse`'s `50%` keyframe. */
export const PULSE_LOW = 0.5;
