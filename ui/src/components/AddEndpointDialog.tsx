import { useState } from 'react';
import { addEndpoint, type NewEndpoint } from '@/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Props {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}

type Kind = 'immich' | 'local' | 'homeassistant';

export function AddEndpointDialog({ open, onClose, onAdded }: Props) {
  const [kind, setKind] = useState<Kind>('immich');
  const [name, setName] = useState('');
  // local
  const [path, setPath] = useState('');
  // immich
  const [albumId, setAlbumId] = useState('');
  const [apiKey, setApiKey] = useState('');
  // shared: immich + ha
  const [baseUrl, setBaseUrl] = useState('');
  // ha
  const [haToken, setHaToken] = useState('');
  const [mediaContentId, setMediaContentId] = useState('media-source://media_source');

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function reset() {
    setKind('immich');
    setName('');
    setPath('');
    setBaseUrl('');
    setAlbumId('');
    setApiKey('');
    setHaToken('');
    setMediaContentId('media-source://media_source');
    setErr(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      let body: NewEndpoint;
      if (kind === 'local') {
        body = { kind: 'local', name, path };
      } else if (kind === 'immich') {
        body = { kind: 'immich', name, base_url: baseUrl, album_id: albumId, api_key: apiKey };
      } else {
        body = {
          kind: 'homeassistant',
          name,
          base_url: baseUrl,
          token: haToken,
          media_content_id: mediaContentId,
        };
      }
      await addEndpoint(body);
      onAdded();
      handleClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add image provider</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Kind</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="immich">Immich</SelectItem>
                <SelectItem value="homeassistant">Home Assistant</SelectItem>
                <SelectItem value="local">Local folder</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ep-name">Name</Label>
            <Input
              id="ep-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My photos"
              required
            />
          </div>

          {kind === 'local' && (
            <div className="space-y-1.5">
              <Label htmlFor="ep-path">Directory path (on server)</Label>
              <Input
                id="ep-path"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/app/images/vacation"
                required
              />
            </div>
          )}

          {kind === 'immich' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="ep-url">Immich base URL</Label>
                <Input
                  id="ep-url"
                  type="url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://immich.example.com"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ep-album">Album UUID</Label>
                <Input
                  id="ep-album"
                  value={albumId}
                  onChange={(e) => setAlbumId(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ep-key">API key</Label>
                <Input
                  id="ep-key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="your-api-key"
                  required
                />
              </div>
            </>
          )}

          {kind === 'homeassistant' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="ha-url">Home Assistant URL</Label>
                <Input
                  id="ha-url"
                  type="url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="http://homeassistant.local:8123"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ha-token">Long-Lived Access Token</Label>
                <Input
                  id="ha-token"
                  value={haToken}
                  onChange={(e) => setHaToken(e.target.value)}
                  placeholder="eyJ0eXAiOiJKV1QiLCJhbGci…"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ha-media">Media content ID</Label>
                <Input
                  id="ha-media"
                  value={mediaContentId}
                  onChange={(e) => setMediaContentId(e.target.value)}
                  placeholder="media-source://media_source/local/photos"
                />
                <p className="text-muted-foreground text-xs">
                  Leave as default to browse all local media, or narrow to a specific folder (e.g.{' '}
                  <code>media-source://media_source/local/photos</code>).
                </p>
              </div>
            </>
          )}

          {err && <p className="text-destructive text-sm">{err}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Adding…' : 'Add provider'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
