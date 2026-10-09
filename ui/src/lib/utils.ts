import { type ClassValue, clsx } from "clsx";
import type { ReactElement } from "react";
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
