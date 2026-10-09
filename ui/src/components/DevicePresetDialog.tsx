import { useState } from 'react';
import { InputField, NumberField, SelectField, useAppForm } from '@/components/app-form';
import { DialogLayout } from '@/components/dialog-layout';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormElement } from '@/components/ui/form-element';
import { ALGO_OPTIONS, PALETTE_OPTIONS } from '@/lib/dither-options';
import type { DitheringAlgo, DitheringPalette, NewDevicePreset } from '@/types';

interface PresetFormValues {
  name: string;
  dither_algo: string;
  dither_palette: string;
  interval: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  submitLabel: string;
  pendingLabel: string;
  submitVariant: 'info' | 'positive';
  initial: NewDevicePreset;
  onSubmit: (preset: NewDevicePreset) => Promise<void>;
}

function validate(value: PresetFormValues) {
  const fields: Partial<Record<keyof PresetFormValues, string>> = {};
  if (!value.name.trim()) {
    fields.name = 'Give the preset a name.';
  }
  if (value.interval !== null && value.interval < 0) {
    fields.interval = 'Use 0 or more seconds.';
  }
  return Object.keys(fields).length > 0 ? { fields } : undefined;
}

/** The name, dithering and interval fields that adding and editing a preset share. */
export function DevicePresetDialog({
  open,
  onOpenChange,
  title,
  submitLabel,
  pendingLabel,
  submitVariant,
  initial,
  onSubmit,
}: Props) {
  const [err, setErr] = useState<string | null>(null);

  const defaultValues: PresetFormValues = { ...initial };
  const form = useAppForm({
    defaultValues,
    validators: { onChange: ({ value }) => validate(value) },
    onSubmit: async ({ value }) => {
      setErr(null);
      try {
        await onSubmit({
          name: value.name.trim(),
          dither_algo: value.dither_algo as DitheringAlgo,
          dither_palette: value.dither_palette as DitheringPalette,
          interval: value.interval ?? 0,
        });
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
        return;
      }
      handleOpenChange(false);
    },
  });

  function handleOpenChange(next: boolean) {
    if (!next) {
      form.reset();
      setErr(null);
    }
    onOpenChange(next);
  }

  return (
    <DialogLayout
      open={open}
      onOpenChange={handleOpenChange}
      title={title}
      size="sm"
      hasUnsavedChanges={() => !form.state.isDefaultValue}
      contentSlot={
        <FormElement className="gap-4" onSubmit={() => form.handleSubmit()}>
          <InputField form={form} name="name" label="Name" placeholder="My preset" required />
          <SelectField form={form} name="dither_algo" label="Algorithm" options={ALGO_OPTIONS} />
          <SelectField
            form={form}
            name="dither_palette"
            label="Palette"
            options={PALETTE_OPTIONS}
          />
          <NumberField
            form={form}
            name="interval"
            label="Update interval (seconds)"
            description="Set to 0 for server default. Recommended: 120-300 seconds."
            min={0}
            step={1}
            placeholder="120"
          />
          {err && <Alert variant="destructive" title="Could not save" description={err} />}
        </FormElement>
      }
      footerActionsSlot={(close) => (
        <>
          <Button variant="outline" content="Cancel" onClick={close} />
          <form.AppForm>
            <form.SubmitButton
              variant={submitVariant}
              content={submitLabel}
              pendingLabel={pendingLabel}
            />
          </form.AppForm>
        </>
      )}
    />
  );
}
