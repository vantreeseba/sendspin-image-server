import { useState } from 'react';
import { deletePreset } from '@/api';
import { ActionButton } from '@/components/action-button';
import { CardLayout } from '@/components/card-layout';
import { ConfirmButton } from '@/components/confirm-button';
import { DescriptionList, PropertyRow } from '@/components/description-list';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Pencil } from '@/components/ui/icons';
import { formatCount } from '@/lib/format';
import type { DevicePreset } from '@/types';
import { PALETTE_LABELS } from '@/types';

interface Props {
  preset: DevicePreset;
  onChanged: () => void;
  onEdit?: (preset: DevicePreset) => void;
}

export function DevicePresetCard({ preset, onChanged, onEdit }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleDelete() {
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

  const clientCount = preset.client_count ?? 0;

  return (
    <CardLayout
      title={preset.name}
      contentClassName="flex flex-col gap-4"
      actionSlot={
        <>
          {preset.builtin && <Badge variant="secondary">built-in</Badge>}
          {preset.is_default && <Badge variant="info">default</Badge>}
          {onEdit && (
            <ActionButton
              label={`Edit ${preset.name}`}
              variant="outline"
              size="icon-xs"
              iconSlot={<Pencil />}
              onClick={() => onEdit(preset)}
            />
          )}
          {!preset.builtin && (
            <ConfirmButton
              label={`Delete ${preset.name}`}
              variant="destructive"
              size="xs"
              content="Delete"
              loading={busy}
              title={`Delete preset "${preset.name}"?`}
              description={
                clientCount > 0
                  ? `The preset is removed from the server. ${formatCount(clientCount, 'client')} currently assigned to it.`
                  : 'The preset is removed from the server. No clients are using it.'
              }
              onConfirm={handleDelete}
            />
          )}
        </>
      }
      contentSlot={
        <>
          <DescriptionList
            contentSlot={
              <>
                <PropertyRow label="Algo" value={preset.dither_algo} />
                <PropertyRow label="Palette" value={PALETTE_LABELS[preset.dither_palette]} />
                <PropertyRow
                  label="Interval"
                  value={preset.interval > 0 ? `${preset.interval}s` : 'default'}
                />
                <PropertyRow
                  label="Clients"
                  value={`${formatCount(clientCount, 'client')} using`}
                />
                <PropertyRow label="ID" value={preset.id} valueClassName="font-mono" />
              </>
            }
          />
          {err && <Alert variant="destructive" title="Could not delete" description={err} />}
        </>
      }
    />
  );
}
