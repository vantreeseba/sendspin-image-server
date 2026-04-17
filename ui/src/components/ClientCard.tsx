import { useEffect, useState } from 'react';
import {
  assignClient,
  assignPresetToClient,
  connectClient,
  deleteClient,
  getPresets,
  setClientDither,
  setClientInterval,
  setClientPalette,
} from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Client, DitheringAlgo, DitheringPalette, DevicePreset, Endpoint } from '@/types';
import { DITHERING_ALGOS, DITHERING_PALETTES, PALETTE_LABELS } from '@/types';

interface Props {
  client: Client;
  endpoints: Endpoint[];
  onChanged: () => void;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-20 shrink-0 font-medium text-[11px] text-muted-foreground/60 uppercase tracking-wide">
        {label}
      </span>
      <span className="min-w-0 truncate text-foreground text-xs">{children}</span>
    </div>
  );
}

const ALGO_OPTIONS: { value: DitheringAlgo; label: string }[] = [
  { value: 'none', label: 'None' },
  ...DITHERING_ALGOS.map((algo) => ({ value: algo, label: algo })),
];

const PALETTE_OPTIONS: { value: DitheringPalette; label: string }[] = DITHERING_PALETTES.map(
  (p) => ({ value: p, label: PALETTE_LABELS[p] }),
);

