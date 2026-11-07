import { Tooltip as TooltipPrimitive } from "radix-ui";
import type * as React from "react";
import { createContext, useContext } from "react";
import {
  TOOLTIP_CONTENT_CLASS,
  TOOLTIP_TEXT_CLASS,
  type TooltipContentProps,
  type TooltipProps,
  type TooltipProviderProps,
  type TooltipTriggerProps,
} from "@/components/ui/tooltip-base";
import { cn } from "@/lib/utils";

/** The shared contract, widened to what the radix part underneath accepts. */
type Wide<Base, Radix> = Base & Omit<Radix, keyof Base>;

/** Whether a `TooltipProvider` is above. Radix throws without one and has no way to ask. */
const ProvidedContext = createContext(false);

// `delayDuration` defaults to shadcn's `0`, not Radix's 700ms. A tooltip with no provider above
// renders this one, and left to Radix every icon button waited 700ms.
/** Shares the open delay among the tooltips below it. */
function TooltipProvider({
  delayDuration = 0,
  skipDelayDuration,
  ...props
}: Wide<TooltipProviderProps, React.ComponentProps<typeof TooltipPrimitive.Provider>>) {
  return (
    <ProvidedContext.Provider value={true}>
      <TooltipPrimitive.Provider
        {...props}
        delayDuration={delayDuration}
        {...(skipDelayDuration === undefined ? {} : { skipDelayDuration })}
      />
    </ProvidedContext.Provider>
  );
}

/**
 * The root of a tooltip: it holds the open state.
 *
 * It uses the `TooltipProvider` above it, and its timing, when there is one. With none it renders
 * its own, so an installed component can draw a tooltip without the app having set one up.
 */
function Tooltip(props: Wide<TooltipProps, React.ComponentProps<typeof TooltipPrimitive.Root>>) {
  const provided = useContext(ProvidedContext);
  const root = <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
  if (provided) {
    return root;
  }
  return <TooltipProvider>{root}</TooltipProvider>;
}

/** The element the tooltip describes: hovered or focused on the web, long-pressed on device. */
function TooltipTrigger({
  asChild,
  className,
  ...props
}: Wide<TooltipTriggerProps, React.ComponentProps<typeof TooltipPrimitive.Trigger>>) {
  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      asChild={asChild ?? false}
      {...(className === undefined ? {} : { className })}
      {...props}
    />
  );
}

/** The tooltip's bubble and its text. */
function TooltipContent({
  side = "top",
  sideOffset = 4,
  className,
  children,
  ...props
}: Wide<TooltipContentProps, React.ComponentProps<typeof TooltipPrimitive.Content>>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        side={side}
        sideOffset={sideOffset}
        className={cn(
          "z-50 animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          TOOLTIP_CONTENT_CLASS,
          TOOLTIP_TEXT_CLASS,
          className,
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
