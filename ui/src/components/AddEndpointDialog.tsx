import { EndpointDialog } from '@/components/EndpointDialog';

interface Props {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}

export function AddEndpointDialog({ open, onClose, onAdded }: Props) {
  return (
    <EndpointDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
      onSaved={onAdded}
    />
  );
}
