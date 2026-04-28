export interface ArtworkChannel {
  source: string;
  format: string;
  width: number | null;
  height: number | null;
}

export type DitheringAlgo =
  | 'none'
  | 'floyd-steinberg'
  | 'floyd-steinberg-serpentine'
  | 'atkinson'
  | 'ordered';

export const DITHERING_ALGOS: DitheringAlgo[] = [
  'floyd-steinberg',
  'floyd-steinberg-serpentine',
  'atkinson',
  'ordered',
];

export type DitheringPalette = 'none' | 'bw' | 'bwr' | 'bwy' | '4color' | 'e6' | 'e6bright';

export const DITHERING_PALETTES: DitheringPalette[] = ['none', 'bw', 'bwr', 'bwy', '4color', 'e6', 'e6bright'];

export const PALETTE_LABELS: Record<DitheringPalette, string> = {
  none:     'Full Color (no dithering)',
  bw:       'Black & White',
  bwr:      'Black, White & Red',
  bwy:      'Black, White & Yellow',
  '4color': '4-Color',
  e6:       'E-Paper 7-Color (ACeP)',
  e6bright: 'E-Paper 7-Color Bright (+25%)',
};

export interface Client {
  id: string;
  name: string;
  status: 'connected' | 'disconnected' | 'discovered';
  roles: string[];
  stream_started: boolean;
  artwork_channels: ArtworkChannel[];
  endpoint_id: string | null;
  endpoint_name: string | null;
  explicit_assignment: boolean;
  dither_algo: DitheringAlgo;
  dither_palette: DitheringPalette;
  interval: number; // seconds; 0 = server default
  discovered_url?: string | null;
  discovered_only: boolean;
  mdns_name?: string | null;
  preset_id?: string | null;
}

export interface Endpoint {
  id: string;
  name: string;
  kind: 'local' | 'immich' | 'homeassistant' | 'calibration';
  builtin: boolean;
  is_default: boolean;
  // local
  path?: string;
  // immich
  album_id?: string;
  // immich + homeassistant
  base_url?: string;
  // homeassistant
  media_content_id?: string;
}

export interface DevicePreset {
  id: string;
  name: string;
  dither_algo: DitheringAlgo;
  dither_palette: DitheringPalette;
  interval: number; // seconds; 0 = server default
  builtin?: boolean;
  is_default?: boolean;
  client_count?: number;
}

export interface NewDevicePreset {
  name: string;
  dither_algo: DitheringAlgo;
  dither_palette: DitheringPalette;
  interval: number;
}
