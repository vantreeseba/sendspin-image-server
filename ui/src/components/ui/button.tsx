import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";
import { IconClassContext } from "@/components/ui/icons-base";
import { cn, type SlotNode } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

/** The button's container classes for each `variant` and `size`. */
const buttonVariants = cva(
  "inline-flex flex-row items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-neutral text-neutral-foreground hover:bg-neutral/90 focus-visible:bg-neutral/90",
        destructive:
          "bg-negative text-negative-foreground hover:bg-negative/90 focus-visible:bg-negative/90",
        /** A destructive action that is not the emphasis of its row. */
        "destructive-outline":
          "border border-negative/40 bg-transparent text-negative hover:bg-negative/10 focus-visible:bg-negative/10",
        /** The action that keeps the work: save, confirm, create. */
        positive:
          "bg-positive text-positive-foreground hover:bg-positive/90 focus-visible:bg-positive/90",
        "positive-outline":
          "border border-positive/40 bg-transparent text-positive hover:bg-positive/10 focus-visible:bg-positive/10",
        /** The action that adds something: add, new, create. */
        info: "bg-info text-info-foreground hover:bg-info/90 focus-visible:bg-info/90",
        "info-outline":
          "border border-info/40 bg-transparent text-info hover:bg-info/10 focus-visible:bg-info/10",
        outline:
          "border border-foreground/15 bg-background text-foreground hover:bg-hover focus-visible:bg-hover",
        secondary: "bg-foreground/10 text-foreground hover:bg-hover focus-visible:bg-hover",
        ghost:
          "text-foreground/60 hover:bg-hover hover:text-foreground focus-visible:bg-hover focus-visible:text-foreground",
        link: "text-info underline-offset-4 hover:underline focus-visible:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        /** Small enough to sit inline in a list row without setting its height. */
        xs: "h-7 rounded-lg px-3",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
        // shadcn's icon ladder, on this file's own heights: each square is the height of the
        // text size it is named after, so an icon button sits flush in a row of text buttons.
        "icon-xs": "h-7 w-7 rounded-lg [&_svg]:size-3.5",
        "icon-sm": "h-9 w-9",
        "icon-lg": "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

/**
 * The half of each variant that has to live on the `<Text>` for native.
 *
 * Not a duplicate of the container's `text-*` classes — both are needed. Web
 * reads the container's (and hands it to the icons through `currentColor`);
 * native reads this one, because a `<Text>` inherits nothing from the `View`
 * above it.
 */
const buttonTextVariants = cva("font-medium", {
  variants: {
    size: {
      default: "text-sm",
      xs: "text-xs",
      sm: "text-sm",
      lg: "text-sm",
      icon: "text-sm",
      "icon-xs": "text-xs",
      "icon-sm": "text-sm",
      "icon-lg": "text-sm",
    },
    variant: {
      default: "text-neutral-foreground",
      destructive: "text-negative-foreground",
      "destructive-outline": "text-negative",
      positive: "text-positive-foreground",
      "positive-outline": "text-positive",
      info: "text-info-foreground",
      "info-outline": "text-info",
      outline: "text-foreground",
      secondary: "text-foreground",
      ghost: "text-foreground/60",
      link: "text-info underline",
    },
  },
  defaultVariants: { variant: "default", size: "default" },
});

export type ButtonProps = Omit<
  React.ComponentPropsWithoutRef<"button">,
  // `content` is also an HTML attribute (RDFa's), a string, which the compiled half would
  // otherwise intersect with the label's type.
  "children" | "className" | "content"
> &
  VariantProps<typeof buttonVariants> & {
    // Re-declared rather than inherited: nativewind types it as
    // `className?: string`, which under `exactOptionalPropertyTypes` rejects the
    // conditional `cond ? 'x' : undefined` that call sites pass.
    className?: string | undefined;
    /**
     * The label. A string is drawn in the variant's ink; anything else is rendered as it is —
     * a select's trigger passes the chosen value's own `<Text>`.
     */
    content?: React.ReactNode;
    /**
     * Before the label, or alone in an `icon*` size — where the button needs an `aria-label`,
     * which `ActionButton` makes a required prop.
     */
    iconSlot?: SlotNode;
    /** The far end, after the label: a trigger's chevron, a count. */
    trailingSlot?: SlotNode;
    /**
     * The link this button is, as an element with no children: `<a href="/docs" />`, a router's
     * `<Link to="/docs" />`. It gets the button's look and press, and the icon and label are put
     * inside it.
     *
     * On the web the element is drawn *as* the button — radix's `Slot`, which only clones it with
     * the props merged in. On device a link is expo-router's, which takes the button the other
     * way round: it is given `asChild` and wraps the `Pressable`.
     */
    linkSlot?: React.ReactElement | undefined;
    /**
     * Pressed, and the work is still running: disabled, `aria-busy`, and a spinner where the
     * icon is — or before the label when there is none.
     */
    loading?: boolean | undefined;
    /** The label while `loading`: "Saving…". Without one the label stays as it was. */
    loadingLabel?: string | undefined;
  };

/**
 * The `onClick` a radix trigger merges onto its child through `Slot` — `<PopoverTrigger asChild>`
 * over a `Button`. Not a prop anyone passes here; it arrives at run time, so it is typed only as far
 * as this file uses it.
 */
type MergedClick = { onClick?: ((event: unknown) => void) | undefined };

/**
 * The press, then the click a trigger merged in — in that order, so a caller's `onPress` runs
 * first, as the child's own handler does under `Slot` on the DOM.
 *
 * Needed on Expo web, where this is react-native-web's `Pressable`: it puts its own `onClick` on
 * the DOM node (the one that calls `onPress`) and drops the one it was handed. So a radix popover
 * or dialog, which opens from `onClick`, never heard the press and never opened; the menu opens on
 * `pointerdown` and was fine. Keyboard activation reaches `onPress` too, on keyup, so Enter and
 * Space open it as well. On device nothing merges an `onClick`, and this is `onPress` unchanged.
 */
function pressThenClick<Press extends ((event: never) => void) | null | undefined>(
  onPress: Press,
  onClick: MergedClick["onClick"],
): Press {
  if (!onClick) {
    return onPress;
  }
  const both = (event: never) => {
    onPress?.(event);
    onClick(event);
  };
  return both as Press;
}

/** A button made of `iconSlot`, `content` and `trailingSlot`, with a `loading` state. */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      disabled: isDisabled,
      loading = false,
      loadingLabel,
      iconSlot,
      content,
      trailingSlot,
      linkSlot,
      onClick: onPress,
      ...props
    },
    ref,
  ) => {
    // A button that is still working cannot be pressed again.
    const disabled = isDisabled || loading;
    const styling = cn(
      buttonVariants({ variant, size, className }),
      // `disabled:` has no pseudo-class to hang off a Pressable on either
      // platform, so the disabled look is applied directly.
      disabled && "opacity-50",
    );

    // Labels and icons inside a button take the variant's text colour. On web they
    // already inherit it, so `icons.web.tsx` ignores this; native has no
    // inheritance and this is where the colour comes from.
    const labelClass = buttonTextVariants({ variant, size });

    const label = loading && loadingLabel !== undefined ? loadingLabel : content;
    const leading = loading ? (
      // Hidden: `aria-busy` is what says the button is working, and a spinner with a name of
      // its own would be read into the button's — "Loading Save".
      <div aria-hidden className="cube-rn-view">
        <Spinner />
      </div>
    ) : (
      iconSlot
    );
    const labelled =
      typeof label === "string" || typeof label === "number" ? (
        <span className={cn("cube-rn-text", labelClass)}>{label}</span>
      ) : (
        label
      );
    const busy = loading ? { "aria-busy": true } : {};

    const button = (
      <button
        type="button"
        ref={ref as React.Ref<HTMLButtonElement>}
        disabled={disabled}
        className={cn("cube-rn-view cube-rn-pressable", styling)}
        {...(busy as React.ComponentPropsWithoutRef<"button">)}
        {...(props as React.ComponentPropsWithoutRef<"button">)}
        onClick={pressThenClick(onPress, (props as MergedClick).onClick)}
      >
        <IconClassContext.Provider value={labelClass}>
          {leading}
          {labelled}
          {trailingSlot}
        </IconClassContext.Provider>
      </button>
    );
    if (!linkSlot) {
      return button;
    }
    // A DOM element takes the press as a click; a router's link is a component and takes `onPress`.
    // Handed `onPress`, a bare `<a>` drops it. Compiled, both arms are `onClick`, which is right there.
    const isDomLink = typeof linkSlot.type === "string";

    return (
      // The provider goes *outside* the `Slot`, and the caller's element is the Slot's
      // one child. Inside, the provider was the child: `Slot` merged the classes and
      // the press onto it, it dropped them, and the caller's `<a>` rendered unstyled (#156).
      <IconClassContext.Provider value={labelClass}>
        {/* `Slot.Root` is declared over `HTMLAttributes<HTMLElement>` because radix ships
            for the DOM, but it renders nothing itself — it clones its child with these
            props merged in. The element that receives them is the caller's, so the DOM
            typing describes neither side, and the cast is the honest way to say so. */}
        <Slot.Root
          className={styling}
          {...({
            ...props,
            ...busy,
            ...(isDomLink ? { onClick: onPress } : { onClick: onPress }),
            disabled,
          } as unknown as React.HTMLAttributes<HTMLElement>)}
          ref={ref as unknown as React.Ref<HTMLElement>}
        >
          {React.cloneElement(linkSlot, undefined, leading, labelled, trailingSlot)}
        </Slot.Root>
      </IconClassContext.Provider>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonTextVariants, buttonVariants };
