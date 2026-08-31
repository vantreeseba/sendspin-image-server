import { useEffect, useState } from 'react';
import { getDebugImage } from '@/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Props {
  clientId: string;
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
 * asynchronous — there is no state to reset synchronously on the way in.
 */
function DebugPreview({ clientId }: { clientId: string }) {
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
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground text-sm">Loading preview…</p>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-destructive text-sm">{state.message}</p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center rounded-lg border border-border/50 bg-muted/20 p-4">
      <img
        src={state.url}
        alt="Client preview"
        className="max-h-[60vh] w-auto rounded-md object-contain"
      />
    </div>
  );
}

export function ClientDebugPreviewDialog({ clientId, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Preview — Client {clientId.split('-').at(-1) ?? clientId.slice(-6)}
          </DialogTitle>
          <DialogDescription>Image currently being sent to this client</DialogDescription>
        </DialogHeader>

        {open && <DebugPreview key={clientId} clientId={clientId} />}
      </DialogContent>
    </Dialog>
  );
}
