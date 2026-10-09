import type { SelectOption } from '@/components/option-select';
import { DITHERING_ALGOS, DITHERING_PALETTES, PALETTE_LABELS } from '@/types';

export const ALGO_OPTIONS: SelectOption[] = DITHERING_ALGOS.map((algo) => ({
  value: algo,
  label: algo,
}));

export const PALETTE_OPTIONS: SelectOption[] = DITHERING_PALETTES.map((palette) => ({
  value: palette,
  label: PALETTE_LABELS[palette],
}));
