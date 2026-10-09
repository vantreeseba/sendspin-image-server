import { useCallback, useState } from 'react';
import { getClients, getEndpoints, getPresets, updatePreset } from '@/api';
import { AddDevicePresetDialog } from '@/components/AddDevicePresetDialog';
import { AddEndpointDialog } from '@/components/AddEndpointDialog';
import { ClientCard } from '@/components/ClientCard';
import { DevicePresetCard } from '@/components/DevicePresetCard';
import { EditDevicePresetDialog } from '@/components/EditDevicePresetDialog';
import { EditEndpointDialog } from '@/components/EditEndpointDialog';
import { EndpointCard } from '@/components/EndpointCard';
import { CardGrid, EmptyState } from '@/components/page';
import { PageLayout } from '@/components/page-layout';
import { Section } from '@/components/section';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Plug, Plus } from '@/components/ui/icons';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ThemePicker } from '@/components/ui/theme-picker';
import { useThemePreference } from '@/components/ui/theme-preference';
import { usePoller } from '@/hooks/usePoller';
import type { Client, DevicePreset, Endpoint, NewDevicePreset } from '@/types';

interface ClientGroupProps {
  title: string;
  clients: Client[];
  endpoints: Endpoint[];
  onChanged: () => void;
}

function ClientGroup({ title, clients, endpoints, onChanged }: ClientGroupProps) {
  if (clients.length === 0) {
    return null;
  }
  return (
    <Section
      title={`${title} (${clients.length})`}
      contentSlot={
        <CardGrid
          contentSlot={clients.map((c) => (
            <ClientCard key={c.id} client={c} endpoints={endpoints} onChanged={onChanged} />
          ))}
        />
      }
    />
  );
}

export default function App() {
  useThemePreference();

  const [addOpen, setAddOpen] = useState(false);
  const [addPresetOpen, setAddPresetOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<DevicePreset | null>(null);
  const [editingEndpoint, setEditingEndpoint] = useState<Endpoint | null>(null);
  const [tab, setTab] = useState<'clients' | 'settings'>('clients');

  const fetchClients = useCallback(() => getClients(), []);
  const fetchEndpoints = useCallback(() => getEndpoints(), []);
  const fetchPresets = useCallback(() => getPresets(), []);

  const {
    data: clients,
    error: clientsError,
    lastUpdate,
    refresh: refreshClients,
  } = usePoller(fetchClients, 5000);
  const { data: endpoints, refresh: refreshEndpoints } = usePoller(fetchEndpoints, 5000);
  const { data: presets, refresh: refreshPresets } = usePoller(fetchPresets, 5000);

  function refresh() {
    refreshClients();
    refreshEndpoints();
    refreshPresets();
  }

  async function handleSaveEdit(updates: NewDevicePreset) {
    if (!editingPreset) {
      return;
    }
    await updatePreset(editingPreset.id, updates);
    refresh();
  }

  const connected = clients?.filter((c) => c.status === 'connected') ?? [];
  const offline = clients?.filter((c) => !c.discovered_only && c.status !== 'connected') ?? [];
  const discovered = clients?.filter((c) => c.discovered_only) ?? [];

  return (
    <>
      <PageLayout
        title="Sendspin Image Server"
        description={lastUpdate ? `Last updated ${lastUpdate.toLocaleTimeString()}` : 'Loading…'}
        actionSlot={<ThemePicker variant="compact" />}
        contentClassName="py-6"
        contentSlot={
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList aria-label="Sections">
              <TabsTrigger value="clients">Clients</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>

            {/* ── Clients tab ── */}
            <TabsContent value="clients" className="mt-6 flex flex-col gap-6">
              {clientsError && (
                <Alert
                  variant="destructive"
                  title="Could not reach the server"
                  description={clientsError}
                />
              )}
              {!clients && !clientsError && <Spinner label="Loading clients" />}
              {clients?.length === 0 && (
                <EmptyState
                  icon={Plug}
                  title="No clients discovered"
                  description="Clients appear here once they connect or are found on the network."
                />
              )}
              <ClientGroup
                title="Active"
                clients={connected}
                endpoints={endpoints ?? []}
                onChanged={refresh}
              />
              <ClientGroup
                title="Disconnected"
                clients={offline}
                endpoints={endpoints ?? []}
                onChanged={refresh}
              />
              <ClientGroup
                title="Discovered"
                clients={discovered}
                endpoints={endpoints ?? []}
                onChanged={refresh}
              />
            </TabsContent>

            {/* ── Settings tab ── */}
            <TabsContent value="settings" className="mt-6 flex flex-col gap-8">
              <Section
                title="Image Providers"
                actionSlot={
                  <Button
                    variant="info"
                    size="sm"
                    iconSlot={<Plus />}
                    content="Add provider"
                    onClick={() => setAddOpen(true)}
                  />
                }
                contentSlot={
                  !endpoints || endpoints.length === 0 ? (
                    <EmptyState compact title="No image providers configured." />
                  ) : (
                    <CardGrid
                      contentSlot={endpoints.map((ep) => (
                        <EndpointCard
                          key={ep.id}
                          endpoint={ep}
                          onChanged={refresh}
                          onEdit={setEditingEndpoint}
                        />
                      ))}
                    />
                  )
                }
              />

              <Section
                title="Device Presets"
                divider
                actionSlot={
                  <Button
                    variant="info"
                    size="sm"
                    iconSlot={<Plus />}
                    content="Add preset"
                    onClick={() => setAddPresetOpen(true)}
                  />
                }
                contentSlot={
                  !presets || presets.length === 0 ? (
                    <EmptyState compact title="No device presets created." />
                  ) : (
                    <CardGrid
                      contentSlot={presets.map((preset) => (
                        <DevicePresetCard
                          key={preset.id}
                          preset={preset}
                          onChanged={refresh}
                          onEdit={setEditingPreset}
                        />
                      ))}
                    />
                  )
                }
              />
            </TabsContent>
          </Tabs>
        }
      />

      <AddDevicePresetDialog
        open={addPresetOpen}
        onClose={() => setAddPresetOpen(false)}
        onAdded={refresh}
      />

      {editingPreset && (
        <EditDevicePresetDialog
          key={editingPreset.id}
          preset={editingPreset}
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              setEditingPreset(null);
            }
          }}
          onSave={handleSaveEdit}
        />
      )}

      {editingEndpoint && (
        <EditEndpointDialog
          key={editingEndpoint.id}
          endpoint={editingEndpoint}
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              setEditingEndpoint(null);
            }
          }}
          onSaved={refresh}
        />
      )}

      <AddEndpointDialog open={addOpen} onClose={() => setAddOpen(false)} onAdded={refresh} />
    </>
  );
}
