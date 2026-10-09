import type { ReactNode } from "react";
import type { SlotNode } from "@/lib/utils";

export type TabsProps = {
  /** The active tab, when the caller owns it. */
  value?: string | undefined;
  /** Called with the tab the user picked. */
  onValueChange?: ((value: string) => void) | undefined;
  /** The tab active at mount, when uncontrolled. */
  defaultValue?: string | undefined;
  className?: string | undefined;
  children: ReactNode;
};

export type TabsListProps = {
  /**
   * The tablist's name, read on entering it: "Project view, tab list". Give one
   * whenever no visible heading names the tabs — ARIA's tabs pattern asks for it.
   */
  "aria-label"?: string | undefined;
  /** The id of a visible heading that names the tablist, in place of `aria-label`. */
  "aria-labelledby"?: string | undefined;
  /**
   * On the list's box. A list wider than the space it is given scrolls sideways, and brings the
   * selected tab into view, so a row of seven tabs needs nothing here to fit a phone.
   */
  className?: string | undefined;
  children: ReactNode;
};

export type TabsTriggerProps = {
  value: string;
  /** Not selectable, and dimmed. */
  disabled?: boolean | undefined;
  className?: string | undefined;
  /**
   * The label, and optionally an icon beside it: `<Clock /> Recent`. The icon
   * takes the tab's active or inactive colour on both halves.
   */
  children: ReactNode;
  /**
   * The far end of the tab, after its label: a dot for unsaved changes or a server in error, a
   * count. What it says is part of the tab's name, so a dot is `<Badge variant="warning"
   * label="Unsaved changes" />`, which is read as "Device, Unsaved changes", and not a bare
   * coloured view, which is read as nothing.
   */
  trailingSlot?: SlotNode | undefined;
};

export type TabsContentProps = {
  value: string;
  className?: string | undefined;
  children: ReactNode;
};

/**
 * The list's box. How its tabs are centred is each half's own: a list too narrow for its tabs
 * scrolls sideways, and the two platforms centre a row that can overflow differently.
 */
export const TABS_LIST_CLASS =
  "h-10 items-center rounded-md border border-foreground/15 bg-background p-1";
/** The list's own `p-1`, kept clear of a tab brought into view so it does not sit on the border. */
export const TABS_LIST_INSET = 4;
/** A row, so an icon sits beside the label. `gap-1.5` is shadcn's own. */
export const TABS_TRIGGER_CLASS =
  "flex-row items-center justify-center gap-1.5 rounded-sm px-3 py-1.5";
/** The type of a tab's label. */
export const TABS_TRIGGER_TEXT_CLASS = "text-sm font-medium";
