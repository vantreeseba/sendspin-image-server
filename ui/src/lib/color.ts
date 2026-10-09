const HEX_RADIX = 16;
/** The largest value of one `rr` channel. */
const CHANNEL_MAX = 255;
/** Where each channel's two digits start in `#rrggbb`. */
const RED = 1;
const GREEN = 3;
const BLUE = 5;
const CHANNEL_DIGITS = 2;

/** The colour wheel is six sectors of sixty degrees, and each channel leads two of them. */
const HUE_SECTORS = 6;
const GREEN_SECTOR = 2;
const BLUE_SECTOR = 4;
const FULL_TURN = 360;
const PERCENT = 100;

/** The lightest and darkest an accent may be and still show on both a light and a dark card. */
const ACCENT_MIN_LIGHTNESS = 0.38;
const ACCENT_MAX_LIGHTNESS = 0.62;

function channel(hex: string, start: number): number {
  return Number.parseInt(hex.slice(start, start + CHANNEL_DIGITS), HEX_RADIX) / CHANNEL_MAX;
}

/** Parses a `#rrggbb` colour into hue (0–360), saturation and lightness (0–1). */
export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = channel(hex, RED);
  const g = channel(hex, GREEN);
  const b = channel(hex, BLUE);

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) {
      h = ((g - b) / d + (g < b ? HUE_SECTORS : 0)) / HUE_SECTORS;
    } else if (max === g) {
      h = ((b - r) / d + GREEN_SECTOR) / HUE_SECTORS;
    } else {
      h = ((r - g) / d + BLUE_SECTOR) / HUE_SECTORS;
    }
  }

  return { h: Math.round(h * FULL_TURN), s, l };
}

/**
 * Keeps the hue but clamps lightness to a mid range, so a near-white or
 * near-black pick cannot disappear against either the light or the dark card.
 */
export function hexToAccent(hex: string): string {
  const { h, s, l } = hexToHsl(hex);
  const clampedL = Math.min(ACCENT_MAX_LIGHTNESS, Math.max(ACCENT_MIN_LIGHTNESS, l));
  return `hsl(${h}, ${Math.round(s * PERCENT)}%, ${Math.round(clampedL * PERCENT)}%)`;
}

/** A desaturated, high-lightness tint of a colour, for a background behind text. */
export function hexToDesaturated(hex: string): string {
  const { h } = hexToHsl(hex);
  return `hsl(${h}, 25%, 88%)`;
}
