import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { IconClassContext } from "@/components/ui/icons-base";
import type { TooltipSide } from "@/components/ui/tooltip-base";
import { cn, type SlotNode, touchTarget } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * The button's container classes for each `variant` and `size`. Each variant does the same under
 * the pointer, the keyboard and a finger: `hover:`, `focus-visible:` and `active:`, the last being
 * the only one a touch screen fires.
 */
const buttonVariants = cva(
  "group/button inline-flex flex-row items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-colors focus-visible:outline-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      /**
       * What the button does, which picks its colours: `default` for the one to press, `positive`
       * for an action that keeps the work (Save), `info` for one that adds something (Add, New),
       * `destructive` for one that destroys, and `outline` for a quiet one. Each `-outline` is its
       * colour without the fill, for an action that is not the emphasis of its row. `secondary`
       * is an icon inside a field's own border. `ghost` and `link` are kept for shadcn code, and
       * nothing in the registry uses them.
       */
      variant: {
        default:
          "bg-neutral text-neutral-foreground hover:bg-neutral/90 focus-visible:bg-hover focus-visible:text-foreground active:bg-neutral/90",
        destructive:
          "bg-negative text-negative-foreground hover:bg-negative/90 focus-visible:bg-hover focus-visible:text-foreground active:bg-negative/90",
        /** A destructive action that is not the emphasis of its row. */
        "destructive-outline":
          "border border-negative/50 bg-transparent text-negative hover:border-negative hover:bg-negative/10 focus-visible:border-negative focus-visible:bg-negative/10 active:border-negative active:bg-negative/10",
        /** The action that keeps the work: save, confirm, create. */
        positive:
          "bg-positive text-positive-foreground hover:bg-positive/90 focus-visible:bg-hover focus-visible:text-foreground active:bg-positive/90",
        "positive-outline":
          "border border-positive/50 bg-transparent text-positive hover:border-positive hover:bg-positive/10 focus-visible:border-positive focus-visible:bg-positive/10 active:border-positive active:bg-positive/10",
        /** The action that adds something: add, new, create. */
        info: "bg-info text-info-foreground hover:bg-info/90 focus-visible:bg-hover focus-visible:text-foreground active:bg-info/90",
        "info-outline":
          "border border-info/50 bg-transparent text-info hover:border-info hover:bg-info/10 focus-visible:border-info focus-visible:bg-info/10 active:border-info active:bg-info/10",
        // The outline family's edge darkens with its fill, as `secondary`'s does: the fill alone
        // changed 1.1-1.5:1 when focused, and every Cancel is one of these.
        outline:
          "border border-foreground/50 bg-background text-foreground hover:border-foreground/60 hover:bg-hover focus-visible:border-foreground/60 focus-visible:bg-hover active:border-foreground/60 active:bg-hover",
        // Hover and focus draw an edge, not a fill: `bg-hover` is 1.01:1 against this grey, so the
        // icon buttons inside a field (reveal, clear) showed no change when tabbed to.
        secondary:
          "border border-transparent bg-foreground/10 text-foreground hover:border-foreground/60 focus-visible:border-foreground/60 active:border-foreground/60",
        ghost:
          "text-foreground/60 hover:bg-hover hover:text-foreground focus-visible:bg-hover focus-visible:text-foreground active:bg-hover active:text-foreground",
        link: "text-info underline-offset-4 hover:underline focus-visible:underline active:underline",
      },
      // The glyph's size is `BUTTON_ICON_SIZES`'s too, written out here as `[&_svg]:` for the web,
      // where the icon is an `<svg>` inside the button.
      size: {
        default: "h-10 px-4 py-2",
        /** Small enough to sit inline in a list row without setting its height. */
        xs: "h-7 px-3 [&_svg]:size-3.5",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
        // shadcn's icon ladder, on this file's own heights: each square is the height of the
        // text size it is named after, so an icon button sits flush in a row of text buttons.
        "icon-xs": "h-7 w-7 [&_svg]:size-3.5",
        "icon-sm": "h-9 w-9",
        "icon-lg": "h-11 w-11 [&_svg]:size-5",
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
const buttonTextVariants = cva("font-semibold", {
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
      default: "text-neutral-foreground group-focus-visible/button:text-foreground",
      destructive: "text-negative-foreground group-focus-visible/button:text-foreground",
      "destructive-outline": "text-negative",
      positive: "text-positive-foreground group-focus-visible/button:text-foreground",
      "positive-outline": "text-positive",
      info: "text-info-foreground group-focus-visible/button:text-foreground",
      "info-outline": "text-info",
      outline: "text-foreground",
      secondary: "text-foreground",
      ghost: "text-foreground/60 group-focus-visible/button:text-foreground",
      link: "text-info underline",
    },
  },
  defaultVariants: { variant: "default", size: "default" },
});

