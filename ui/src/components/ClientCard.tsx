import { useState } from 'react';
import { assignClient, setClientDither } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { Client, DitheringAlgo, Endpoint } from '@/types';
import { DITHERING_ALGOS } from '@/types';

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

export function ClientCard({ client, endpoints, onChanged }: Props) {
  const [selected, setSelected] = useState(client.endpoint_id ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isDithering = client.dither_algo !== 'none';
  const currentAlgo: DitheringAlgo = isDithering ? client.dither_algo : 'floyd-steinberg';

  const [ditherEnabled, setDitherEnabled] = useState(isDithering);
  const [ditherAlgo, setDitherAlgo] = useState<DitheringAlgo>(currentAlgo);
  const [ditherBusy, setDitherBusy] = useState(false);

  const ch = client.artwork_channels[0];

  async function handleAssign() {
    if (!selected) {
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await assignClient(client.id, selected);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDitherToggle(enabled: boolean) {
    setDitherEnabled(enabled);
    const algo: DitheringAlgo = enabled ? ditherAlgo : 'none';
    setDitherBusy(true);
    try {
      await setClientDither(client.id, algo);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setDitherEnabled(!enabled);
    } finally {
      setDitherBusy(false);
    }
  }

  async function handleAlgoChange(algo: DitheringAlgo) {
    setDitherAlgo(algo);
    setDitherBusy(true);
    try {
      await setClientDither(client.id, algo);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDitherBusy(false);
    }
  }

  const providerLabel = client.endpoint_name
    ? client.explicit_assignment
      ? client.endpoint_name
      : `${client.endpoint_name} (default)`
    : '—';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="truncate text-lg">{client.name || client.id}</CardTitle>
          <Badge
            variant="outline"
            className="shrink-0 border-green-600 px-2 py-0.5 text-green-400 text-xs"
          >
            online
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-1.5">
        <Row label="MAC">{client.id}</Row>
        {ch && (
          <>
            <Row label="Resolution">
              {ch.width && ch.height ? `${ch.width} × ${ch.height}` : '—'}
            </Row>
            <Row label="Format">{ch.format ?? '—'}</Row>
          </>
        )}
        <Row label="Provider">{providerLabel}</Row>

        {/* Provider assignment row */}
        <div className="flex items-stretch gap-1.5 pt-1">
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger size="sm" className="flex-1 text-xs">
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
          <Button
            size="sm"
            onClick={handleAssign}
            disabled={busy || !selected}
            className="px-3 text-xs"
          >
            Assign
          </Button>
        </div>

        {/* Dithering controls */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center gap-2">
            <Switch
              id={`dither-${client.id}`}
              checked={ditherEnabled}
              onCheckedChange={handleDitherToggle}
              disabled={ditherBusy}
            />
            <Label htmlFor={`dither-${client.id}`} className="cursor-pointer text-xs">
              Dithering
            </Label>
          </div>

          {ditherEnabled && (
            <Select
              value={ditherAlgo}
              onValueChange={(v) => handleAlgoChange(v as DitheringAlgo)}
              disabled={ditherBusy}
            >
              <SelectTrigger size="sm" className="w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DITHERING_ALGOS.map((algo) => (
                  <SelectItem key={algo} value={algo} className="text-xs">
                    {algo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {err && <p className="text-destructive text-xs">{err}</p>}
      </CardContent>
    </Card>
  );
}
