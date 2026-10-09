import type { ReactNode } from "react";
import * as React from "react";
import { cn, type SlotNode } from "@/lib/utils";

type Focusable = HTMLButtonElement;

/** The web's key event, narrowed to the two members used — the same shape on both halves. */
type KeyEvent = { key: string; preventDefault: () => void };

type RadioGroupVariant = "row" | "card" | "segmented";

type RadioGroupContextValue = {
  value: string | undefined;
  tabStop: string | undefined;
  disabled: boolean;
  invalid: boolean;
  variant: RadioGroupVariant;
  select: (value: string) => void;
  move: (from: string, event: KeyEvent) => void;
  register: (value: string, ref: React.RefObject<Focusable | null>, disabled: boolean) => void;
  unregister: (value: string) => void;
};

const RadioGroupContext = React.createContext<RadioGroupContextValue | null>(null);

function useRadioGroup() {
  const context = React.useContext(RadioGroupContext);
  if (!context) {
    throw new Error("RadioGroupItem must be used within <RadioGroup>");
  }
  return context;
}

/** The one DOM method the ordering needs, which a device's node does not have. */
type Positioned = { compareDocumentPosition: (other: unknown) => number };

function isPositioned(node: unknown): node is Positioned {
  return typeof node === "object" && node !== null && "compareDocumentPosition" in node;
}

/** DOM order, where there is a DOM. On device there is no keyboard to need it. */
function byDocumentPosition(a: Focusable | null, b: Focusable | null) {
  if (isPositioned(a) === false || !b) {
    return 0;
  }
  // `Node.DOCUMENT_POSITION_FOLLOWING`, spelled out: `Node` is not a global on device.
  return a.compareDocumentPosition(b) & 4 ? -1 : 1;
}

type RadioGroupProps = {
  /** The checked option's value. Pass it with `onValueChange` for a controlled group. */
  value?: string | undefined;
  /** The option checked on first render, for an uncontrolled group. */
  defaultValue?: string | undefined;
  onValueChange?: ((value: string) => void) | undefined;
  disabled?: boolean | undefined;
  /**
   * `row` (the default): a circle, a label and an optional description per option, stacked.
   * `card`: a bordered tile per option, icon over label, sharing a row.
   * `segmented`: one framed, input-height row of equal segments. Each segment shows its
   * `iconSlot`, its `label`, or both; an icon-only segment is named by its `aria-label`. It is as
   * wide as a column it is stacked in, and as wide as its segments in a row of other things — a
   * header bar — where `className="flex-1"` makes it take what the row has left.
   */
  variant?: RadioGroupVariant | undefined;
  /**
   * How the options are laid out. Defaults to `vertical` for `row` and `horizontal` for `card`.
   * `segmented` is always one row and ignores it.
   */
  orientation?: "vertical" | "horizontal" | undefined;
  /** Whether the arrow keys wrap from the last option to the first. On by default. */
  loop?: boolean | undefined;
  id?: string | undefined;
  className?: string | undefined;
  children?: ReactNode;
  /** A group has no visible name of its own: name it with one of these two. */
  "aria-label"?: string | undefined;
  "aria-labelledby"?: string | undefined;
  "aria-describedby"?: string | undefined;
  "aria-invalid"?: boolean | undefined;
  "aria-required"?: boolean | undefined;
};

