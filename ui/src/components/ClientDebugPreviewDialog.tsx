import { useEffect, useMemo, useRef, useState } from 'react';
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

export function ClientDebugPreviewDialog({ clientId, open, onOpenChange }: Props) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setImageSrc(null);
    setErr(null);
    setLoading(true);

    let cancelled = false;

    getDebugImage(clientId).then((blob) => {
      if (cancelled) return;
      setLoading(false);
      if (!blob) {
        setErr('No image data available');
        return;
      }
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      setImageSrc(url);
    });

    return () => {
      cancelled = true;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [open, clientId]);

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
  };

  const previewImage = useMemo(() => {
    if (open && imageSrc) {
      return imageSrc;
    }
    return null;
  }, [open, imageSrc]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Preview — Client {clientId.split('-').at(-1) ?? clientId.slice(-6)}
          </DialogTitle>
          <DialogDescription>Image currently being sent to this client</DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <p className="text-muted-foreground text-sm">Loading preview…</p>
          </div>
        )}

        {err && (
          <div className="flex items-center justify-center py-12">
            <p className="text-destructive text-sm">{err}</p>
          </div>
        )}

        {previewImage && (
          <div className="flex items-center justify-center rounded-lg border border-border/50 bg-muted/20 p-4">
            <img
              src={previewImage}
              alt="Client preview"
              className="max-h-[60vh] w-auto rounded-md object-contain"
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