/**
 * The glyph's size in each button size, for a device, where an icon is sized by the class
 * `IconClassContext` hands it and was otherwise lucide's own 24px. The `[&_svg]:` classes in
 * `buttonVariants` are the same sizes for the web. 14px beside `xs`'s 12px label and in its square;
 * 20px in `icon-lg`, where 16px sat lost in a 44px square; 16px everywhere else. `lg` keeps 16px
 * because its label is still `text-sm`.
 */
const BUTTON_ICON_SIZES = {
  default: "size-4",
  xs: "size-3.5",
  sm: "size-4",
  lg: "size-4",
  icon: "size-4",
  "icon-xs": "size-3.5",
  "icon-sm": "size-4",
  "icon-lg": "size-5",
} as const;

/**
 * How much of a finger's 44pt each size takes from a `hitSlop` on device (#470), as the size it
 * hands `touchTarget`. All the height, from each size's own. The width only on an icon square and
 * only by 4px a side: buttons sit side by side 4px apart (`ICON_ACTION_GAP`), and of two
 * overlapping targets the later takes the press, so a wider reach would hand the edge of Edit to the
 * Delete beside it. So `icon-sm` and `icon` are 44pt square, `icon-xs` is 36 by 44, and a text
 * button is as wide as its label.
 */
const BUTTON_TOUCH_SIZES = {
  default: { height: 40 },
  xs: { height: 28 },
  sm: { height: 36 },
  lg: { height: 44 },
  icon: { width: 40, height: 40 },
  "icon-xs": { width: 36, height: 28 },
  "icon-sm": { width: 36, height: 36 },
  "icon-lg": { width: 44, height: 44 },
} as const;

/**
 * A link button that cannot be followed keeps the pointer otherwise: the compiled reset gives a
 * refused `<button>` the not-allowed cursor, and the caller's `<a>` carries none of its classes.
 */
const REFUSED_LINK_CURSOR = "cursor-not-allowed";

/** The button itself, before the name rule and the tooltip are added to it. */
type ButtonBodyProps = Omit<
  React.ComponentPropsWithoutRef<"button">,
  // `content` is also an HTML attribute (RDFa's), a string, which the compiled half would
  // otherwise intersect with the label's type.
  "children" | "className" | "content"
