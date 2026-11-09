import { Tabs as TabsPrimitive } from "radix-ui";
import * as React from "react";
import { useEffect, useRef } from "react";
import {
  TABS_LIST_CLASS,
  TABS_LIST_INSET,
  TABS_TRIGGER_CLASS,
  TABS_TRIGGER_TEXT_CLASS,
  type TabsContentProps,
  type TabsListProps,
  type TabsProps,
  type TabsTriggerProps,
} from "@/components/ui/tabs-base";
import { cn, FOCUS_EDGE } from "@/lib/utils";

/** The shared contract, widened to what the radix part underneath accepts. */
type Wide<Base, Radix> = Base & Omit<Radix, keyof Base>;

/** The root of a set of tabs: it holds which one is active. */
function Tabs({
  value,
  onValueChange,
  defaultValue,
  className,
  ...props
}: Wide<TabsProps, React.ComponentProps<typeof TabsPrimitive.Root>>) {
  // Spread only when given, so an absent `value` leaves radix uncontrolled.
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn(className)}
      {...props}
      {...(value === undefined ? {} : { value })}
      {...(onValueChange === undefined ? {} : { onValueChange })}
      {...(defaultValue === undefined ? {} : { defaultValue })}
    />
  );
}

/**
 * Scrolls the list so its selected tab is inside it.
 *
 * Not `scrollIntoView`, which also moves every scroller above the list: a page opened on its last
 * tab would jump down to its tabs.
 */
function reveal(list: HTMLElement) {
  const tab = list.querySelector('[role="tab"][data-state="active"]');
  if (!tab) {
    return;
  }
  const box = list.getBoundingClientRect();
  const span = tab.getBoundingClientRect();
  if (span.left < box.left) {
    list.scrollLeft -= box.left - span.left + TABS_LIST_INSET;
  } else if (span.right > box.right) {
    list.scrollLeft += span.right - box.right + TABS_LIST_INSET;
  }
}

/** The row of tab buttons. */
function TabsList({
  className,
  ref,
  ...props
}: Wide<TabsListProps, React.ComponentProps<typeof TabsPrimitive.List>>) {
  const list = useRef<HTMLDivElement | null>(null);

  // Radix owns which tab is selected and says so only in `data-state`, so that attribute is what
  // is watched: it covers a click, an arrow key, the caller's `value` and a `defaultValue` alike.
  useEffect(() => {
    const node = list.current;
    if (!node) {
      return;
    }
    reveal(node);
    const observer = new MutationObserver(() => reveal(node));
    observer.observe(node, { attributes: true, attributeFilter: ["data-state"], subtree: true });
    return () => observer.disconnect();
  }, []);

  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      ref={(node) => {
        list.current = node;
        if (typeof ref === "function") {
          return ref(node);
        }
        if (ref) {
          ref.current = node;
        }
      }}
      // `justify-center-safe`: plain centring puts the first tabs of a row that overflows past
      // the start, where no scrolling reaches them. The scrollbar is hidden because the row is
      // one tab tall and the tabs themselves, by arrow key or by drag, are how it moves.
      className={cn(
        "inline-flex max-w-full justify-center-safe overflow-x-auto overflow-y-hidden text-foreground/60 [scrollbar-width:none]",
        TABS_LIST_CLASS,
        className,
      )}
      {...props}
    />
  );
}

/** One tab's button, which shows the pane with the same `value`. */
function TabsTrigger({
  className,
  disabled,
  children,
  trailingSlot,
  linkSlot,
  ...props
}: Wide<TabsTriggerProps, React.ComponentProps<typeof TabsPrimitive.Trigger>>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      {...(disabled === undefined ? {} : { disabled })}
      // A link is the tab itself: radix merges the tab's role, state and keys onto it. `type` is
      // a button's, and on an `<a>` would only be a stray attribute.
      {...(linkSlot === undefined ? {} : { asChild: true, type: undefined })}
      // An icon child takes the trigger's colour through `currentColor`, so only
      // its size is set here; device has no inheritance and uses a context.
      className={cn(
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "inline-flex shrink-0 whitespace-nowrap transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 text-foreground/60 hover:bg-hover hover:text-foreground data-[state=inactive]:focus-visible:bg-hover data-[state=inactive]:focus-visible:text-foreground data-[state=active]:bg-active/40 data-[state=active]:text-foreground data-[state=active]:hover:bg-active/60 data-[state=active]:focus-visible:bg-active/60",
        TABS_TRIGGER_CLASS,
        TABS_TRIGGER_TEXT_CLASS,
        className,
      )}
      {...props}
    >
      {linkSlot === undefined ? (
        <>
          {children}
          {trailingSlot}
        </>
      ) : (
        React.cloneElement(linkSlot, undefined, children, trailingSlot)
      )}
    </TabsPrimitive.Trigger>
  );
}

/** One tab's pane, rendered while its tab is active. */
function TabsContent({
  className,
  ...props
}: Wide<TabsContentProps, React.ComponentProps<typeof TabsPrimitive.Content>>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      // radix makes the pane a tab stop and nothing in it looks hovered, so it shows focus as a
      // scroll box does: its edge turns `active`. A border, not the inset line, which a card
      // filling the pane would cover.
      className={cn("mt-2 rounded-md", FOCUS_EDGE, className)}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
