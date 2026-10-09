import { DevicePresetDialog } from '@/components/DevicePresetDialog';
import type { DevicePreset, NewDevicePreset } from '@/types';

interface Props {
  preset: DevicePreset;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (updates: NewDevicePreset) => Promise<void>;
}

export function EditDevicePresetDialog({ preset, open, onOpenChange, onSave }: Props) {
  return (
    <DevicePresetDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit preset"
      submitLabel="Save"
      pendingLabel="Saving…"
      submitVariant="positive"
      initial={{
        name: preset.name,
        dither_algo: preset.dither_algo,
        dither_palette: preset.dither_palette,
        interval: preset.interval,
      }}
      onSubmit={onSave}
    />
  );
}
