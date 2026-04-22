import { useState } from 'react';
import { deletePreset } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DevicePreset } from '@/types';
import { DITHERING_ALGOS, PALETTE_LABELS } from '@/types';
import { Pencil } from 'lucide-react';

interface Props {
  preset: DevicePreset;
  onChanged: () => void;
  onEdit?: (preset: DevicePreset) => void;
}

const ALGO_LABELS: Record<string, string> = Object.fromEntries(
  DITHERING_ALGOS.map((algo) => [algo, algo]),
);

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-24 shrink-0 font-medium text-[11px] text-muted-foreground/60 uppercase tracking-wide">
        {label}
      </span>
      <span className="min-w-0 truncate text-foreground text-xs">{children}</span>
    </div>
  );
}

export function DevicePresetCard({ preset, onChanged, onEdit }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleDelete() {
    if (preset.builtin) return;
    if (!confirm(`Delete preset "${preset.name}"?`)) return;
    setBusy(true);
    setErr(null);
    try {
      await deletePreset(preset.id);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const paletteLabel = PALETTE_LABELS[preset.dither_palette];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="truncate text-lg">{preset.name}</CardTitle>
          <div className="flex shrink-0 items-center gap-1">
            {preset.builtin && (
              <Badge variant="secondary" className="px-2 py-0.5 text-xs">
                built-in
              </Badge>
            )}
            {preset.is_default && (
              <Badge
                variant="outline"
                className="border-purple-500 px-2 py-0.5 text-purple-400 text-xs"
              >
                default
              </Badge>
            )}
            {onEdit && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => onEdit?.(preset)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
            {!preset.builtin && (
              <Button
                variant="destructive"
                size="sm"
                className="h-6 px-2 text-[11px]"
                onClick={handleDelete}
                disabled={busy}
              >
                Delete
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-1.5">
        <Row label="Algo">{ALGO_LABELS[preset.dither_algo] ?? preset.dither_algo}</Row>
        <Row label="Palette">{paletteLabel}</Row>
        <Row label="Interval">{preset.interval > 0 ? `${preset.interval}s` : 'default'}</Row>
        <Row label="Clients">
          <span className="text-muted-foreground">
            {preset.client_count} {preset.client_count === 1 ? 'client' : 'clients'} using
          </span>
        </Row>
        <Row label="ID">
          <span className="font-mono">{preset.id}</span>
        </Row>

        {err && <p className="pt-0.5 text-destructive text-xs">{err}</p>}
      </CardContent>
    </Card>
  );
}
