import { LockOpen } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import {
  assignClient,
  assignPresetToClient,
  connectClient,
  deleteClient,
  getPresets,
  pushClientImage,
  setClientDither,
  setClientInterval,
  setClientLocked,
  setClientPalette,
} from '@/api';
import { ActionButton } from '@/components/action-button';
import { ClientDebugPreviewDialog } from '@/components/ClientDebugPreviewDialog';
import { CardLayout } from '@/components/card-layout';
import { ConfirmButton } from '@/components/confirm-button';
import { DescriptionList, PropertyRow } from '@/components/description-list';
import { FormField } from '@/components/form-field';
import { OptionSelect, type SelectOption } from '@/components/option-select';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, Lock } from '@/components/ui/icons';
import { Input } from '@/components/ui/input';
import { ALGO_OPTIONS, PALETTE_OPTIONS } from '@/lib/dither-options';
import { formatAgo, formatDuration } from '@/lib/format';
import type { Client, DevicePreset, DitheringAlgo, DitheringPalette, Endpoint } from '@/types';

interface Props {
  client: Client;
  endpoints: Endpoint[];
  onChanged: () => void;
}

/** Stands in for "no preset" in the select, whose values are strings. */
const NO_PRESET = 'none';

const CLIENT_ALGO_OPTIONS: SelectOption[] = [{ value: 'none', label: 'None' }, ...ALGO_OPTIONS];

function cardClassFor(client: Client, isDiscovered: boolean): string {
  if (client.status === 'connected') {
    return 'border-l-4 border-l-positive';
  }
  if (client.sleeping) {
    return 'border-l-4 border-l-info opacity-80';
  }
  if (isDiscovered) {
    return 'opacity-60';
  }
  return 'border-l-4 border-l-warning opacity-60';
}

function StatusBadge({ client }: { client: Client }) {
  if (client.status === 'connected') {
    return <Badge variant="positive">Online</Badge>;
  }
  if (client.sleeping) {
    return (
      <Badge variant="info" title="On a sleep cycle — it will reconnect when it next wakes">
        Sleeping
      </Badge>
    );
  }
  if (client.discovered_only) {
    return <Badge variant="warning">Discovered</Badge>;
  }
  return <Badge variant="destructive">Offline</Badge>;
}

