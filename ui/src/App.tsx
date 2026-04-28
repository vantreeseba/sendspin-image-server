import { Moon, Sun } from 'lucide-react';
import { useCallback, useState } from 'react';
import { getClients, getEndpoints, getPresets, updatePreset } from '@/api';
import { AddDevicePresetDialog } from '@/components/AddDevicePresetDialog';
import { AddEndpointDialog } from '@/components/AddEndpointDialog';
import { ClientCard } from '@/components/ClientCard';
import { DevicePresetCard } from '@/components/DevicePresetCard';
import { EditDevicePresetDialog } from '@/components/EditDevicePresetDialog';
import { EndpointCard } from '@/components/EndpointCard';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePoller } from '@/hooks/usePoller';
import { useTheme } from '@/hooks/useTheme';
import type { DevicePreset } from '@/types';

export default function App() {
  const [addOpen, setAddOpen] = useState(false);
  const [addPresetOpen, setAddPresetOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<DevicePreset | null>(null);
  const [tab, setTab] = useState<'clients' | 'settings'>('clients');
  const { theme, toggle } = useTheme();

  const fetchClients = useCallback(() => getClients(), []);
  const fetchEndpoints = useCallback(() => getEndpoints(), []);
  const fetchPresets = useCallback(() => getPresets(), []);
  const setEditing = useCallback((p: DevicePreset | null) => setEditingPreset(p), []);

  const { data: clients, lastUpdate, refresh: refreshClients } = usePoller(fetchClients, 5000);
  const { data: endpoints, refresh: refreshEndpoints } = usePoller(fetchEndpoints, 5000);
  const { data: presets, refresh: refreshPresets } = usePoller(fetchPresets, 5000);

  async function refresh() {
    refreshClients();
    refreshEndpoints();
    refreshPresets();
  }

  async function handleSaveEdit(updates: Partial<DevicePreset>) {
    if (!editingPreset) return;
    await updatePreset(editingPreset.id, updates);
    await refresh();
    setEditingPreset(null);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl space-y-8 px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-bold text-2xl tracking-tight">Sendspin Image Server</h1>
            <p className="mt-0.5 text-muted-foreground text-sm">
              {lastUpdate ? `Last updated ${lastUpdate.toLocaleTimeString()}` : 'Loading…'}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="clients">Clients</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          {/* ── Clients tab ── */}
          <TabsContent value="clients" className="mt-4 space-y-3">
            {!clients ? (
              <p className="text-muted-foreground text-sm">Loading…</p>
            ) : clients.length === 0 ? (
              <p className="text-muted-foreground text-sm">No clients discovered.</p>
            ) : (
              (() => {
                const connected = clients.filter((c) => c.status === 'connected');
                const offline = clients.filter((c) => !c.discovered_only && c.status !== 'connected');
                const discovered = clients.filter((c) => c.discovered_only);
                return (
                  <div className="space-y-5">
                    {connected.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[11px] font-medium uppercase tracking-wider text-green-500/80">
                          Active ({connected.length})
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {connected.map((c) => (
                            <ClientCard key={c.id} client={c} endpoints={endpoints ?? []} onChanged={refresh} />
                          ))}
                        </div>
                      </div>
                    )}
                    {offline.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[11px] font-medium uppercase tracking-wider text-amber-500/80">
                          Disconnected ({offline.length})
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {offline.map((c) => (
                            <ClientCard key={c.id} client={c} endpoints={endpoints ?? []} onChanged={refresh} />
                          ))}
                        </div>
                      </div>
                    )}
                    {discovered.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                          Discovered ({discovered.length})
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {discovered.map((c) => (
                            <ClientCard key={c.id} client={c} endpoints={endpoints ?? []} onChanged={refresh} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()
            )}
          </TabsContent>

          {/* ── Settings tab ── */}
          <TabsContent value="settings" className="mt-4 space-y-8">
            {/* Image Providers */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                  Image Providers
                </h2>
                <Button size="sm" onClick={() => setAddOpen(true)}>
                  + Add provider
                </Button>
              </div>
              {!endpoints || endpoints.length === 0 ? (
                <p className="text-muted-foreground text-sm">No image providers configured.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {endpoints.map((ep) => (
                    <EndpointCard key={ep.id} endpoint={ep} onChanged={refresh} />
                  ))}
                </div>
              )}
            </section>

            <Separator />

            {/* Device Presets */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                  Device Presets
                </h2>
                <Button size="sm" onClick={() => setAddPresetOpen(true)}>
                  + Add preset
                </Button>
              </div>
              {!presets || presets.length === 0 ? (
                <p className="text-muted-foreground text-sm">No device presets created.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {presets.map((preset) => (
                    <DevicePresetCard
                      key={preset.id}
                      preset={preset}
                      onChanged={refresh}
                      onEdit={(p) => setEditing(p)}
                    />
                  ))}
                </div>
              )}
            </section>
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Preset Dialog */}
      <AddDevicePresetDialog
        open={addPresetOpen}
        onClose={() => setAddPresetOpen(false)}
        onAdded={refresh}
      />

      {/* Edit Preset Dialog */}
      {editingPreset && (
        <EditDevicePresetDialog
          preset={editingPreset}
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditingPreset(null);
          }}
          onSave={handleSaveEdit}
        />
      )}

      {/* Add Endpoint Dialog */}
      <AddEndpointDialog open={addOpen} onClose={() => setAddOpen(false)} onAdded={refresh} />
    </div>
  );
}
