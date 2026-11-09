import { type ClassValue, clsx } from "clsx";
import {
  Children,
  cloneElement,
  createContext,
  createElement,
  Fragment,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { twMerge } from "tailwind-merge";

/**
 * Joins class names and lets the later of two conflicting Tailwind classes win.
 *
 * @param inputs - Class names, and the arrays and objects of them `clsx` takes.
 * @returns The one class string.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Row actions that fade in on hover.
 *
 * There is no hover off web, so the class that hides them would hide them for
 * good — on native they are simply always visible. Kept here rather than inline
 * so no component has to reach for `Platform` to express it.
 */
export const HOVER_REVEAL = "opacity-0 transition-opacity group-hover:opacity-100";

/**
 * How a box that is a tab stop only so a keyboard can scroll it shows focus: a table too wide for
 * its column, a code block. Its edge turns `active`, as a focused field's border does, and no ring
 * is drawn. A page's scrolling body draws the same line as an inset shadow, {@link INSET_FOCUS_EDGE},
 * because the pixel this takes would move it off the header's column. It cannot look hovered, the rule for everything else, because
 * a scroll box looks the same under the pointer. `active` is 3:1 from every surface (WCAG 1.4.11),
 * held by `palette-contrast.test.mjs`.
 *
 * The edge is there, transparent, for as long as the box is a tab stop, so focus moves nothing:
 * give it the class only while it has `tabIndex={0}`. A click shows nothing, which is what
 * `focus-visible` is for. Web only, as {@link HOVER_REVEAL} is: a device draws no keyboard focus,
 * and the edge would be a pixel of nothing around every scroller.
 */
export const FOCUS_EDGE = "border border-transparent outline-none focus-visible:border-active";

/**
 * {@link FOCUS_EDGE}'s line drawn as a 1px inset shadow, for a scroller whose pixel of border would
 * move what it holds: `HeaderContentFooter`'s body, off the header's column, and a stacked
 * `SplitLayout`. It takes no room, so it can be there while the box is not a tab stop as well.
 * The shadow is a rule, not elevation, as a pinned table header's is. Something with a fill laid
 * against the box's edge covers that side of it. Web only, as `FOCUS_EDGE` is.
 */
export const INSET_FOCUS_EDGE = "outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--active)]";

/**
 * A field whose value was refused, on device: the web halves draw the same thing from the
 * `aria-invalid` attribute (`aria-invalid:border-negative`), which React Native has no variant
 * for. Focus still wins while the value is being fixed. Here rather than in one field's base so
 * Input, Textarea and Select share it without installing each other.
 */
export const FIELD_INVALID_CLASS = "border-negative focus:border-active";

/**
 * A disabled field's words: its label, its description, a switch's caption. The step the control
 * fades by, so the field fades as one and a full-ink label does not sit over a faded box. `Field`
 * applies it to its parts from its own `disabled`.
 */
export const FIELD_DISABLED_CLASS = "opacity-50";

/*
 * The heading rhythm (#473): how a block or a row lays out its title, the line under it and its
 * action. `Card` and `CardLayout`, `Section`, `SettingRow`, `Item` at `sm`, `ListItem`,
 * `CollapsibleRow` and `Collapsible` all take it from here, on both halves. Each drew its own
 * once — a 16px card title, a 12px caps section title, rows with a 12px description 2px under the
 * title, actions centred on some and level with the title on others — and a card of rows read as
 * three type scales. The title and the line under it are the same size: the title leads by weight
 * and ink, not by size.
 */

/*
 * Touch targets (#470): on device, everything a finger presses is 44pt or more each way, Apple's
 * floor. A row reaches it by being that tall, since it is pressed as a whole and drawn as a whole;
 * a small control, by a `hitSlop` around the size it is drawn at, so the look does not grow. The
 * web keeps its drawn sizes, which are all 24px or more (WCAG 2.5.8). Both helpers are functions,
 * read as the control is drawn, so a story can turn `Platform.OS` to a device's and hold the
 * device's sizes in a browser.
 */

/** The smallest a finger's target is on device, each way, in points. */
export const TOUCH_TARGET = 44;

/** How big a pressable is drawn, in points. A side left out is not grown: a row's width. */
export type DrawnSize = { width?: number | undefined; height?: number | undefined };

/** How far a `hitSlop` reaches past each edge of the box it is on. */
export type TouchInsets = { top: number; bottom: number; left: number; right: number };

/** What {@link touchTarget} hands a `Pressable`. */
export type TouchTargetProps = { hitSlop?: TouchInsets | undefined };

/**
 * The `hitSlop` that grows a box drawn at `drawn` to {@link TOUCH_TARGET} each way, split evenly
 * between its two edges. A side already that big, or left out, gets none.
 */
export function hitSlopFor({
  width = TOUCH_TARGET,
  height = TOUCH_TARGET,
}: DrawnSize): TouchInsets {
  const edges = 2;
  const across = Math.max(0, (TOUCH_TARGET - width) / edges);
  const down = Math.max(0, (TOUCH_TARGET - height) / edges);
  return { top: down, bottom: down, left: across, right: across };
}

/**
 * A small pressable's touch target on device, spread onto it before the caller's props, so a
 * caller's own `hitSlop` still wins: `<Pressable {...touchTarget(CHECKBOX_DRAWN)} {...props} />`.
 * On the web it is nothing, so the compiled `<button>` is handed no prop it does not know.
 *
 * A `hitSlop` only reaches as far as the box around it: on Android, and inside a `ScrollView` or an
 * `overflow-hidden` box anywhere, a touch past the parent's edge is not delivered. It overlaps a
 * neighbour too, and the later of two overlapping siblings takes the touch. So it is for a control
 * with room around it — a checkbox, a dismiss ✕ — and a row, or anything stacked against the next
 * one, takes {@link touchRowClass} instead.
 */
// biome-ignore lint/correctness/noUnusedFunctionParameters: the web keeps the drawn size
export function touchTarget(drawn: DrawnSize): TouchTargetProps {
  return {};
}

/**
 * `min-h-11` on device and nothing on the web: a row pressed as a whole is {@link TOUCH_TARGET} tall
 * there. For a row, a menu's or a select's option, and anything else stacked against the next one,
 * where a `hitSlop` would take the neighbour's touches.
 */
export function touchRowClass(): string {
  return "";
}

/**
 * Code text, wherever it is drawn: `Code`, `CodeBlock`, `MarkdownEditor`'s source and
 * `MarkdownCodeEditor`. 12px in `--font-mono` on a 20px line (#480). A monospaced face reads larger
 * than the sans at the same size, so 12px sits beside 14px prose without shouting; and a line of
 * code is dense, so it takes the 20px line `text-sm` has rather than `text-xs`'s 16px. The three
 * had been 12px on 16px, 14px relaxed and 14px on 1.6 in a font stack of their own.
 */
export const CODE_TEXT = "font-mono text-xs leading-5";

/** A block's or a row's title: 14px semibold, on `text-sm`'s own 20px line, in full ink. */
export const HEADING_TITLE = "text-sm font-semibold text-foreground";

/** The line under a title: the title's size, at the `/60` step of ink. */
export const HEADING_DESCRIPTION = "text-sm text-foreground/60";

/** The room between a title and the line under it. */
export const HEADING_GAP = "gap-1";

/**
 * The room between a block's heading and its body: 24px, a step past the 16px between the rows in
 * the body (`gap-4`, #474). At 16px a card's heading drew exactly like the rows under it, the same
 * type at the same spacing, and read as one more row of them; the space round a group has to be
 * more than the space inside it (#512). `Section` spaces its heading and body with this.
 */
export const HEADING_BODY_GAP = "gap-6";

/**
 * {@link HEADING_BODY_GAP} as the padding under a heading whose body is a box of its own rather
 * than the next child of a column with a gap: a card's header over its `CardContent`, a dialog's
 * header over its scrolling body.
 */
export const HEADING_BODY_PAD = "pb-6";

/**
 * The text beside an action keeps 10rem, or the action goes under it: the one floor a block's or
 * a row's heading wraps on, as the text's basis in a row that wraps. A title that truncates can
 * give up more before it stops naming its block, so the floor is low.
 */
export const HEADING_WRAP_FLOOR = "min-w-0 flex-1 basis-40";

/**
 * The room between a wrapped action and the text it dropped under. While the action is beside the
 * text it is level with the title's top — `items-start` on the row, never centred on the text — so
 * a second line of description does not move it.
 */
export const HEADING_WRAP_GAP = "gap-y-2";

/** The room between two actions at the far end of a heading or a row. */
export const ACTION_GAP = "gap-2";

/** The same room between `icon-xs` buttons, which are small enough that 8px reads as a gap. */
export const ICON_ACTION_GAP = "gap-1";

/** An action's elements, with a fragment opened: what a caller passes as one or as several. */
function actionElements(slot: ReactNode): ReactElement[] {
  return Children.toArray(slot).flatMap((child) => {
    if (isValidElement<{ children?: ReactNode }>(child) === false) {
      return [];
    }
    return child.type === Fragment ? actionElements(child.props.children) : [child];
  });
}

/**
 * The gap an action slot's elements sit at: {@link ICON_ACTION_GAP} when every one of them is an
 * `icon-xs` control, and {@link ACTION_GAP} otherwise. Read off their `size` prop, so it is the
 * same on both halves: a device has no selector to ask what a row holds.
 *
 * @param slot - What the caller passed as the action.
 * @returns The gap class.
 */
export function actionGap(slot: ReactNode): string {
  const elements = actionElements(slot);
  const allIconXs =
    elements.length > 0 &&
    elements.every((element) => (element.props as { size?: unknown }).size === "icon-xs");
  return allIconXs ? ICON_ACTION_GAP : ACTION_GAP;
}

/**
 * Whether an `aria-invalid` value says the field is invalid. `"grammar"` and `"spelling"` are a
 * text checker's words, not a validator's, so they draw nothing.
 */
export function isInvalid(
  value: boolean | "true" | "false" | "grammar" | "spelling" | undefined,
): boolean {
  return value === true || value === "true";
}

/**
 * A button drawn as a field: the trigger of a combobox or a date picker, laid over
 * `Button variant="outline"`. It looks like a field, so it behaves like one: no hover fill, focus
 * turns its border `active` as an input's does, and a refused value turns it `negative`, with
 * focus still winning. It stays on `bg-background`, the surface the `/60` placeholder's contrast
 * is tested on.
 *
 * The refusal is read from the trigger's `aria-invalid` prop rather than an `aria-invalid:`
 * variant, which a device does not have, so the two halves draw it the same way.
 */
export function fieldTriggerClass(
  ariaInvalid: boolean | "true" | "false" | "grammar" | "spelling" | undefined,
): string {
  return cn(
    "bg-background font-normal hover:bg-background focus-visible:bg-background focus-visible:border-active",
    "disabled:cursor-not-allowed",
    isInvalid(ariaInvalid) && "border-negative focus-visible:border-active",
  );
}

/**
 * What a prop whose name ends in `Slot` takes: an element, several, or nothing.
 *
 * Not a string and not a number. React Native draws text only inside a `<Text>`, so a bare string
 * handed to a slot is a crash on device that the web never shows. A prop that takes words — a
 * `title`, a `description`, a `label` — has no `Slot` in its name, and the component puts the
 * `<Text>` around them itself. `false` is here so `saved && <Badge />` still reads.
 *
 * The type sees one level: text inside a fragment is past it.
 */
export type SlotNode = ReactElement | readonly SlotNode[] | false | null | undefined;

/**
 * Whether a slot holds anything to draw: the test every shell asks before it draws a slot's box,
 * a gap for it or the rule it stands in for (conventions rule 5).
 *
 * Not truthiness. `filters.map(…)` over no filters is `[]`, which is truthy and draws nothing, so
 * a header tested that way drew an empty row and dropped the rule under the title. An array is
 * present when anything in it is; `false`, `null`, `undefined`, `true` and `""` are what React
 * draws nothing for, and are absent.
 *
 * @param node - What the caller passed for the slot, or for a prop of words such as `status`.
 * @returns `true` when the slot has something in it.
 */
export function hasSlot(node: ReactNode): boolean {
  if (node === null || node === undefined || typeof node === "boolean" || node === "") {
    return false;
  }
  if (Array.isArray(node)) {
    return node.some(hasSlot);
  }
  return true;
}

/**
 * Whether the page this sits in is showing that it is still loading — `PageLayout`'s `loading`,
 * provided over its body. `LoadState` reads it and draws no placeholder rows of its own while it
 * is on, so a detail screen shows its wait once, as the title's bar, rather than a title bar with
 * a list's rows under it on a page that has no list. Here rather than in either item so neither
 * has to install the other.
 */
export const PageLoadingContext = createContext(false);

/**
 * Whether this is drawn in a card's body, `CardContent`, which `CardLayout` draws its body in.
 * `List` reads it and reaches its rows out into the card's padding by a row's own inset, so a
 * row's title starts where the card's title does and its rules run nearly edge to edge, rather
 * than the rows' text sitting 12px inside the card's. `Table` does the same by its cells' inset.
 * Here rather than in any one item so none has to install another.
 *
 * Every floating surface — a dialog, a popover, a menu, a select's list, a tooltip — sets it back
 * to `false` for what it holds. Context passes through a portal, so a dialog opened from a card's
 * body read `true`, and a list in it reached out past padding it did not have (#525). A
 * `DialogLayout` sets it `true` again over its body, because on that panel the card is the panel.
 */
export const CardBodyContext = createContext(false);

/** A handler cloned onto a child: one event of whatever kind its prop hands it, or none. */
type AddedHandler = (event: never) => void;

/**
 * The child with each handler in `added` run after the child's own handler of that name, rather
 * than swapped in for it. A native `asChild` trigger hands its child the press that opens or shuts
 * its sheet, and when that press replaced the child's own, `<PopoverClose asChild><Button
 * onPress={apply} /></PopoverClose>` shut the pane and never applied anything (#461). Radix's
 * `Slot` runs both on the web, and this is what makes a device do the same.
 *
 * @param child - The caller's element, cloned rather than wrapped.
 * @param added - The handlers to add, by prop name: `{ onPress: open }`.
 * @returns The clone, each named handler running the child's own first and then the added one.
 */
export function addHandlers<P>(
  child: ReactElement<P>,
  added: Record<string, AddedHandler>,
): ReactElement<P> {
  const own = child.props as Record<string, AddedHandler | undefined>;
  const chained: Record<string, AddedHandler> = {};
  for (const [name, handler] of Object.entries(added)) {
    chained[name] = (event) => {
      own[name]?.(event);
      handler(event);
    };
  }
  return cloneElement(child, chained as Partial<P>);
}

/** React Native's pressables, by the `displayName` react-native-web gives each. */
const PRESSABLE_NAMES = new Set([
  "Pressable",
  "TouchableOpacity",
  "TouchableHighlight",
  "TouchableWithoutFeedback",
]);

/** By a constant: the web build turns an `onPress` key into `onClick`, and this needs both. */
const ON_PRESS = "onPress";
type Handler = ((event: unknown) => void) | undefined;
type PressProps = { [ON_PRESS]?: Handler };
type MergedProps = { onClick?: Handler };

/**
 * Whether a trigger's child takes its press as `onPress`: a React Native pressable, or anything
 * already handed an `onPress`. A DOM element, or a component that is one, takes `onClick` and is
 * left alone, so nothing hands a `<span>` a prop it would warn about.
 */
function speaksPress(child: ReactElement): boolean {
  if (typeof child.type === "string") {
    return false;
  }
  if ((child.props as PressProps)[ON_PRESS] !== undefined) {
    return true;
  }
  const name = (child.type as { displayName?: string | undefined }).displayName;
  return name !== undefined && PRESSABLE_NAMES.has(name);
}

/**
 * Sits between radix's `Slot` and the child, takes what `Slot` merged in, and hands the merged
 * `onClick` on as `onPress` as well. Once per event: a `Button` calls both from the one press,
 * and a second toggle would shut what the first opened.
 */
function PressBridge({ children, onClick, ...merged }: MergedProps & { children: ReactElement }) {
  let last: unknown;
  const once = (event: unknown) => {
    if (event !== undefined && event === last) {
      return;
    }
    last = event;
    onClick?.(event);
  };
  const own = (children.props as PressProps)[ON_PRESS];
  return cloneElement(children, {
    ...merged,
    onClick: once,
    [ON_PRESS]: (event: unknown) => {
      own?.(event);
      once(event);
    },
  } as MergedProps & PressProps);
}

/**
 * A radix trigger's `asChild` child, ready for react-native-web. Radix opens a popover or dialog
 * from the `onClick` its `Slot` merges onto the child, and react-native-web's `Pressable` puts its
 * own `onClick` on the DOM and drops that one, so `<PopoverTrigger asChild><Pressable>` never
 * opened (#339). `Button` covers itself; this covers the rest. A child that does not speak
 * `onPress` is returned as it is, and so is everything in a DOM app.
 */
export function bridgePress(children: ReactNode): ReactNode {
  const bridged = isValidElement(children) && speaksPress(children);
  if (bridged === false) {
    return children;
  }
  return createElement(PressBridge, null, children);
}