export function ClientCard({ client, endpoints, onChanged }: Props) {
  const isDiscovered = client.discovered_only || client.status === 'discovered';
  const displayName = client.name || client.id;
  const clientPreset = client.preset_id ?? null;

  const [selectedEndpoint, setSelectedEndpoint] = useState(client.endpoint_id ?? '');
  const [selectedAlgo, setSelectedAlgo] = useState<DitheringAlgo>(client.dither_algo);
  const [selectedPalette, setSelectedPalette] = useState<DitheringPalette>(client.dither_palette);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(clientPreset);
  const [intervalInput, setIntervalInput] = useState(
    client.interval > 0 ? String(client.interval) : '',
  );
  const [busy, setBusy] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [locking, setLocking] = useState(false);
  const [presets, setPresets] = useState<DevicePreset[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);

  const ch = client.artwork_channels[0];
  const parsedInterval = intervalInput === '' ? 0 : Number(intervalInput);
  const intervalValid =
    intervalInput === '' || (!Number.isNaN(parsedInterval) && parsedInterval >= 0);

  // Load presets for the preset selector
  useEffect(() => {
    getPresets()
      .then(setPresets)
      .catch(() => {});
  }, []);

  const endpointOptions = useMemo<SelectOption[]>(
    () => endpoints.map((ep) => ({ value: ep.id, label: `${ep.name} (${ep.kind})` })),
    [endpoints],
  );
  const presetOptions = useMemo<SelectOption[]>(
    () => [
      { value: NO_PRESET, label: 'None (use per-client settings)' },
      ...presets.map((preset) => ({ value: preset.id, label: preset.name })),
    ],
    [presets],
  );

  const isDirty =
    selectedEndpoint !== (client.endpoint_id ?? '') ||
    selectedAlgo !== client.dither_algo ||
    selectedPalette !== client.dither_palette ||
    selectedPreset !== clientPreset ||
    parsedInterval !== client.interval;

  async function handleUpdate() {
    if (!intervalValid) {
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const tasks: Promise<void>[] = [];

      if (selectedEndpoint && selectedEndpoint !== client.endpoint_id) {
        tasks.push(assignClient(client.id, selectedEndpoint));
      }

      if (selectedAlgo !== client.dither_algo) {
        tasks.push(setClientDither(client.id, selectedAlgo));
      }

      if (selectedPalette !== client.dither_palette) {
        tasks.push(setClientPalette(client.id, selectedPalette));
      }

      if (parsedInterval !== client.interval) {
        tasks.push(setClientInterval(client.id, parsedInterval));
      }

      if (selectedPreset !== clientPreset) {
        tasks.push(assignPresetToClient(client.id, selectedPreset));
      }

      await Promise.all(tasks);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handlePush() {
    setPushing(true);
    setErr(null);
    try {
      await pushClientImage(client.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setPushing(false);
    }
  }

  async function handleToggleLock() {
    setLocking(true);
    setErr(null);
    try {
      await setClientLocked(client.id, !client.locked);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLocking(false);
    }
  }

  async function handleConnect() {
    setConnecting(true);
    setErr(null);
    try {
      await connectClient(client.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setErr(null);
    try {
      await deleteClient(client.id);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }

  let providerLabel = '—';
  if (client.endpoint_name) {
    providerLabel = client.explicit_assignment
      ? client.endpoint_name
      : `${client.endpoint_name} (default)`;
  }

  const canForceConnect = isDiscovered || client.status === 'disconnected';

  return (
    <>
      <CardLayout
        className={cardClassFor(client, isDiscovered)}
        contentClassName="flex flex-col gap-4"
        title={displayName}
        actionSlot={
          <>
            <StatusBadge client={client} />
            <ActionButton
              label={client.locked ? `Unlock ${displayName}` : `Lock ${displayName}`}
              hint={client.locked ? 'Locked — click to unlock' : 'Unlocked — click to lock'}
              variant="ghost"
              size="icon-xs"
              iconSlot={
                client.locked ? (
                  <Lock className="text-warning" />
                ) : (
                  <LockOpen className="text-muted-foreground" />
                )
              }
              loading={locking}
              onClick={handleToggleLock}
            />
            <ActionButton
              label={`Debug preview for ${displayName}`}
              hint="Debug preview"
              variant="ghost"
              size="icon-xs"
              iconSlot={<Eye />}
              onClick={() => setDebugOpen(true)}
            />
            <ConfirmButton
              label={`Forget ${displayName}`}
              variant="destructive-outline"
              size="xs"
              content="Forget"
              loading={deleting}
              loadingLabel="Forgetting…"
              title={`Forget client "${displayName}"?`}
              description="It is disconnected and its saved provider, preset, lock and name are removed from the server. A client that is still on the network will be discovered again."
              confirmLabel="Forget"
              onConfirm={handleDelete}
            />
          </>
        }
        contentSlot={
          <>
            <DescriptionList
              contentSlot={
                <>
                  <PropertyRow label="ID" value={client.id} valueClassName="font-mono" />
                  {client.mdns_name && <PropertyRow label="mDNS" value={client.mdns_name} />}
                  {client.discovered_url && (
                    <PropertyRow label="URL" value={client.discovered_url} />
                  )}
                  {client.last_seen != null && (
                    <PropertyRow label="Last seen" value={formatAgo(client.last_seen * 1000)} />
                  )}
                  {client.sleeping && client.wake_interval != null && (
                    <PropertyRow
                      label="Wakes every"
                      value={`about ${formatDuration(client.wake_interval)}`}
                    />
                  )}
                  {ch && (
                    <PropertyRow
                      label="Resolution"
                      value={ch.width && ch.height ? `${ch.width} × ${ch.height}` : '—'}
                    />
                  )}
                  {ch && <PropertyRow label="Format" value={ch.format ?? '—'} />}
                  <PropertyRow label="Provider" value={providerLabel} />
                  <PropertyRow
                    label="Interval"
                    value={client.interval > 0 ? `${client.interval}s` : 'default'}
                  />
                </>
              }
            />

            {/* Settings — hidden for discovered-only clients */}
            {!isDiscovered && (
              <FormField
                label="Image provider"
                controlSlot={(wired) => (
                  <OptionSelect
                    {...wired}
                    options={endpointOptions}
                    value={selectedEndpoint}
                    onValueChange={setSelectedEndpoint}
                    placeholder="Select image provider…"
                  />
                )}
              />
            )}

            {!isDiscovered && (
              <FormField
                label="Device preset"
                controlSlot={(wired) => (
                  <OptionSelect
                    {...wired}
                    options={presetOptions}
                    value={selectedPreset ?? NO_PRESET}
                    onValueChange={(v) => setSelectedPreset(v === NO_PRESET ? null : v)}
                  />
                )}
              />
            )}

            {/* Per-client dithering and interval — a preset supplies these when one is active */}
            {!isDiscovered && selectedPreset === null && (
              <>
                <FormField
                  label="Palette"
                  controlSlot={(wired) => (
                    <OptionSelect
                      {...wired}
                      options={PALETTE_OPTIONS}
                      value={selectedPalette}
                      onValueChange={(v) => setSelectedPalette(v as DitheringPalette)}
                    />
                  )}
                />
                <FormField
                  label="Dithering"
                  controlSlot={(wired) => (
                    <OptionSelect
                      {...wired}
                      options={CLIENT_ALGO_OPTIONS}
                      value={selectedAlgo}
                      onValueChange={(v) => setSelectedAlgo(v as DitheringAlgo)}
                    />
                  )}
                />
                <FormField
                  label="Interval (seconds)"
                  error={intervalValid ? undefined : 'Use 0 or more seconds.'}
                  controlSlot={
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      placeholder="Server default (120)"
                      value={intervalInput}
                      onChangeText={setIntervalInput}
                    />
                  }
                />
              </>
            )}

            {err && <Alert variant="destructive" title="Something went wrong" description={err} />}
          </>
        }
        footerActionsSlot={
          <>
            {canForceConnect && (
              <Button
                variant="outline"
                size="sm"
                content="Force Connect"
                loading={connecting}
                loadingLabel="Connecting…"
                onClick={handleConnect}
              />
            )}
            {!isDiscovered && client.status === 'connected' && (
              <Button
                variant="outline"
                size="sm"
                content="Push Now"
                loading={pushing}
                loadingLabel="Pushing…"
                onClick={handlePush}
              />
            )}
            {!isDiscovered && (
              <Button
                variant="positive"
                size="sm"
                content="Update"
                loading={busy}
                loadingLabel="Saving…"
                disabled={!isDirty || !intervalValid}
                onClick={handleUpdate}
              />
            )}
          </>
        }
      />

      <ClientDebugPreviewDialog clientId={client.id} open={debugOpen} onOpenChange={setDebugOpen} />
    </>
  );
}