export function ClientCard({ client, endpoints, onChanged }: Props) {
  const isDiscovered = client.discovered_only || client.status === 'discovered';

  const [selectedEndpoint, setSelectedEndpoint] = useState(client.endpoint_id ?? '');
  const [selectedAlgo, setSelectedAlgo] = useState<DitheringAlgo>(client.dither_algo);
  const [selectedPalette, setSelectedPalette] = useState<DitheringPalette>(client.dither_palette);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(client.preset_id ?? null);
  const [intervalInput, setIntervalInput] = useState(
    client.interval > 0 ? String(client.interval) : '',
  );
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [presets, setPresets] = useState<DevicePreset[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const ch = client.artwork_channels[0];
  const parsedInterval = intervalInput === '' ? 0 : Number(intervalInput);
  const intervalValid =
    intervalInput === '' || (!Number.isNaN(parsedInterval) && parsedInterval >= 0);

  // Load presets for the preset selector
  useEffect(() => {
    getPresets().then(setPresets).catch(() => {});
  }, []);

  const isDirty =
    selectedEndpoint !== (client.endpoint_id ?? '') ||
    selectedAlgo !== client.dither_algo ||
    selectedPalette !== client.dither_palette ||
    selectedPreset !== client.preset_id ||
    parsedInterval !== client.interval;

   const presetLabel = presets.find((p) => p.id === selectedPreset)?.name ?? 'None';

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

       if (selectedPreset !== client.preset_id) {
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
    if (!confirm(`Forget client "${client.name || client.id}"?`)) return;
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

  const providerLabel = client.endpoint_name
    ? client.explicit_assignment
      ? client.endpoint_name
      : `${client.endpoint_name} (default)`
    : '—';

  const intervalLabel = client.interval > 0 ? `${client.interval}s` : 'default';

  return (
    <Card className={isDiscovered ? 'opacity-60' : undefined}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="truncate text-lg">{client.name || client.id}</CardTitle>
          <div className="flex shrink-0 items-center gap-1.5">
            {client.status === 'connected' ? (
              <Badge
                variant="outline"
                className="shrink-0 border-green-600 px-2 py-0.5 text-green-400 text-xs"
              >
                Online
              </Badge>
            ) : client.discovered_only ? (
              <Badge
                variant="outline"
                className="shrink-0 border-amber-500 px-2 py-0.5 text-amber-400 text-xs"
              >
                Discovered
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="shrink-0 border-red-600 px-2 py-0.5 text-red-400 text-xs"
              >
                Offline
              </Badge>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={handleDelete}
              disabled={deleting}
              className="shrink-0 border-red-800 text-red-400 text-xs hover:bg-red-900/20"
            >
              {deleting ? '…' : 'Forget'}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-1.5">
        <Row label="ID">{client.id}</Row>
        {client.discovered_url && <Row label="URL">{client.discovered_url}</Row>}
        {ch && (
          <>
            <Row label="Resolution">
              {ch.width && ch.height ? `${ch.width} × ${ch.height}` : '—'}
            </Row>
            <Row label="Format">{ch.format ?? '—'}</Row>
          </>
        )}
        <Row label="Provider">{providerLabel}</Row>
        <Row label="Interval">{intervalLabel}</Row>

        {/* Provider selector — hidden for discovered-only clients */}
        {!isDiscovered && (
          <Select value={selectedEndpoint} onValueChange={setSelectedEndpoint}>
            <SelectTrigger size="sm" className="w-full text-xs">
              <SelectValue placeholder="Select image provider…" />
            </SelectTrigger>
            <SelectContent>
              {endpoints.map((ep) => (
                <SelectItem key={ep.id} value={ep.id} className="text-xs">
                  {ep.name}
                  <span className="ml-1 text-muted-foreground">({ep.kind})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

         {/* Palette selector — hidden for discovered-only clients */}
         {!isDiscovered && (
           <Select
             value={selectedPalette}
             onValueChange={(v) => setSelectedPalette(v as DitheringPalette)}
           >
             <SelectTrigger size="sm" className="w-full text-xs">
               <SelectValue />
             </SelectTrigger>
             <SelectContent>
               {PALETTE_OPTIONS.map((opt) => (
                 <SelectItem key={opt.value} value={opt.value} className="text-xs">
                   {opt.label}
                 </SelectItem>
               ))}
             </SelectContent>
           </Select>
         )}

         {/* Preset selector — hidden for discovered-only clients */}
         {!isDiscovered && (
           <div className="space-y-1.5">
             <Label>Device Preset</Label>
             <Select
               value={selectedPreset ?? ''}
               onValueChange={(v) => setSelectedPreset(v === 'none' ? null : (v as string))}
             >
               <SelectTrigger size="sm" className="w-full text-xs">
                 <SelectValue placeholder="None" />
               </SelectTrigger>
               <SelectContent>
                 <SelectItem value="none" className="text-xs">
                   None (use per-client settings)
                 </SelectItem>
                 {presets.map((preset) => (
                   <SelectItem key={preset.id} value={preset.id} className="text-xs">
                     {preset.name}
                   </SelectItem>
                 ))}
               </SelectContent>
             </Select>
             <p className="text-muted-foreground text-xs">
               {presetLabel ? `Preset: ${presetLabel}` : 'Not assigned'}
             </p>
           </div>
         )}

         {/* Dithering algorithm selector — hidden for discovered-only clients */}
         {!isDiscovered && (
           <Select value={selectedAlgo} onValueChange={(v) => setSelectedAlgo(v as DitheringAlgo)}>
             <SelectTrigger size="sm" className="w-full text-xs">
               <SelectValue />
             </SelectTrigger>
             <SelectContent>
               {ALGO_OPTIONS.map((opt) => (
                 <SelectItem key={opt.value} value={opt.value} className="text-xs">
                   {opt.label}
                 </SelectItem>
               ))}
             </SelectContent>
           </Select>
         )}

        {/* Interval input — hidden for discovered-only clients */}
        {!isDiscovered && (
          <Input
            type="number"
            min={0}
            step={1}
            placeholder="Interval in seconds (default: 120)"
            value={intervalInput}
            onChange={(e) => setIntervalInput(e.target.value)}
            className={`h-8 text-xs ${!intervalValid ? 'border-destructive' : ''}`}
          />
        )}

        {/* Update button — only for connected clients */}
        {!isDiscovered && (
          <Button
            size="sm"
            onClick={handleUpdate}
            disabled={busy || !isDirty || !intervalValid}
            className="w-full text-xs"
          >
            Update
          </Button>
        )}

        {/* Force Connect — for discovered-only clients and disconnected (offline) clients */}
        {(isDiscovered || client.status === 'disconnected') && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleConnect}
            disabled={connecting}
            className="mt-2 w-full text-xs"
          >
            {connecting ? 'Connecting…' : 'Force Connect'}
          </Button>
        )}

        {err && <p className="text-destructive text-xs">{err}</p>}
      </CardContent>
    </Card>
  );
}
