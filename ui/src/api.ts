import type { Client, DitheringAlgo, Endpoint } from './types';

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

export async function deleteEndpoint(id: string): Promise<void> {
  const r = await fetch(`${BASE}/api/endpoints/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!r.ok) {
    throw new Error(await r.text());
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
export type NewEndpoint = NewLocalEndpoint | NewImmichEndpoint | NewHomeAssistantEndpoint;

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
