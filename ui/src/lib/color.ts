import { hexChannels, luminance } from "@/lib/readable-text-color";

/** The colour wheel is six sectors of sixty degrees, and each channel leads two of them. */
const HUE_SECTORS = 6;
const GREEN_SECTOR = 2;
const BLUE_SECTOR = 4;
const FULL_TURN = 360;

/**
 * The darkest and lightest an accent may be when the theme is not known, as WCAG relative
 * luminance: the band that is 3:1 (WCAG 1.4.11, a mark someone has to see) from the page and from
 * a card in every palette `@cubeui/tokens` ships, so a stripe shows in whichever theme is on. The
 * light card (0.91) caps the band at 0.27 and Monokai's card (0.028) floors it at 0.18; these sit
 * inside that, with room for rounding to a hex. `color.test.ts` holds them to every palette.
 *
 * It was HSL lightness 0.38–0.62, which is not how light a colour looks: a yellow at 0.5 was
 * 1.07:1 on the light page and a navy 1.68:1 on the dark one (#471).
 */
const ACCENT_MIN_LUMINANCE = 0.19;
const ACCENT_MAX_LUMINANCE = 0.26;
/** WCAG 1.4.11's floor for a mark someone has to see, against what is either side of it. */
const ACCENT_CONTRAST = 3;
/** WCAG's allowance for flare, added to both luminances, as `readable-text-color` adds it. */
const FLARE = 0.05;
/** Halvings of the lightness search: far finer than a hex can say. */
const SEARCH_STEPS = 24;
const HALF = 0.5;
const CHANNEL_MAX = 255;
const HEX_RADIX = 16;
const HEX_DIGITS = 2;

/** Red, green and blue in each sixty-degree sector of the wheel, from the chroma and the second. */
const SECTORS: readonly ((c: number, x: number) => [number, number, number])[] = [
  (c, x) => [c, x, 0],
  (c, x) => [x, c, 0],
  (c, x) => [0, c, x],
  (c, x) => [0, x, c],
  (c, x) => [x, 0, c],
  (c, x) => [c, 0, x],
];

/**
 * Hue (0–360), saturation and lightness (0–1) of a hex colour.
 *
 * @param hex - `#rgb` or `#rrggbb`, with or without the `#`; an alpha digit is dropped.
 * @returns The three, or `undefined` for anything that is not a hex colour.
 */
