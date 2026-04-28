import type {
  Client,
  DevicePreset,
  DitheringAlgo,
  DitheringPalette,
  Endpoint,
  NewDevicePreset,
} from './types';

const BASE = '';

export async function getClients(): Promise<Client[]> {
  const r = await fetch(`${BASE}/api/clients`);
  if (!r.ok) {
    throw new Error(await r.text());
  }
  return r.json() as Promise<Client[]>;
}

export async function getEndpoints(): Promise<Endpoint[]> {
  const r = await fetch(`${BASE}/api/endpoints`);
  if (!r.ok) {
    throw new Error(await r.text());
  }
  return r.json() as Promise<Endpoint[]>;
}

export async function assignClient(clientId: string, endpointId: string): Promise<void> {
  const r = await fetch(`${BASE}/api/clients/${encodeURIComponent(clientId)}/endpoint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint_id: endpointId }),
  });
  if (!r.ok) {
    throw new Error(await r.text());
  }
}

export async function setClientInterval(clientId: string, interval: number): Promise<void> {
  const r = await fetch(`${BASE}/api/clients/${encodeURIComponent(clientId)}/interval`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ interval }),
  });
  if (!r.ok) {
    throw new Error(await r.text());
  }
}

export async function setClientDither(clientId: string, algo: DitheringAlgo): Promise<void> {
  const r = await fetch(`${BASE}/api/clients/${encodeURIComponent(clientId)}/dither`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dither_algo: algo }),
  });
  if (!r.ok) {
    throw new Error(await r.text());
  }
}

export async function setClientPalette(clientId: string, palette: DitheringPalette): Promise<void> {
  const r = await fetch(`${BASE}/api/clients/${encodeURIComponent(clientId)}/palette`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dither_palette: palette }),
  });
  if (!r.ok) {
    throw new Error(await r.text());
  }
}

export async function setClientLocked(clientId: string, locked: boolean): Promise<void> {
  const r = await fetch(`${BASE}/api/clients/${encodeURIComponent(clientId)}/lock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locked }),
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function pushClientImage(clientId: string): Promise<void> {
  const r = await fetch(`${BASE}/api/clients/${encodeURIComponent(clientId)}/push`, {
    method: 'POST',
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function connectClient(clientId: string): Promise<void> {
  const r = await fetch(`${BASE}/api/clients/${encodeURIComponent(clientId)}/connect`, {
    method: 'POST',
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function deleteEndpoint(id: string): Promise<void> {
  const r = await fetch(`${BASE}/api/endpoints/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!r.ok) {
    throw new Error(await r.text());
  }
}

export async function deleteClient(clientId: string): Promise<void> {
  const r = await fetch(`${BASE}/api/clients/${encodeURIComponent(clientId)}`, {
    method: 'DELETE',
  });
  if (!r.ok) {
    throw new Error(await r.text());
  }
}

export async function getDebugImage(clientId: string): Promise<Blob | null> {
  try {
    const r = await fetch(`${BASE}/api/clients/${encodeURIComponent(clientId)}/debug-image`);
    if (!r.ok) return null;
    return r.blob();
  } catch {
    return null;
  }
}

export type NewLocalEndpoint = { kind: 'local'; name: string; path: string };
export type NewImmichEndpoint = {
  kind: 'immich';
  name: string;
  base_url: string;
  album_id: string;
  api_key: string;
};
export type NewHomeAssistantEndpoint = {
  kind: 'homeassistant';
  name: string;
  base_url: string;
  token: string;
  media_content_id: string;
};
export type NewCalibrationEndpoint = { kind: 'calibration'; name: string };
export type NewEndpoint =
  | NewLocalEndpoint
  | NewImmichEndpoint
  | NewHomeAssistantEndpoint
  | NewCalibrationEndpoint;

export async function addEndpoint(body: NewEndpoint): Promise<Endpoint> {
  const r = await fetch(`${BASE}/api/endpoints`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    throw new Error(await r.text());
  }
  return r.json() as Promise<Endpoint>;
}

// ------ Device Presets ------ //
export async function getPresets(): Promise<DevicePreset[]> {
  const r = await fetch(`${BASE}/api/device-presets`);
  if (!r.ok) {
    throw new Error(await r.text());
  }
  return r.json() as Promise<DevicePreset[]>;
}

export async function addPreset(body: NewDevicePreset): Promise<DevicePreset> {
  const r = await fetch(`${BASE}/api/device-presets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    throw new Error(await r.text());
  }
  return r.json() as Promise<DevicePreset>;
}

export async function updatePreset(
  id: string,
  body: Partial<NewDevicePreset>,
): Promise<DevicePreset> {
  const r = await fetch(`${BASE}/api/device-presets/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    throw new Error(await r.text());
  }
  return r.json() as Promise<DevicePreset>;
}

export async function deletePreset(id: string): Promise<void> {
  const r = await fetch(`${BASE}/api/device-presets/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!r.ok) {
    throw new Error(await r.text());
  }
}

export async function assignPresetToClient(
  clientId: string,
  presetId: string | null,
): Promise<void> {
  const r = await fetch(`${BASE}/api/clients/${encodeURIComponent(clientId)}/preset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ preset_id: presetId }),
  });
  if (!r.ok) {
    throw new Error(await r.text());
  }
}
