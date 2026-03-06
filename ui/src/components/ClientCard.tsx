import { useState } from 'react';
import { assignClient, setClientDither, setClientInterval } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

const ALGO_OPTIONS: { value: DitheringAlgo; label: string }[] = [
  { value: 'none', label: 'None' },
  ...DITHERING_ALGOS.map((algo) => ({ value: algo, label: algo })),
];

export function ClientCard({ client, endpoints, onChanged }: Props) {
  const [selectedEndpoint, setSelectedEndpoint] = useState(client.endpoint_id ?? '');
  const [selectedAlgo, setSelectedAlgo] = useState<DitheringAlgo>(client.dither_algo);
  const [intervalInput, setIntervalInput] = useState(
    client.interval > 0 ? String(client.interval) : '',
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const ch = client.artwork_channels[0];

  const parsedInterval = intervalInput === '' ? 0 : Number(intervalInput);
  const intervalValid =
    intervalInput === '' || (!Number.isNaN(parsedInterval) && parsedInterval >= 0);

  const isDirty =
    selectedEndpoint !== (client.endpoint_id ?? '') ||
    selectedAlgo !== client.dither_algo ||
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

      if (parsedInterval !== client.interval) {
        tasks.push(setClientInterval(client.id, parsedInterval));
      }

      await Promise.all(tasks);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const providerLabel = client.endpoint_name
    ? client.explicit_assignment
      ? client.endpoint_name
      : `${client.endpoint_name} (default)`
    : '—';

  const intervalLabel = client.interval > 0 ? `${client.interval}s` : 'default';

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
        <Row label="Interval">{intervalLabel}</Row>

        {/* Provider selector */}
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

        {/* Dithering selector */}
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

        {/* Interval input */}
        <Input
          type="number"
          min={0}
          step={1}
          placeholder="Interval (s) — blank for default"
          value={intervalInput}
          onChange={(e) => setIntervalInput(e.target.value)}
          className={`h-8 text-xs ${!intervalValid ? 'border-destructive' : ''}`}
        />

        <Button
          size="sm"
          onClick={handleUpdate}
          disabled={busy || !isDirty || !intervalValid}
          className="w-full text-xs"
        >
          Update
        </Button>

        {err && <p className="text-destructive text-xs">{err}</p>}
      </CardContent>
    </Card>
  );
}
