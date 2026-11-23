import { useState } from 'react';

import { unblockClient } from '@/api';
import { EmptyState } from '@/components/empty-state';
import { PropertyList, PropertyRow } from '@/components/property-list';
import { Section } from '@/components/section';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { BlockedClient } from '@/types';

interface Props {
  blockedClients: BlockedClient[] | null;
  onChanged: () => void;
}

export function BlockedClientsSection({ blockedClients, onChanged }: Props) {
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function handleUnblock(clientId: string) {
    setUnblockingId(clientId);
    setErr(null);
    try {
      await unblockClient(clientId);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setUnblockingId(null);
    }
  }

  return (
    <Section
      title="Blocked Clients"
      divider
      contentSlot={
        <>
          {err && <Alert variant="destructive" title="Could not unblock" description={err} />}
          {!blockedClients || blockedClients.length === 0 ? (
            <EmptyState compact title="No blocked clients." />
          ) : (
            <PropertyList
              contentSlot={blockedClients.map((blocked) => (
                <PropertyRow
                  key={blocked.client_id}
                  label={blocked.name || blocked.client_id}
                  value={blocked.client_id}
                  valueClassName="font-mono"
                  hint={blocked.url ?? undefined}
                  actionSlot={
                    <Button
                      aria-label={`Unblock ${blocked.name || blocked.client_id}`}
                      variant="outline"
                      size="xs"
                      content="Unblock"
                      loading={unblockingId === blocked.client_id}
                      loadingLabel="Unblocking…"
                      onClick={() => handleUnblock(blocked.client_id)}
                    />
                  }
                />
              ))}
            />
          )}
        </>
      }
    />
  );
}
