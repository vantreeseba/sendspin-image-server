import { useEffect, useState } from 'react';
import { getDebugImage } from '@/api';
import { DialogLayout } from '@/components/dialog-layout';
import { Alert } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { formatAgo } from '@/lib/format';

interface Props {
  clientId: string;
  /** Epoch seconds of the last image sent to the client, or null if none yet. */
  sentAt: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type PreviewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; url: string };

/**
 * Fetches and shows the debug image for one client.
 *
 * Mounted with a `key` so that changing client (or reopening the dialog) throws
 * this away and starts from `loading` again. That keeps the effect purely
 * asynchronous — there is no state to reset synchronously on the way in. The
 * key carries `sentAt` too, so an open dialog follows what the client is sent.
 */
function DebugPreview({ clientId, sentAt }: { clientId: string; sentAt: number | null }) {
  const [state, setState] = useState<PreviewState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    getDebugImage(clientId)
      .then((blob) => {
        if (cancelled) {
          return;
        }
        if (!blob) {
          setState({ status: 'error', message: 'No image data available' });
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setState({ status: 'ready', url: objectUrl });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to load preview',
        });
      });

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [clientId]);

  if (state.status === 'loading') {
    return (
      <div className="flex items-center justify-center py-12 text-foreground/60">
        <Spinner label="Loading preview" />
      </div>
    );
  }

  if (state.status === 'error') {
    return <Alert variant="destructive" title="No preview" description={state.message} />;
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-foreground/10 bg-secondary p-4">
      <img
        src={state.url}
        alt="Client preview"
        className="max-h-[60vh] w-auto rounded-md object-contain"
      />
      {sentAt != null && (
        <p className="text-sm text-foreground/60">
          Sent {formatAgo(sentAt * 1000)} at {new Date(sentAt * 1000).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}

export function ClientDebugPreviewDialog({ clientId, sentAt, open, onOpenChange }: Props) {
  return (
    <DialogLayout
      open={open}
      onOpenChange={onOpenChange}
      title={`Preview — Client ${clientId.split('-').at(-1) ?? clientId.slice(-6)}`}
      description="The last image sent to this client"
      contentSlot={
        open ? (
          <DebugPreview key={`${clientId}:${sentAt}`} clientId={clientId} sentAt={sentAt} />
        ) : null
      }
    />
  );
}
