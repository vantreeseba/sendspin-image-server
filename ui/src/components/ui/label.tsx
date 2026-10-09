import { Label as LabelPrimitive } from "radix-ui";
import type { ComponentPropsWithRef } from "react";
import { LABEL_CLASS } from "@/components/ui/label-base";
import { cn } from "@/lib/utils";

type LabelProps = Omit<ComponentPropsWithRef<typeof LabelPrimitive.Root>, "className"> & {
  className?: string | undefined;
};

/** The caption that names a control. */
function Label({ className, ...props }: LabelProps) {
  return (
    <LabelPrimitive.Root data-slot="label" {...props} className={cn(LABEL_CLASS, className)} />
  );
}

export { Label };
