import {
  DARK_ONLY_PALETTES,
  isPalettePreference,
  isThemePreference,
  type PalettePreference,
  type ThemePreference,
} from "@/components/ui/theme-preference-base";
import { cn } from "@/lib/utils";
import { Monitor, Moon, Sun } from "@/components/ui/icons";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { usePalettePreference, useThemePreference } from "@/components/ui/theme-preference";

type ThemePickerProps = {
  /**
   * `card` (the default): three tiles, icon over caption, for a settings page. `compact`: one
   * row of icon-only segments, the caption as the name and (on the web) the tooltip.
   */
  variant?: "card" | "compact" | undefined;
  /** The checked choice, for a controlled picker. Left out, the picker is bound to the hook. */
  value?: ThemePreference | undefined;
  /** Told of every choice — the only way a controlled picker changes; a bound one also stores it. */
  onValueChange?: ((value: ThemePreference) => void) | undefined;
  disabled?: boolean | undefined;
  id?: string | undefined;
  className?: string | undefined;
  /** The group's name. Defaults to "Theme"; pass `aria-labelledby` instead when a heading names it. */
  "aria-label"?: string | undefined;
  "aria-labelledby"?: string | undefined;
  "aria-describedby"?: string | undefined;
  /** Offer a palette as well, under the theme: these, in this order. Left out, no palette choice. */
  palettes?: readonly PalettePreference[] | undefined;
  /** The checked palette, for a controlled picker. Left out, the palette is bound to its hook. */
  palette?: PalettePreference | undefined;
  /** Told of every palette chosen; a bound picker also stores it. */
  onPaletteChange?: ((value: PalettePreference) => void) | undefined;
};

const PALETTE_OPTIONS: Record<PalettePreference, { label: string; description: string }> = {
  default: { label: "Default", description: "cubeui's own colours" },
  monokai: { label: "Monokai", description: "The editor theme. Dark only" },
};

const OPTIONS = [
  { value: "light", label: "Light", hint: "Always light", Icon: Sun },
  { value: "dark", label: "Dark", hint: "Always dark", Icon: Moon },
  { value: "system", label: "System", hint: "Follow the device", Icon: Monitor },
] as const;

function ThemeOptions({
  variant = "card",
  palettes: _palettes,
  palette: _palette,
  onPaletteChange: _onPaletteChange,
  value,
  onValueChange,
  disabled,
  id,
  className,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
}: ThemePickerProps) {
  const compact = variant === "compact";
  return (
    <RadioGroup
      variant={compact ? "segmented" : "card"}
      value={value}
      onValueChange={(next) => {
        if (isThemePreference(next)) {
          onValueChange?.(next);
        }
      }}
      disabled={disabled}
      id={id}
      className={className}
      aria-label={ariaLabelledBy ? undefined : (ariaLabel ?? "Theme")}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
    >
      {OPTIONS.map(({ value: option, label, hint, Icon }) =>
        compact ? (
          // No `hint`: the segment's web tooltip is then its name, the caption a tile would show.
          <RadioGroupItem
            key={option}
            value={option}
            aria-label={label}
            iconSlot={
              <Icon
                aria-hidden
                className={cn(
                  "h-4 w-4",
                  // Named, because a native icon has no `currentColor` to inherit from the segment.
                  value === option ? "text-active-foreground" : "text-foreground/60",
                )}
              />
            }
          />
        ) : (
          <RadioGroupItem
            key={option}
            value={option}
            label={label}
            hint={hint}
            iconSlot={<Icon className="h-5 w-5" />}
          />
        ),
      )}
    </RadioGroup>
  );
}

function BoundThemePicker({ onValueChange, ...props }: ThemePickerProps) {
  const [preference, setPreference] = useThemePreference();
  return (
    <ThemeOptions
      {...props}
      value={preference}
      onValueChange={(next) => {
        setPreference(next);
        onValueChange?.(next);
      }}
    />
  );
}

function ThemeChoice(props: ThemePickerProps) {
  return props.value === undefined ? <BoundThemePicker {...props} /> : <ThemeOptions {...props} />;
}

type PaletteSectionProps = ThemePickerProps & { palettes: readonly PalettePreference[] };

function PaletteSection({
  palettes,
  palette,
  onPaletteChange,
  variant = "card",
  className,
  ...props
}: PaletteSectionProps) {
  const compact = variant === "compact";
  const darkOnly = palette !== undefined && DARK_ONLY_PALETTES.includes(palette);
  return (
    <div className={cn("cube-rn-view", "gap-3", className)}>
      <ThemeChoice {...props} variant={variant} disabled={props.disabled || darkOnly} />
      <RadioGroup
        variant={compact ? "segmented" : "card"}
        value={palette}
        onValueChange={(next) => {
          if (isPalettePreference(next)) {
            onPaletteChange?.(next);
          }
        }}
        disabled={props.disabled}
        aria-label="Palette"
      >
        {palettes.map((option) => (
          <RadioGroupItem
            key={option}
            value={option}
            label={PALETTE_OPTIONS[option].label}
            description={compact ? undefined : PALETTE_OPTIONS[option].description}
            hint={compact ? PALETTE_OPTIONS[option].description : undefined}
          />
        ))}
      </RadioGroup>
    </div>
  );
}

function BoundPaletteSection({ onPaletteChange, ...props }: PaletteSectionProps) {
  const [palette, setPalette] = usePalettePreference();
  return (
    <PaletteSection
      {...props}
      palette={palette}
      onPaletteChange={(next) => {
        setPalette(next);
        onPaletteChange?.(next);
      }}
    />
  );
}

/** The choice of Light, Dark or System, and optionally of palette. */
function ThemePicker(props: ThemePickerProps) {
  const { palettes } = props;
  if (!palettes) {
    return <ThemeChoice {...props} />;
  }
  return props.palette === undefined ? (
    <BoundPaletteSection {...props} palettes={palettes} />
  ) : (
    <PaletteSection {...props} palettes={palettes} />
  );
}

export type { ThemePickerProps };
export { ThemePicker };
