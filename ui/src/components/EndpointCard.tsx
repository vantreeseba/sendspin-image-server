import { useState } from 'react';
import { deleteEndpoint } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Endpoint } from '@/types';

interface Props {
  endpoint: Endpoint;
  onChanged: () => void;
}

const KIND_LABELS: Record<Endpoint['kind'], string> = {
  local: 'Local folder',
  immich: 'Immich',
  homeassistant: 'Home Assistant',
};

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

export function EndpointCard({ endpoint, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm(`Delete image provider "${endpoint.name}"?`)) return;
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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="truncate text-lg">{endpoint.name}</CardTitle>
          <div className="flex shrink-0 items-center gap-1">
            {endpoint.builtin && (
              <Badge variant="secondary" className="px-2 py-0.5 text-xs">
                built-in
              </Badge>
            )}
            {endpoint.is_default && (
              <Badge
                variant="outline"
                className="border-purple-500 px-2 py-0.5 text-purple-400 text-xs"
              >
                default
              </Badge>
            )}
            {!endpoint.builtin && (
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
        <Row label="Type">{KIND_LABELS[endpoint.kind] ?? endpoint.kind}</Row>
        <Row label="ID">
          <span className="font-mono">{endpoint.id}</span>
        </Row>

        {endpoint.kind === 'local' && endpoint.path && (
          <Row label="Path">
            <span className="font-mono">{endpoint.path}</span>
          </Row>
        )}

        {endpoint.kind === 'immich' && (
          <>
            {endpoint.base_url && <Row label="Server">{endpoint.base_url}</Row>}
            {endpoint.album_id && (
              <Row label="Album">
                <span className="font-mono">{endpoint.album_id}</span>
              </Row>
            )}
          </>
        )}

        {endpoint.kind === 'homeassistant' && (
          <>
            {endpoint.base_url && <Row label="Server">{endpoint.base_url}</Row>}
            {endpoint.media_content_id && (
              <Row label="Media">
                <span className="font-mono">{endpoint.media_content_id}</span>
              </Row>
            )}
          </>
        )}

        {err && <p className="pt-0.5 text-destructive text-xs">{err}</p>}
      </CardContent>
    </Card>
  );
}
