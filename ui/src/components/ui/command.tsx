import { Command as CommandPrimitive } from "cmdk";
import type * as React from "react";
import { COMMAND_DIALOG_DESCRIPTION, COMMAND_DIALOG_TITLE } from "@/components/ui/command-base";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search } from "@/components/ui/icons";

/** The root of a filtered list: it holds the search text and decides which items match. */
function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        "flex h-full w-full flex-col overflow-hidden rounded-md bg-secondary text-foreground",
        className,
      )}
      {...props}
    />
  );
}

/** A `Command` inside a dialog: a command palette. */
function CommandDialog({
  title = COMMAND_DIALOG_TITLE,
  description = COMMAND_DIALOG_DESCRIPTION,
  children,
  className,
  showCloseButton = true,
  label,
  filter,
  shouldFilter,
  ...props
}: React.ComponentProps<typeof Dialog> &
  Pick<React.ComponentProps<typeof CommandPrimitive>, "label" | "filter" | "shouldFilter"> & {
    title?: string;
    description?: string;
    className?: string;
    showCloseButton?: boolean;
  }) {
  return (
    <Dialog {...props}>
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogContent
        className={cn("overflow-hidden p-0", className)}
        showCloseButton={showCloseButton}
      >
        {/* The list's own props reach it, so a palette over a list the server already matched
            can turn the filter off without giving up the dialog. */}
        <Command
          {...(label === undefined ? {} : { label })}
          {...(filter === undefined ? {} : { filter })}
          {...(shouldFilter === undefined ? {} : { shouldFilter })}
          className="**:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-foreground/60 [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5"
        >
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The search box that filters the list: a row across the top of the `Command`, ruled off from
 * the list under it. It is not a field with a border of its own, so it reads right only when the
 * `Command` is the surface — in a popover, in `CommandDialog`, or on its own `bg-secondary`.
 */
function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    // The input fills the row rather than carrying a height of its own. shadcn's `h-10` input in
    // an `h-9` row stood 4px proud of it, so the rule under the row cut across the box. The rule
    // names its colour because an Expo web app runs this file too, and nothing there sets one.
    <div
      data-slot="command-input-wrapper"
      className="flex h-9 items-center gap-2 border-b border-foreground/10 px-3"
    >
      <Search className="size-4 shrink-0 text-foreground/60" />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          "flex h-full w-full rounded-md bg-transparent text-sm outline-hidden placeholder:text-foreground/60 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    </div>
  );
}

/** The scrolling list of groups and items. */
function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn("max-h-72 scroll-py-1 overflow-x-hidden overflow-y-auto", className)}
      {...props}
    />
  );
}

/** What is shown when no item matches the search. */
function CommandEmpty({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className={cn("py-6 text-center text-sm", className)}
      {...props}
    />
  );
}

/** A set of items under a heading, hidden when none of them matches. */
function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-foreground/60",
        className,
      )}
      {...props}
    />
  );
}

/** A rule between groups. */
function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    // Decorative: cmdk writes `role="separator"`, which a `listbox` may not hold. Hidden, the
    // rule is still drawn and no longer read. See `command-base.ts`.
    <CommandPrimitive.Separator
      aria-hidden
      data-slot="command-separator"
      className={cn("-mx-1 h-px bg-foreground/10", className)}
      {...props}
    />
  );
}

/** One row that can be chosen, filtered by its `value` and its text. */
function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-hover data-[selected=true]:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-foreground/60",
        className,
      )}
      {...props}
    />
  );
}

/** The keyboard shortcut shown at the far end of an item. */
function CommandShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn("ml-auto text-xs tracking-widest text-foreground/60", className)}
      {...props}
    />
  );
}

export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
};
