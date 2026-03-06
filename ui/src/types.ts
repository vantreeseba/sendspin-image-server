export interface ArtworkChannel {
  source: string;
  format: string;
  width: number | null;
  height: number | null;
}

export interface Client {
  id: string;
  name: string;
  roles: string[];
  stream_started: boolean;
  artwork_channels: ArtworkChannel[];
  endpoint_id: string | null;
  endpoint_name: string | null;
  explicit_assignment: boolean;
}

export interface Endpoint {
  id: string;
  name: string;
  kind: 'local' | 'immich' | 'homeassistant';
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
