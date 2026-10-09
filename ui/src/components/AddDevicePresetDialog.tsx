import { addPreset } from '@/api';
import { DevicePresetDialog } from '@/components/DevicePresetDialog';
import type { NewDevicePreset } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}

const NEW_PRESET: NewDevicePreset = {
  name: '',
  dither_algo: 'floyd-steinberg',
  dither_palette: 'e6',
  interval: 120,
};

export function AddDevicePresetDialog({ open, onClose, onAdded }: Props) {
  return (
    <DevicePresetDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
      title="Add device preset"
      submitLabel="Add preset"
      pendingLabel="Adding…"
      submitVariant="info"
      initial={NEW_PRESET}
      onSubmit={async (preset) => {
        await addPreset(preset);
        onAdded();
      }}
    />
  );
}