> &
  VariantProps<typeof buttonVariants> & {
    // Re-declared rather than inherited: nativewind types it as
    // `className?: string`, which under `exactOptionalPropertyTypes` rejects the
    // conditional `cond ? 'x' : undefined` that call sites pass.
    /** On the button's box, after the variant's and the size's classes. */
    className?: string | undefined;
    /**
     * The label. A string is drawn in the variant's ink; anything else is rendered as it is —
     * a select's trigger passes the chosen value's own `<Text>`.
     */
    content?: React.ReactNode;
    /** Before the label, or alone in an `icon*` size, where `aria-label` is required. */
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
     *
     * Disabled or `loading`, the link is not followed. On the web it is `aria-disabled`, its click
     * is cancelled and it leaves the tab order unless it has a `hint`; it is never handed
     * `disabled`, which an `<a>` ignores. On device the button is drawn without the link.
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

type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>["size"]>;

/** The sizes that draw an icon and no label. */
type IconSize = Extract<ButtonSize, `icon${string}`>;

/** Whether `size` is a square with no room for words, where a label is only the accessible name. */
function isIconSize(size: ButtonSize | null | undefined): size is IconSize {
  return size?.startsWith("icon") === true;
}

/**
 * The accessible name, which an `icon*` size cannot go without.
 *
 * An icon alone is announced as "button". A `title` is a hover hint and not a name, so the type
 * asks for `aria-label`, because a type is checked and a review is not.
 */
type IconButtonName = {
  /**
   * How big it is. `default`, `xs`, `sm` and `lg` draw the label; `xs` is small enough to sit in
   * a list row without setting its height. Each `icon*` size is a square as tall as the text
   * size it is named after, which draws `iconSlot` alone and so needs an `aria-label`.
   */
  size: IconSize;
  /**
   * The button's accessible name. Required at an `icon*` size, which has no label to be named
   * by; beside a label, it replaces the label as the name.
   */
  "aria-label": string;
};

/** A button with a label is named by it, and may be given another name. */
type TextButtonName = {
  /** How big it is. An `icon*` size draws no label, and needs an `aria-label`. */
  size?: Exclude<ButtonSize, IconSize> | null | undefined;
  /** A name in place of the label's, for a label that is not enough on its own. */
  "aria-label"?: string | undefined;
};

type ButtonHint = {
  /**
   * Why it is unavailable, or what it will do: the tooltip, in place of an icon size's name, and
   * read after the name whether or not the tooltip is open. On device only a string is read; a
   * node is shown and not read.
   *
   * With a `hint`, `disabled` keeps the button's focus, hover and tooltip and refuses the press,
   * since a truly disabled button could not be asked why.
   */
  hint?: React.ReactNode | undefined;
  /**
   * Whether the tooltip is drawn: the `hint`, or with none an `icon*` size's `aria-label`. Off, a
   * `hint` is still the button's description. Turn it off where the icon already explains itself.
   *
   * @defaultValue true
   */
  tooltip?: boolean | undefined;
  /** Which edge of the button the tooltip sits on. */
  side?: TooltipSide | undefined;
  /**
   * More ids to describe the button with, kept ahead of the hint's own. Web only: a device
   * describes a control with its accessibility hint, which is what `hint` becomes there.
   */
  "aria-describedby"?: string | undefined;
};

type ButtonSharedProps = Omit<ButtonBodyProps, "size" | "aria-label"> & ButtonHint;

export type ButtonProps = ButtonSharedProps & (IconButtonName | TextButtonName);

/** `Omit` over each arm of a union, where the plain one would merge the arms into one. */
type OmitEach<Props, Key extends PropertyKey> = Props extends unknown ? Omit<Props, Key> : never;

/** {@link ButtonProps} less some keys, with an `icon*` size still tied to its `aria-label`. */
export type ButtonPropsWithout<Key extends PropertyKey> = OmitEach<ButtonProps, Key>;

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

/** Refuses a press, and with it the link a click on an `<a>` would follow. */
const cancel = (event: { preventDefault: () => void }) => event.preventDefault();

/** The pressable itself: `Button` without its tooltip and its `hint`. */
const ButtonBody = React.forwardRef<HTMLButtonElement, ButtonBodyProps>(
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
    // What an icon is handed: the label's ink, and the glyph's size, which a label has no use for.
    const iconSize = BUTTON_ICON_SIZES[size ?? "default"];
    const iconClass = cn(labelClass, iconSize, "shrink-0");

    const label = loading && loadingLabel !== undefined ? loadingLabel : content;
    const leading = loading ? (
      // Hidden: `aria-busy` is what says the button is working, and a spinner with a name of
      // its own would be read into the button's — "Loading Save".
      <div aria-hidden className="cube-rn-view">
        {/* The icon's size, which the spinner's own class would otherwise beat on device. */}
        <Spinner className={iconSize} />
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
        // Before `props`, so a caller's own `hitSlop` still wins.
        {...touchTarget(BUTTON_TOUCH_SIZES[size ?? "default"])}
        {...(props as React.ComponentPropsWithoutRef<"button">)}
        onClick={pressThenClick(onPress, (props as MergedClick).onClick)}
      >
        <IconClassContext.Provider value={iconClass}>
          {leading}
          {labelled}
          {trailingSlot}
        </IconClassContext.Provider>
      </button>
    );
    if (!linkSlot) {
      return button;
    }

    // `Button` marks a disabled button with a `hint` `aria-disabled` and leaves it pressable, so the
    // reason can be reached. Its link is no more to be followed than a plainly disabled one's.
    const refused = props["aria-disabled"] === true;
    const unavailable = disabled || refused;
    // A DOM element takes the press as a click; a router's link is a component and takes `onPress`.
    // Handed `onPress`, a bare `<a>` drops it. Compiled, both arms are `onClick`, which is right there.
    const isDomLink = typeof linkSlot.type === "string";
    // Not `disabled` (#410): an `<a>` has no such attribute and was followed anyway, and a router's
    // link may hand an unknown prop to its `<a>` or read it as its own. `Button` hands an unavailable
    // link `cancel` as its press, and a cancelled click is what the browser and the routers' links
    // both heed. The middle button's click opens a tab instead, so it is cancelled too.
    const unavailableProps = unavailable
      ? { "aria-disabled": true, onAuxClick: cancel, ...(refused ? {} : { tabIndex: -1 }) }
      : {};

    return (
      // The provider goes *outside* the `Slot`, and the caller's element is the Slot's
      // one child. Inside, the provider was the child: `Slot` merged the classes and
      // the press onto it, it dropped them, and the caller's `<a>` rendered unstyled (#156).
      <IconClassContext.Provider value={iconClass}>
        {/* `Slot` is declared over `HTMLAttributes<HTMLElement>` because radix ships
            for the DOM, but it renders nothing itself — it clones its child with these
            props merged in. The element that receives them is the caller's, so the DOM
            typing describes neither side, and the cast is the honest way to say so. */}
        <Slot
          className={unavailable ? cn(styling, REFUSED_LINK_CURSOR) : styling}
          {...({
            ...props,
            ...busy,
            ...(isDomLink ? { onClick: onPress } : { onClick: onPress }),
            ...unavailableProps,
          } as unknown as React.HTMLAttributes<HTMLElement>)}
          ref={ref as unknown as React.Ref<HTMLElement>}
        >
          {React.cloneElement(linkSlot, undefined, leading, labelled, trailingSlot)}
        </Slot>
      </IconClassContext.Provider>
    );
  },
);
ButtonBody.displayName = "ButtonBody";

