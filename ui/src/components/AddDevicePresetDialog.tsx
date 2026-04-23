import { useState } from 'react';
import { addPreset } from '@/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { DitheringAlgo, DitheringPalette, NewDevicePreset } from '@/types';
import { DITHERING_ALGOS, DITHERING_PALETTES, PALETTE_LABELS } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}

export function AddDevicePresetDialog({ open, onClose, onAdded }: Props) {
  const [name, setName] = useState('');
  const [algo, setAlgo] = useState<DitheringAlgo>('floyd-steinberg');
  const [palette, setPalette] = useState<DitheringPalette>('e6');
  const [intervalInput, setIntervalInput] = useState('120');

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function reset() {
    setName('');
    setAlgo('floyd-steinberg');
    setPalette('e6');
    setIntervalInput('120');
    setErr(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  const parsedInterval = intervalInput === '' ? 0 : Number(intervalInput);
  const intervalValid =
    intervalInput === '' || (!Number.isNaN(parsedInterval) && parsedInterval >= 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const body: NewDevicePreset = {
        name,
        dither_algo: algo,
        dither_palette: palette,
        interval: parsedInterval,
      };
      await addPreset(body);
      onAdded();
      handleClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const paletteLabels = PALETTE_LABELS;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add device preset</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="preset-name">Name</Label>
            <Input
              id="preset-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My preset"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label>Algorithm</Label>
            <Select value={algo} onValueChange={(v) => setAlgo(v as DitheringAlgo)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DITHERING_ALGOS.map((a) => (
                  <SelectItem key={a} value={a} className="text-xs">
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Palette</Label>
            <Select value={palette} onValueChange={(v) => setPalette(v as DitheringPalette)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DITHERING_PALETTES.map((p) => (
                  <SelectItem key={p} value={p} className="text-xs">
                    {paletteLabels[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="preset-interval">Update interval (seconds)</Label>
            <Input
              id="preset-interval"
              type="number"
              min={0}
              step={1}
              value={intervalInput}
              onChange={(e) => setIntervalInput(e.target.value)}
              placeholder="120"
              className={intervalValid ? '' : 'border-destructive'}
              required
            />
            <p className="text-muted-foreground text-xs">
              Set to 0 for server default. Recommended: 120-300 seconds.
            </p>
          </div>

          {err && <p className="text-destructive text-sm">{err}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !intervalValid}>
              {busy ? 'Adding…' : 'Add preset'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
