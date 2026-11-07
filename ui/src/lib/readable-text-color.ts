export type Ink = {
  /** Drawn on light backdrops. */
  dark: string;
  /** Drawn on dark backdrops. */
  light: string;
};

/**
 * Near-black and pure white.
 *
 * White is not `#fafafa` and black is not the theme's `--foreground`, and neither is an
 * oversight: the backdrop here is a colour the user picked, not a surface the theme owns, so the
 * ink must not flip when the theme does. A chip that reads in light mode and vanishes in dark
 * mode is the bug this whole function exists to stop.
 */
export const INK: Ink = { dark: "#000000", light: "#ffffff" };

/** `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, with or without the `#`. */
const HEX = /^#?(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * The three channels of a hex colour as 0–1, or nothing.
 *
 * Alpha is parsed and dropped. Compositing it would need the colour *behind* the swatch, which
 * is the one thing a function taking a single colour cannot know — and guessing white would be
 * wrong in dark mode, which is where a translucent chip is hardest to read.
 */
/** `#rgb` and `#rgba`: the longest a shorthand colour gets. */
const SHORTHAND_DIGITS = 4;
const HEX_RADIX = 16;
const CHANNEL_MAX = 255;
/** Where the red, green and blue pairs start in `rrggbb`, and how long each is. */
const RED = 0;
const GREEN = 2;
const BLUE = 4;
const CHANNEL_DIGITS = 2;

function channels(hex: string): [number, number, number] | undefined {
  if (HEX.test(hex) === false) {
    return undefined;
  }

  const digits = hex.replace("#", "");
  // Shorthand doubles each digit — `#f80` is `#ff8800`, not `#0f0800`. auto-cal's version slices
  // fixed offsets out of the string instead, so a three-digit colour parses as something else
  // entirely and returns an ink for a colour nobody picked.
  const full =
    digits.length <= SHORTHAND_DIGITS
      ? digits
          .split("")
          .map((digit) => digit + digit)
          .join("")
      : digits;

  return [RED, GREEN, BLUE].map(
    (at) => Number.parseInt(full.slice(at, at + CHANNEL_DIGITS), HEX_RADIX) / CHANNEL_MAX,
  ) as [number, number, number];
}

/** The sRGB transfer function's constants, as WCAG 2.x writes them. */
const SRGB_LINEAR_BELOW = 0.04045;
const SRGB_LINEAR_DIVISOR = 12.92;
const SRGB_OFFSET = 0.055;
const SRGB_SCALE = 1.055;
const SRGB_GAMMA = 2.4;
/** How much each channel counts towards how bright a colour looks. */
const RED_WEIGHT = 0.2126;
const GREEN_WEIGHT = 0.7152;
const BLUE_WEIGHT = 0.0722;
/** WCAG's allowance for flare, added to both luminances so black on black is 1 and not 0 / 0. */
const FLARE = 0.05;

/** WCAG 2.x relative luminance. The piecewise curve is the standard sRGB transfer function. */
function luminance([r, g, b]: [number, number, number]): number {
  const linear = ([r, g, b] as const).map((channel) =>
    channel <= SRGB_LINEAR_BELOW
      ? channel / SRGB_LINEAR_DIVISOR
      : ((channel + SRGB_OFFSET) / SRGB_SCALE) ** SRGB_GAMMA,
  ) as [number, number, number];

  return RED_WEIGHT * linear[0] + GREEN_WEIGHT * linear[1] + BLUE_WEIGHT * linear[2];
}

/** WCAG 2.x contrast between two relative luminances, 1 through 21. */
function contrast(a: number, b: number): number {
  const [lighter, darker] = a > b ? [a, b] : [b, a];
  return (lighter + FLARE) / (darker + FLARE);
}

/**
 * Ink for text sitting on a colour the user chose: a calendar event, a tag, a selected chip.
 * The dark ink or the light one, whichever has the higher contrast ratio against the backdrop.
 *
 * Returns `undefined` for anything that is not a hex colour, so a caller falls back to the
 * inherited foreground rather than painting black onto a value it failed to read.
 *
 * ```tsx
 * <span style={{ background: tag.color, color: readableTextColor(tag.color) }}>{tag.name}</span>
 * ```
 */
export function readableTextColor(
  color: string | null | undefined,
  ink: Ink = INK,
): string | undefined {
  if (!color) {
    return undefined;
  }

  const rgb = channels(color);
  if (!rgb) {
    return undefined;
  }

  const backdrop = luminance(rgb);
  return contrast(backdrop, 0) >= contrast(backdrop, 1) ? ink.dark : ink.light;
}
