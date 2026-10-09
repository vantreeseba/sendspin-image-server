import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

// `className` is re-declared rather than inherited — see `card.tsx`: nativewind types it as
// `className?: string`, which under `exactOptionalPropertyTypes` rejects `cond ? "x" : undefined`.
//
// `id` rides in both: `ui/form.tsx` wires `aria-describedby` from the control to the description
// and the error, so both need to carry one. React Native takes `id` as a cross-platform prop.
type ViewProps = Omit<React.ComponentPropsWithoutRef<"div">, "className"> & {
  className?: string | undefined;
};
type TextProps = Omit<React.ComponentPropsWithoutRef<"span">, "className"> & {
  className?: string | undefined;
};

/**
 * A set of fields under one legend. A `<fieldset>` on the web, which is its own group to
 * assistive technology; a `View` with the group role on device.
 */
function FieldSet({ className, ...props }: ViewProps) {
  return (
    <fieldset
      data-slot="field-set"
      className={cn("cube-rn-view", "w-full flex-col gap-6", className)}
      {...(props as React.ComponentPropsWithoutRef<"fieldset">)}
    />
  );
}

/**
 * The set's name. `variant="label"` sizes it as a field label rather than a heading, for a set
 * that is one question — a radio group — rather than a section of the form.
 */
function FieldLegend({
  className,
  variant = "legend",
  ...props
}: TextProps & { variant?: "legend" | "label" | undefined }) {
  return (
    <legend
      data-slot="field-legend"
      className={cn(
        "cube-rn-text",
        "mb-3 font-medium text-foreground",
        variant === "legend" ? "text-base" : "text-sm",
        className,
      )}
      {...(props as React.ComponentPropsWithoutRef<"legend">)}
    />
  );
}

/**
 * Fields stacked. On the web it is also the container `orientation="responsive"` measures, which
 * is a container query and has no device counterpart.
 */
function FieldGroup({ className, ...props }: ViewProps) {
  return (
    <div
      data-slot="field-group"
      className={cn("cube-rn-view", "w-full flex-col gap-4", "@container/field-group", className)}
      {...(props as React.ComponentPropsWithoutRef<"div">)}
    />
  );
}

const fieldVariants = cva("w-full gap-2", {
  variants: {
    orientation: {
      vertical: "flex-col",
      horizontal: "flex-row items-center",
      // Side by side once the enclosing `FieldGroup` is wide enough, stacked below that. A phone
      // is never that wide, and has no container queries to ask with, so it stacks.
      responsive: "flex-col @md/field-group:flex-row @md/field-group:items-center",
    },
  },
  defaultVariants: { orientation: "vertical" },
});

/** One field's column: its label, control, description and error. */
function Field({
  className,
  orientation = "vertical",
  ...props
}: ViewProps & VariantProps<typeof fieldVariants>) {
  return (
    // The `role` is hand-written because a `<fieldset>` has no native counterpart.
    <div
      role="group"
      data-slot="field"
      className={cn("cube-rn-view", fieldVariants({ orientation }), className)}
      {...(props as React.ComponentPropsWithoutRef<"div">)}
    />
  );
}

/** The label that names the field's control. */
function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  // `data-slot` rather than `testID`: `Label`'s shared contract has no `testID`, the native half
  // ignores an attribute it does not know, and the web half spreads it over its own `label`.
  return <Label data-slot="field-label" className={className} {...props} />;
}

/** The muted help text for the field. */
function FieldDescription({ className, ...props }: TextProps) {
  return (
    <span
      data-slot="field-description"
      className={cn("cube-rn-text", "text-foreground/60 text-sm", className)}
      {...(props as React.ComponentPropsWithoutRef<"span">)}
    />
  );
}

/**
 * What a validator returns, as shadcn's `FieldError` takes it — a TanStack or react-hook-form
 * error object — plus the bare string a hand-rolled validator returns.
 */
type FieldErrorEntry = { message?: string | undefined } | string | null | undefined;

/**
 * The error under a field: its `children`, or else the distinct messages in `errors` — one as a
 * line, several as a list. Nothing at all when there is neither, so it can be rendered
 * unconditionally.
 */
function FieldError({
  className,
  children,
  errors,
  ...props
}: TextProps & { errors?: readonly FieldErrorEntry[] | undefined }) {
  const classes = cn("text-negative text-sm font-medium", className);
  const messages = [
    ...new Set(
      (errors ?? [])
        .map((error) => (typeof error === "string" ? error : error?.message))
        .filter((message): message is string => Boolean(message)),
    ),
  ];
  const content = children || (messages.length === 1 ? messages[0] : null);
  if (content) {
    return (
      <span
        role="alert"
        data-slot="field-error"
        className={cn("cube-rn-text", classes)}
        {...(props as React.ComponentPropsWithoutRef<"span">)}
      >
        {content}
      </span>
    );
  }
  if (messages.length === 0) {
    return null;
  }
  return (
    <div role="alert" data-slot="field-error" id={props.id} className="cube-rn-view gap-1">
      <ul className="cube-rn-view gap-1">
        {messages.map((message) => (
          <li key={message} className="cube-rn-view flex-row gap-2">
            <span className={cn("cube-rn-text", classes)}>•</span>
            <span className={cn("cube-rn-text", classes)}>{message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The label column of a horizontal field: label, description and error stacked
 * beside the control rather than under it, so a description's second line starts
 * under the label and not under the checkbox.
 */
function FieldContent({ className, ...props }: ViewProps) {
  return (
    <div
      data-slot="field-content"
      className={cn("cube-rn-view", "min-w-0 flex-1 flex-col gap-1.5", className)}
      {...(props as React.ComponentPropsWithoutRef<"div">)}
    />
  );
}

/**
 * A field's name where a `<label>` would be wrong — a radio group or a checkbox
 * set, where the name belongs to the group and each control has its own label.
 * Same type as `FieldLabel`, no `htmlFor`: the group is named by
 * `aria-labelledby` pointing at this `id`.
 */
function FieldTitle({ className, ...props }: TextProps) {
  // `field-label`, as shadcn's does: it is the label of its group, and styled as one.
  return (
    <span
      data-slot="field-label"
      className={cn("cube-rn-text", "text-foreground text-sm font-medium", className)}
      {...(props as React.ComponentPropsWithoutRef<"span">)}
    />
  );
}

/**
 * A rule between fields, with an optional word on it — "or", between two ways to sign in.
 */
function FieldSeparator({ className, children, ...props }: ViewProps) {
  return (
    <div
      data-slot="field-separator"
      className={cn("cube-rn-view", "relative h-5 w-full justify-center", className)}
      {...(props as React.ComponentPropsWithoutRef<"div">)}
    >
      <div className="cube-rn-view absolute inset-x-0 top-1/2 h-px bg-foreground/10" />
      {children ? (
        <div data-slot="field-separator-content" className="cube-rn-view items-center">
          <span className="cube-rn-text bg-background px-2 text-foreground/60 text-sm">
            {children}
          </span>
        </div>
      ) : null}
    </div>
  );
}

export {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
};