/** A set of options of which one is chosen, with one tab stop and arrow keys. */
function RadioGroup({
  value: valueProp,
  defaultValue,
  onValueChange,
  disabled = false,
  variant = "row",
  orientation,
  loop = true,
  id,
  className,
  children,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  "aria-required": ariaRequired,
}: RadioGroupProps) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue);
  const value = valueProp !== undefined ? valueProp : uncontrolled;

  const refs = React.useRef(new Map<string, React.RefObject<Focusable | null>>());
  // Which options exist and whether each is disabled — state rather than a ref, because the tab
  // stop is derived from it and has to re-render when an option arrives.
  const [options, setOptions] = React.useState<ReadonlyMap<string, boolean>>(new Map());

  const register = React.useCallback(
    (option: string, ref: React.RefObject<Focusable | null>, optionDisabled: boolean) => {
      refs.current.set(option, ref);
      setOptions((prev) => {
        if (prev.get(option) === optionDisabled) {
          return prev;
        }
        const next = new Map(prev);
        next.set(option, optionDisabled);
        return next;
      });
    },
    [],
  );
  const unregister = React.useCallback((option: string) => {
    refs.current.delete(option);
    setOptions((prev) => {
      if (prev.has(option) === false) {
        return prev;
      }
      const next = new Map(prev);
      next.delete(option);
      return next;
    });
  }, []);

  const enabled = () =>
    disabled
      ? []
      : [...options]
          .filter(([, optionDisabled]) => optionDisabled === false)
          .map(([option]) => option)
          .sort((a, b) =>
            byDocumentPosition(
              refs.current.get(a)?.current ?? null,
              refs.current.get(b)?.current ?? null,
            ),
          );

  const select = (next: string) => {
    if (valueProp === undefined) {
      setUncontrolled(next);
    }
    if (next !== value) {
      onValueChange?.(next);
    }
  };

  const move = (from: string, event: KeyEvent) => {
    const order = enabled();
    const at = order.indexOf(from);
    const last = order.length - 1;
    // Where a step past either end lands: round to the other end, or nowhere.
    const pastLast = loop ? 0 : at;
    const pastFirst = loop ? last : at;
    let to: number;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      to = at < last ? at + 1 : pastLast;
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      to = at > 0 ? at - 1 : pastFirst;
    } else if (event.key === "Home") {
      to = 0;
    } else if (event.key === "End") {
      to = last;
    } else {
      return;
    }
    // Always, even at an end with `loop={false}`: an arrow key the group owns must not also
    // scroll the page.
    event.preventDefault();
    const target = order[to];
    if (target === undefined || target === from) {
      return;
    }
    refs.current.get(target)?.current?.focus();
    select(target);
  };

  const order = enabled();
  const tabStop = value !== undefined && order.includes(value) ? value : order[0];
  const horizontal =
    (orientation ?? (variant === "card" ? "horizontal" : "vertical")) === "horizontal";
  const stacked = horizontal ? "flex-row flex-wrap gap-3" : "gap-3";
  const layout =
    variant === "segmented"
      ? cn(
          // `self-stretch`, not `w-full`: in a row that is sized by its content, a browser
          // measures a percentage width as the content's and then resolves it against the total,
          // which pushed the group's neighbours out of the row by their own width.
          "h-10 self-stretch flex-row gap-1 rounded-md border bg-background p-1",
          ariaInvalid === true ? "border-negative" : "border-foreground/15",
        )
      : stacked;

  return (
    <RadioGroupContext.Provider
      value={{
        value,
        tabStop,
        disabled,
        invalid: ariaInvalid === true,
        variant,
        select,
        move,
        register,
        unregister,
      }}
    >
      <div
        role="radiogroup"
        data-slot="radio-group"
        {...(id ? { id } : {})}
        {...(ariaLabel ? { "aria-label": ariaLabel } : {})}
        {...(ariaLabelledBy ? { "aria-labelledby": ariaLabelledBy } : {})}
        {...(disabled ? { "aria-disabled": true } : {})}
        // React Native has no prop for these three; react-native-web and the DOM read them.
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-required={ariaRequired}
        className={cn("cube-rn-view", layout, className)}
      >
        {children}
      </div>
    </RadioGroupContext.Provider>
  );
}

type RadioGroupItemProps = {
  value: string;
  /** The option's name. Left out, the item is the bare circle, for a caller's own `<Label>`. */
  label?: ReactNode | undefined;
  /** A line under the label: what picking this one means. Not drawn by `segmented`. */
  description?: ReactNode | undefined;
  /**
   * The picture over the label in a `card` tile, or the segment's face in `segmented`. Ignored by
   * `row`. On device an icon has no `currentColor` to inherit, so in `segmented` give it the
   * checked segment's `text-active-foreground` and the others' `text-foreground/60` yourself.
   */
  iconSlot?: SlotNode | undefined;
  /**
   * A hover hint — the web's `title` — and the accessibility hint on device. For the one extra
   * sentence a tile has no room for; say anything a user needs to choose in `description`.
   *
   * An icon-only `segmented` option with no `hint` uses its `aria-label` as the web tooltip, so the
   * name a screen reader hears is also what a pointer sees on hover. Device has no hover, so there
   * it is the name alone, with no hint repeating it.
   */
  hint?: string | undefined;
  /** The DOM's name for `hint`, accepted so a shadcn call site ports unchanged. `hint` wins. */
  title?: string | undefined;
  disabled?: boolean | undefined;
  /** The option's own id — what a `<Label htmlFor>` points at when `label` is left out. */
  id?: string | undefined;
  className?: string | undefined;
  "aria-label"?: string | undefined;
  "aria-describedby"?: string | undefined;
};