export function hexToHsl(hex: string): { h: number; s: number; l: number } | undefined {
  const rgb = hexChannels(hex);
  if (!rgb) {
    return undefined;
  }
  const [r, g, b] = rgb;

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

/** Red, green and blue as 0–1 from hue (0–360), saturation and lightness (0–1). */
function hslChannels(h: number, s: number, l: number): [number, number, number] {
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const sector = (h / (FULL_TURN / HUE_SECTORS)) % HUE_SECTORS;
  const second = chroma * (1 - Math.abs((sector % 2) - 1));
  const base = l - chroma * HALF;
  const [r, g, b] = SECTORS[Math.floor(sector)]?.(chroma, second) ?? [0, 0, 0];
  return [r + base, g + base, b + base];
}

function toHex(channels: [number, number, number]): string {
  return `#${channels
    .map((c) =>
      Math.round(c * CHANNEL_MAX)
        .toString(HEX_RADIX)
        .padStart(HEX_DIGITS, "0"),
    )
    .join("")}`;
}

/**
 * The page and the card of the theme an accent is drawn in, as hex: what it has to be seen
 * against. `useSurfaceColors` (`@cubeui/surface-colors`) reads them where the accent is drawn.
 */
export type AccentSurfaces = { readonly page: string; readonly card: string };

/** A colour's channels as a hex draws them, so a search measures the colour it will return. */
function asDrawn(channels: [number, number, number]): [number, number, number] {
  return channels.map((c) => Math.round(c * CHANNEL_MAX) / CHANNEL_MAX) as [number, number, number];
}

/**
 * The HSL lightness where a hue and saturation reach a luminance, found by halving: luminance
 * rises with lightness at a fixed hue and saturation. `atLeast` is the darkest lightness at or over
 * `target`, and otherwise the lightest at or under it.
 */
function lightnessFor(
  hsl: { h: number; s: number },
  target: number,
  atLeast: boolean,
  from = 0,
  to = 1,
): number {
  let low = from;
  let high = to;
  for (let step = 0; step < SEARCH_STEPS; step++) {
    const mid = (low + high) * HALF;
    const lit = luminance(asDrawn(hslChannels(hsl.h, hsl.s, mid)));
    if (atLeast ? lit >= target : lit > target) {
      high = mid;
    } else {
      low = mid;
    }
  }
  return atLeast ? high : low;
}

/** The luminance a colour must be at most, or at least, to be 3:1 from one of luminance `y`. */
const darkerThan = (y: number) => (y + FLARE) / ACCENT_CONTRAST - FLARE;
const lighterThan = (y: number) => (y + FLARE) * ACCENT_CONTRAST - FLARE;

/**
 * The luminances that are 3:1 from both surfaces, as ranges: darker than both, lighter than both,
 * and between them, which only a page and a card far apart leave room for.
 */
function visibleRanges(page: number, card: number): { low: number; high: number }[] {
  const darker = Math.min(page, card);
  const lighter = Math.max(page, card);
  return [
    { low: 0, high: darkerThan(darker) },
    { low: lighterThan(darker), high: darkerThan(lighter) },
    { low: lighterThan(lighter), high: 1 },
  ].filter((range) => range.low <= range.high);
}

/** The pick moved into the band that shows in every theme: for when the theme is not known. */
function inBand(rgb: [number, number, number], hsl: { h: number; s: number; l: number }): string {
  const now = luminance(rgb);
  if (now >= ACCENT_MIN_LUMINANCE && now <= ACCENT_MAX_LUMINANCE) {
    return toHex(rgb);
  }
  // Lighter up to the band's floor, or darker down to its ceiling.
  const tooDark = now < ACCENT_MIN_LUMINANCE;
  const l = tooDark
    ? lightnessFor(hsl, ACCENT_MIN_LUMINANCE, true, hsl.l, 1)
    : lightnessFor(hsl, ACCENT_MAX_LUMINANCE, false, 0, hsl.l);
  return toHex(hslChannels(hsl.h, hsl.s, l));
}

/**
 * Keeps the hue and saturation of a pick and moves its lightness only as far as it has to, so a
 * stripe or a dot is 3:1 (WCAG 1.4.11) from the page and from a card and cannot disappear
 * against either.
 *
 * Given the `surfaces` of the theme it is drawn in, it moves the pick the least that theme needs:
 * a yellow stays yellow on a dark page and a navy stays navy on a light one, and a pick that
 * already shows is returned as it is. Without them it does not know the theme, so it moves the
 * pick into the band that shows in every palette `@cubeui/tokens` ships: a yellow is drawn olive
 * and a navy mid blue. A surface that is not a hex is the same as none.
 *
 * @param hex - `#rgb` or `#rrggbb`, with or without the `#`.
 * @param surfaces - The theme's page and card, as `useSurfaceColors` reads them.
 * @returns A `#rrggbb` colour, or `undefined` for anything that is not a hex colour.
 */
export function hexToAccent(hex: string, surfaces?: AccentSurfaces): string | undefined {
  const rgb = hexChannels(hex);
  const hsl = hexToHsl(hex);
  if (!rgb || !hsl) {
    return undefined;
  }
  const page = surfaces ? hexChannels(surfaces.page) : undefined;
  const card = surfaces ? hexChannels(surfaces.card) : undefined;
  if (!page || !card) {
    return inBand(rgb, hsl);
  }
  const ranges = visibleRanges(luminance(page), luminance(card));
  if (ranges.length === 0) {
    // A mid-grey page beside a far darker or lighter card leaves no colour 3:1 from both.
    return inBand(rgb, hsl);
  }
  const now = luminance(rgb);
  if (ranges.some((range) => now >= range.low && now <= range.high)) {
    return toHex(rgb);
  }
  // The nearest edge of a range that shows, in lightness: up to the floor of one above the pick,
  // or down to the ceiling of one below it.
  const edges = ranges.map((range) =>
    range.low > now ? lightnessFor(hsl, range.low, true) : lightnessFor(hsl, range.high, false),
  );
  const nearest = edges.reduce((best, l) =>
    Math.abs(l - hsl.l) < Math.abs(best - hsl.l) ? l : best,
  );
  return toHex(hslChannels(hsl.h, hsl.s, nearest));
}
