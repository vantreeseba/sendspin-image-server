import { type ClassValue, clsx } from "clsx";
import {
  cloneElement,
  createElement,
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
 * A field whose value was refused, on device: the web halves draw the same thing from the
 * `aria-invalid` attribute (`aria-invalid:border-negative`), which React Native has no variant
 * for. Focus still wins while the value is being fixed. Here rather than in one field's base so
 * Input, Textarea and Select share it without installing each other.
 */
export const FIELD_INVALID_CLASS = "border-negative focus:border-active";

/** Whether an `aria-invalid` value says the field is invalid. */
export function isInvalid(value: boolean | "true" | "false" | undefined): boolean {
  return value === true || value === "true";
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
