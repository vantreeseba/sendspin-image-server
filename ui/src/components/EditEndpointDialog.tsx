import { EndpointDialog } from '@/components/EndpointDialog';
import type { Endpoint } from '@/types';

interface Props {
  endpoint: Endpoint;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function EditEndpointDialog({ endpoint, open, onOpenChange, onSaved }: Props) {
  return (
    <EndpointDialog open={open} onOpenChange={onOpenChange} endpoint={endpoint} onSaved={onSaved} />
  );
}
