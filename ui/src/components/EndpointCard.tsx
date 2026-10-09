import { useState } from 'react';
import { deleteEndpoint } from '@/api';
import { ActionButton } from '@/components/action-button';
import { CardLayout } from '@/components/card-layout';
import { ConfirmButton } from '@/components/confirm-button';
import { DescriptionList, PropertyRow } from '@/components/description-list';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Pencil } from '@/components/ui/icons';
import type { Endpoint } from '@/types';

interface Props {
  endpoint: Endpoint;
  onChanged: () => void;
  onEdit?: (endpoint: Endpoint) => void;
}

const KIND_LABELS: Record<Endpoint['kind'], string> = {
  local: 'Local folder',
  immich: 'Immich',
  homeassistant: 'Home Assistant',
  calibration: 'Calibration',
};

export function EndpointCard({ endpoint, onChanged, onEdit }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleDelete() {
    setBusy(true);
    setErr(null);
    try {
      await deleteEndpoint(endpoint.id);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const hasServer = endpoint.kind === 'immich' || endpoint.kind === 'homeassistant';

  return (
    <CardLayout
      title={endpoint.name}
      contentClassName="flex flex-col gap-4"
      actionSlot={
        <>
          {endpoint.builtin && <Badge variant="secondary">built-in</Badge>}
          {endpoint.is_default && <Badge variant="info">default</Badge>}
          {onEdit && !endpoint.builtin && (
            <ActionButton
              label={`Edit ${endpoint.name}`}
              variant="outline"
              size="icon-xs"
              iconSlot={<Pencil />}
              onClick={() => onEdit(endpoint)}
            />
          )}
          {!endpoint.builtin && (
            <ConfirmButton
              label={`Delete ${endpoint.name}`}
              variant="destructive"
              size="xs"
              content="Delete"
              loading={busy}
              title={`Delete image provider "${endpoint.name}"?`}
              description="Its connection details are removed from the server, and clients assigned to it stop receiving its images."
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
                <PropertyRow label="Type" value={KIND_LABELS[endpoint.kind] ?? endpoint.kind} />
                <PropertyRow label="ID" value={endpoint.id} valueClassName="font-mono" />
                {endpoint.kind === 'local' && endpoint.path && (
                  <PropertyRow label="Path" value={endpoint.path} valueClassName="font-mono" />
                )}
                {hasServer && endpoint.base_url && (
                  <PropertyRow label="Server" value={endpoint.base_url} />
                )}
                {endpoint.kind === 'immich' && endpoint.album_id && (
                  <PropertyRow label="Album" value={endpoint.album_id} valueClassName="font-mono" />
                )}
                {endpoint.kind === 'homeassistant' && endpoint.media_content_id && (
                  <PropertyRow
                    label="Media"
                    value={endpoint.media_content_id}
                    valueClassName="font-mono"
                  />
                )}
              </>
            }
          />
          {err && <Alert variant="destructive" title="Could not delete" description={err} />}
        </>
      }
    />
  );
}
