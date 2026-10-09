import { useSelector } from '@tanstack/react-form';
import { useState } from 'react';
import { addEndpoint, type NewEndpoint, updateEndpoint } from '@/api';
import { InputField, SelectField, useAppForm } from '@/components/app-form';
import { DialogLayout } from '@/components/dialog-layout';
import type { SelectOption } from '@/components/option-select';
import { PasswordField } from '@/components/password-field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormElement } from '@/components/ui/form-element';
import type { Endpoint } from '@/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The provider being edited. Left off, the dialog adds a new one. */
  endpoint?: Endpoint;
  onSaved: () => void;
}

type Kind = NewEndpoint['kind'];

interface EndpointFormValues {
  kind: string;
  name: string;
  // local
  path: string;
  // immich
  album_id: string;
  api_key: string;
  // shared: immich + ha
  base_url: string;
  // ha
  token: string;
  media_content_id: string;
}

const DEFAULT_MEDIA_CONTENT_ID = 'media-source://media_source';

const NEW_VALUES: EndpointFormValues = {
  kind: 'immich',
  name: '',
  path: '',
  album_id: '',
  api_key: '',
  base_url: '',
  token: '',
  media_content_id: DEFAULT_MEDIA_CONTENT_ID,
};

const KIND_OPTIONS: SelectOption[] = [
  { value: 'immich', label: 'Immich' },
  { value: 'homeassistant', label: 'Home Assistant' },
  { value: 'local', label: 'Local folder' },
  { value: 'calibration', label: 'Calibration chart' },
];

/** The fields each kind cannot be saved without. */
const REQUIRED: Record<Kind, (keyof EndpointFormValues)[]> = {
  local: ['name', 'path'],
  immich: ['name', 'base_url', 'album_id', 'api_key'],
  homeassistant: ['name', 'base_url', 'token'],
  calibration: ['name'],
};

/** The server never sends these back, so an edit that leaves one blank keeps the stored value. */
const SECRETS: (keyof EndpointFormValues)[] = ['api_key', 'token'];

const KEEP_SECRET = 'Leave blank to keep the current one.';

function valuesOf(endpoint: Endpoint): EndpointFormValues {
  return {
    ...NEW_VALUES,
    kind: endpoint.kind,
    name: endpoint.name,
    path: endpoint.path ?? '',
    album_id: endpoint.album_id ?? '',
    base_url: endpoint.base_url ?? '',
    media_content_id: endpoint.media_content_id ?? DEFAULT_MEDIA_CONTENT_ID,
  };
}

function validate(value: EndpointFormValues, editing: boolean) {
  const fields: Partial<Record<keyof EndpointFormValues, string>> = {};
  for (const key of REQUIRED[value.kind as Kind]) {
    if (editing && SECRETS.includes(key)) {
      continue;
    }
    if (!value[key].trim()) {
      fields[key] = 'Required.';
    }
  }
  return Object.keys(fields).length > 0 ? { fields } : undefined;
}

function toEndpoint(value: EndpointFormValues): NewEndpoint {
  const kind = value.kind as Kind;
  if (kind === 'local') {
    return { kind, name: value.name, path: value.path };
  }
  if (kind === 'immich') {
    return {
      kind,
      name: value.name,
      base_url: value.base_url,
      album_id: value.album_id,
      api_key: value.api_key,
    };
  }
  if (kind === 'calibration') {
    return { kind, name: value.name };
  }
  return {
    kind,
    name: value.name,
    base_url: value.base_url,
    token: value.token,
    media_content_id: value.media_content_id,
  };
}

/** The fields adding and editing an image provider share. An edit cannot change the kind. */
export function EndpointDialog({ open, onOpenChange, endpoint, onSaved }: Props) {
  const [err, setErr] = useState<string | null>(null);
  const editing = endpoint !== undefined;

  const form = useAppForm({
    defaultValues: endpoint ? valuesOf(endpoint) : NEW_VALUES,
    validators: { onChange: ({ value }) => validate(value, editing) },
    onSubmit: async ({ value }) => {
      setErr(null);
      try {
        if (endpoint) {
          await updateEndpoint(endpoint.id, toEndpoint(value));
        } else {
          await addEndpoint(toEndpoint(value));
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
        return;
      }
      onSaved();
      handleOpenChange(false);
    },
  });
  const kind = useSelector(form.store, (state) => state.values.kind) as Kind;

  function handleOpenChange(next: boolean) {
    if (!next) {
      form.reset();
      setErr(null);
    }
    onOpenChange(next);
  }

  const kindLabel = KIND_OPTIONS.find((option) => option.value === kind)?.label ?? kind;

  return (
    <DialogLayout
      open={open}
      onOpenChange={handleOpenChange}
      title={editing ? 'Edit image provider' : 'Add image provider'}
      description={editing ? `${kindLabel} provider. The kind cannot be changed.` : undefined}
      hasUnsavedChanges={() => !form.state.isDefaultValue}
      contentSlot={
        <FormElement className="gap-4" onSubmit={() => form.handleSubmit()}>
          {!editing && <SelectField form={form} name="kind" label="Kind" options={KIND_OPTIONS} />}
          <InputField form={form} name="name" label="Name" placeholder="My photos" required />

          {kind === 'local' && (
            <InputField
              form={form}
              name="path"
              label="Directory path (on server)"
              placeholder="/app/images/vacation"
              required
            />
          )}

          {kind === 'immich' && (
            <>
              <InputField
                form={form}
                name="base_url"
                label="Immich base URL"
                type="url"
                placeholder="https://immich.example.com"
                required
              />
              <InputField
                form={form}
                name="album_id"
                label="Album UUID"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                required
              />
              <PasswordField
                form={form}
                name="api_key"
                label="API key"
                placeholder="your-api-key"
                description={editing ? KEEP_SECRET : undefined}
                autoComplete="off"
                showLabel="Show API key"
                hideLabel="Hide API key"
                required={!editing}
              />
            </>
          )}

          {kind === 'calibration' && (
            <Alert
              variant="info"
              description="Displays a 6-block colour chart — one solid block per e-paper ink colour — labelled with name, RGB values, and the ESPHome nibble value. Assign a client to this endpoint and observe the physical display to determine whether each ink maps correctly."
            />
          )}

          {kind === 'homeassistant' && (
            <>
              <InputField
                form={form}
                name="base_url"
                label="Home Assistant URL"
                type="url"
                placeholder="http://homeassistant.local:8123"
                required
              />
              <PasswordField
                form={form}
                name="token"
                label="Long-Lived Access Token"
                placeholder="eyJ0eXAiOiJKV1QiLCJhbGci…"
                description={editing ? KEEP_SECRET : undefined}
                autoComplete="off"
                showLabel="Show token"
                hideLabel="Hide token"
                required={!editing}
              />
              <InputField
                form={form}
                name="media_content_id"
                label="Media content ID"
                placeholder="media-source://media_source/local/photos"
                description="Leave as default to browse all local media, or narrow to a specific folder (e.g. media-source://media_source/local/photos)."
              />
            </>
          )}

          {err && (
            <Alert
              variant="destructive"
              title={editing ? 'Could not save provider' : 'Could not add provider'}
              description={err}
            />
          )}
        </FormElement>
      }
      footerActionsSlot={(close) => (
        <>
          <Button variant="outline" content="Cancel" onClick={close} />
          <form.AppForm>
            {editing ? (
              <form.SubmitButton variant="positive" content="Save" pendingLabel="Saving…" />
            ) : (
              <form.SubmitButton variant="info" content="Add provider" pendingLabel="Adding…" />
            )}
          </form.AppForm>
        </>
      )}
    />
  );
}
