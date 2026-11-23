import { useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Label } from '@/components/ui/label';

interface Props {
  clientName: string;
  loading: boolean;
  onForget: (block: boolean) => void;
}

/** Forget, with blocking the client on by default each time the question opens. */
export function ForgetClientButton({ clientName, loading, onForget }: Props) {
  const [open, setOpen] = useState(false);
  const [block, setBlock] = useState(true);
  const checkboxId = useId();

  function handleOpen() {
    setBlock(true);
    setOpen(true);
  }

  function handleConfirm() {
    setOpen(false);
    onForget(block);
  }

  return (
    <>
      <Button
        aria-label={`Forget ${clientName}`}
        variant="destructive-outline"
        size="xs"
        content="Forget"
        loading={loading}
        loadingLabel="Forgetting…"
        onClick={handleOpen}
      />
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Forget client "${clientName}"?`}
        description={
          <>
            It is disconnected and its saved provider, preset, lock and name are removed from the
            server.{' '}
            {block
              ? 'It stays blocked until you unblock it in Settings.'
              : 'If it is still on the network, it will be discovered again.'}
            <span className="mt-3 flex items-center gap-2">
              <Checkbox
                id={checkboxId}
                checked={block}
                onCheckedChange={(checked) => setBlock(checked === true)}
              />
              <Label htmlFor={checkboxId}>Block this client</Label>
            </span>
          </>
        }
        confirmLabel="Forget"
        onConfirm={handleConfirm}
      />
    </>
  );
}