/** Hands `node` to a ref of either kind. */
function assignRef<Node>(ref: React.ForwardedRef<Node>, node: Node | null) {
  if (typeof ref === "function") {
    ref(node);
    return;
  }
  if (ref) {
    ref.current = node;
  }
}

type ButtonRef = React.RefAttributes<HTMLButtonElement>;

/**
 * `Button`'s two signatures: the one a call is checked against, then the one
 * `ComponentProps<typeof Button>` reads, which is always the last.
 *
 * The second is the props without the `icon*` sizes. Read as the union, Storybook's `StoryObj`
 * intersects the two arms into `never`; a wrapper that takes an `icon*` size uses
 * {@link ButtonProps}.
 */
type ButtonComponent = {
  (props: ButtonProps & ButtonRef): React.ReactNode;
  (props: ButtonSharedProps & TextButtonName & ButtonRef): React.ReactNode;
  displayName?: string | undefined;
};

/**
 * A button made of `iconSlot`, `content` and `trailingSlot`, with a `loading` state, an icon size's
 * name as its tooltip, and a `hint` that takes the name's place there and can still be read while
 * it is disabled.
 */
const Button: ButtonComponent = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      hint,
      tooltip = true,
      side = "top",
      disabled,
      className,
      onClick: onPress,
      "aria-describedby": ariaDescribedBy,
      ...props
    },
    ref,
  ) => {
    const hintId = React.useId();
    const hasHint = Boolean(hint);
    // Only with a hint: with nothing to read, a disabled button is better off out of the tab order.
    const refuses = hasHint && Boolean(disabled);
    // A disabled `<button>` ignores the press itself. A link's `<a>` cannot be disabled, so its press
    // is refused here.
    const unavailable = Boolean(disabled) || props.loading === true;

    const node = React.useRef<HTMLButtonElement | null>(null);
    const setNode = React.useCallback(
      (next: HTMLButtonElement | null) => {
        node.current = next;
        assignRef(ref, next);
      },
      [ref],
    );
    // Under Expo web react-native-web's `Pressable` writes its own `aria-disabled` over the one it
    // is handed, so the refusal was not announced there. It is put on the element instead.
    React.useEffect(() => {
      if (refuses === false) {
        return;
      }
      const element = node.current as unknown as Element | null;
      element?.setAttribute("aria-disabled", "true");
      return () => element?.removeAttribute("aria-disabled");
    }, [refuses]);

    // Only pointed at when there is a hint: with none the tooltip is the name, and describing the
    // button with its own name has it read as "Delete workspace, Delete workspace". The key is
    // passed even when empty: radix points its trigger at the open bubble, and `Slot` lets the
    // child's value win.
    const describedBy = hasHint
      ? [ariaDescribedBy, hintId].filter(Boolean).join(" ")
      : ariaDescribedBy;

    const button = (
      <ButtonBody
        aria-describedby={describedBy}
        {...props}
        ref={setNode}
        // Not `disabled`: on the web the attribute is what removes the hover and the tab stop, and
        // on device the prop is what swallows the long press, and with them the explanation.
        disabled={refuses ? false : disabled}
        {...(refuses ? { "aria-disabled": true } : {})}
        // `opacity-50` is what `disabled` would have drawn.
        className={cn(refuses && "opacity-50", className)}
        onClick={unavailable ? cancel : onPress}
      />
    );

    // Outside the button: `aria-label` already overrides its content for the name. Web only,
    // where `aria-describedby` is how it is read; the device has the accessibility hint.
    const description = hasHint ? (
      <span id={hintId} className="cube-rn-text sr-only text-foreground">
        {hint}
      </span>
    ) : null;

    // An icon tells a pointer nothing of what it does, so its name is the tooltip until a hint says
    // more (#419). It is not the description: that would read the name twice.
    const iconName = isIconSize(props.size) ? props["aria-label"] : undefined;
    const tip = hasHint ? hint : iconName;
    // `tooltip={false}` drops the tooltip, not the explanation: the description stays.
    const drawsTooltip = tooltip !== false && Boolean(tip);
    if (drawsTooltip === false) {
      return (
        <>
          {button}
          {description}
        </>
      );
    }

    return (
      <>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side={side}>{tip}</TooltipContent>
        </Tooltip>
        {description}
      </>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonTextVariants, buttonVariants, isIconSize };
