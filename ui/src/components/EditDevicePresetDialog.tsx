import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { DevicePreset } from '@/types';
import { DITHERING_ALGOS, DITHERING_PALETTES, PALETTE_LABELS } from '@/types';

interface Props {
  preset: DevicePreset;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (updates: Partial<DevicePreset>) => void;
}

export function EditDevicePresetDialog({ preset, open, onOpenChange, onSave }: Props) {
  const [name, setName] = useState(preset.name);
  const [dither_algo, setDitherAlgo] = useState(preset.dither_algo);
  const [dither_palette, setDitherPalette] = useState(preset.dither_palette);
  const [interval, setInterval] = useState(String(preset.interval));

  const currentName = open ? name : preset.name;
  const currentDitherAlgo = open ? dither_algo : preset.dither_algo;
  const currentDitherPalette = open ? dither_palette : preset.dither_palette;
  const currentInterval = open ? interval : String(preset.interval);

  const handleSave = useCallback(() => {
    if (!currentName.trim()) return;
    onSave({
      name: currentName.trim(),
      dither_algo: currentDitherAlgo,
      dither_palette: currentDitherPalette,
      interval: Number(currentInterval) || 0,
    });
  }, [currentName, currentDitherAlgo, currentDitherPalette, currentInterval, onSave]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit preset</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="edit-name">Name</Label>
            <Input
              id="edit-name"
              value={currentName}
              onChange={(e) => setName(e.target.value)}
              placeholder="Preset name"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-algo">Algorithm</Label>
            <Select
              value={currentDitherAlgo}
              onValueChange={(v) =>
                setDitherAlgo(
                  v as
                    | 'none'
                    | 'floyd-steinberg'
                    | 'floyd-steinberg-serpentine'
                    | 'atkinson'
                    | 'ordered',
                )
              }
            >
              <SelectTrigger id="edit-algo">
                <SelectValue placeholder="Select algorithm" />
              </SelectTrigger>
              <SelectContent>
                {DITHERING_ALGOS.map((algo) => (
                  <SelectItem key={algo} value={algo}>
                    {algo === 'none'
                      ? 'None'
                      : algo
                          .split('-')
                          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                          .join(' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-palette">Palette</Label>
            <Select
              value={currentDitherPalette}
              onValueChange={(v) => setDitherPalette(v as 'none' | 'bw' | 'e6')}
            >
              <SelectTrigger id="edit-palette">
                <SelectValue placeholder="Select palette" />
              </SelectTrigger>
              <SelectContent>
                {DITHERING_PALETTES.map((palette) => (
                  <SelectItem key={palette} value={palette}>
                    {PALETTE_LABELS[palette] ?? palette}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-interval">Interval (seconds)</Label>
            <Input
              id="edit-interval"
              type="number"
              min={0}
              value={currentInterval}
              onChange={(e) => setInterval(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