/** One option in a `RadioGroup`. */
function RadioGroupItem({
  value,
  label,
  description,
  iconSlot,
  hint: hintProp,
  title,
  disabled: itemDisabled = false,
  id,
  className,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedByProp,
}: RadioGroupItemProps) {
  const hint = hintProp ?? title;
  const group = useRadioGroup();
  const ref = React.useRef<Focusable>(null);
  const uid = React.useId();
  const labelId = `${uid}-label`;
  const descriptionId = `${uid}-description`;

  const { register, unregister } = group;
  React.useEffect(() => {
    register(value, ref, itemDisabled);
  }, [register, value, itemDisabled]);
  React.useEffect(() => () => unregister(value), [unregister, value]);

  const checked = group.value === value;
  const disabled = group.disabled || itemDisabled;
  const card = group.variant === "card";
  const segmented = group.variant === "segmented";
  // The bare circle is for a caller's own `<Label>`; a segment is never one.
  const bare = label === undefined && segmented === false;
  const tooltip = hint ?? (segmented && label === undefined ? ariaLabel : undefined);
  // A segment has no room for a description and draws none, so it points at none either.
  const describedBy =
    [description && segmented === false ? descriptionId : null, ariaDescribedByProp ?? null]
      .filter(Boolean)
      .join(" ") || undefined;

  const circle = (
    <div
      className={cn(
        "cube-rn-view",
        "h-4 w-4 shrink-0 items-center justify-center rounded-full border",
        checked ? "border-active" : "border-foreground/15",
        group.invalid && "border-negative",
      )}
    >
      {checked ? <div className="cube-rn-view h-2 w-2 rounded-full bg-active" /> : null}
    </div>
  );

  // The item's box, one shape per variant.
  const look = () => {
    if (bare) {
      return "rounded-full focus-visible:bg-hover";
    }
    if (segmented) {
      return cn(
        "min-w-0 flex-1 flex-row items-center justify-center gap-1.5 rounded-sm px-3",
        checked
          ? "bg-active text-active-foreground focus-visible:bg-active/90"
          : "text-foreground/60 hover:bg-hover hover:text-foreground focus-visible:bg-hover focus-visible:text-foreground",
      );
    }
    if (card) {
      return cn(
        "min-w-0 flex-1 items-center gap-1.5 rounded-lg border p-3",
        // The border alone says checked: a tinted fill takes the muted description under 4.5:1.
        checked ? "border-active bg-background" : "border-foreground/15 bg-background",
        "focus-visible:bg-hover",
        group.invalid && "border-negative",
      );
    }
    return "flex-row items-start gap-3 rounded-sm focus-visible:bg-hover";
  };

  // What the box holds, in the same order.
  const content = () => {
    if (bare) {
      return circle;
    }
    if (segmented) {
      return (
        <>
          {iconSlot ? (
            <div className="cube-rn-view items-center justify-center">{iconSlot}</div>
          ) : null}
          {label !== undefined ? (
            <span
              id={labelId}
              className={cn(
                "cube-rn-text",
                "truncate text-sm font-medium",
                checked ? "text-active-foreground" : "text-foreground/60",
              )}
            >
              {label}
            </span>
          ) : null}
        </>
      );
    }
    if (card) {
      return (
        <>
          {iconSlot ? (
            <div className="cube-rn-view items-center justify-center">{iconSlot}</div>
          ) : null}
          <span
            id={labelId}
            className="cube-rn-text text-center text-foreground text-sm font-medium"
          >
            {label}
          </span>
          {description ? (
            <span
              id={descriptionId}
              className="cube-rn-text text-center text-foreground/60 text-xs"
            >
              {description}
            </span>
          ) : null}
        </>
      );
    }
    return (
      <>
        <div className="cube-rn-view mt-0.5">{circle}</div>
        <div className="cube-rn-view min-w-0 flex-1 gap-1">
          <span id={labelId} className="cube-rn-text text-foreground text-sm">
            {label}
          </span>
          {description ? (
            <span id={descriptionId} className="cube-rn-text text-foreground/60 text-sm">
              {description}
            </span>
          ) : null}
        </div>
      </>
    );
  };

  return (
    <button
      type="button"
      ref={ref as React.Ref<HTMLButtonElement>}
      data-slot="radio-group-item"
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => group.select(value)}
      {...(id ? { id } : {})}
      {...(label ? { "aria-labelledby": labelId } : {})}
      {...(ariaLabel ? { "aria-label": ariaLabel } : {})}
      aria-description={hint}
      tabIndex={group.tabStop === value ? (0 as const) : (-1 as const)}
      onKeyDown={(event: KeyEvent) => group.move(value, event)}
      aria-describedby={describedBy}
      title={tooltip}
      className={cn(
        "cube-rn-view cube-rn-pressable",
        "focus-visible:outline-none",
        look(),
        disabled && "opacity-50",
        className,
      )}
    >
      {content()}
    </button>
  );
}

export type { RadioGroupItemProps, RadioGroupProps };
export { RadioGroup, RadioGroupItem };
