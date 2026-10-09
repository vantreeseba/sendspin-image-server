import { Children, createContext, isValidElement, type ReactNode, useContext } from "react";
import { IconClassContext } from "@/components/ui/icons-base";
import { cn, type SlotNode } from "@/lib/utils";
import { CircleAlert, Info, TriangleAlert } from "@/components/ui/icons";

/** The kinds of callout, which pick its tint, icon and role. */
export type AlertVariant = "default" | "info" | "warning" | "destructive";

export type AlertProps = {
  /**
   * What kind of notice it is, which sets the tint, the icon and the role. `destructive` is an
   * error the reader has to hear now and is announced as an `alert`; the others are a `status`.
   */
  variant?: AlertVariant | undefined;
  /**
   * Before the title. A bare `<RefreshCw />`; the alert sizes it and gives it the variant's ink.
   * Left out, the variant's own glyph is drawn — `Info`, `TriangleAlert` or `CircleAlert` — except
   * on `info`, which is a colour and draws nothing it was not given. `null` draws no icon at all,
   * and the text moves to the edge.
   */
  iconSlot?: SlotNode | undefined;
  /** What happened, in a few words: "API key generated", "Last error". */
  title?: ReactNode | undefined;
  /** The line under the title: what it means, or what to do about it. A link may sit inside it. */
  description?: ReactNode | undefined;
  /** The far end: one button that deals with it — "Change the embedder", "Retry". */
  actionSlot?: SlotNode | undefined;
  className?: string | undefined;
  /**
   * shadcn's compound form: `AlertTitle`, `AlertDescription`, and an icon. See the header for how
   * they are placed. The props are the form to write here; this is the form to port.
   */
  children?: ReactNode;
};

export type AlertTitleProps = { className?: string | undefined; children?: ReactNode };
export type AlertDescriptionProps = { className?: string | undefined; children?: ReactNode };

/** The variant, for the two parts to take their ink from. */
const AlertVariantContext = createContext<AlertVariant>("default");

/** The box: the tint and the border that names its colour, per variant. */
const ALERT_SURFACE = {
  default: "border border-foreground/10 bg-secondary",
  info: "border border-info/40 bg-info/10",
  warning: "border border-warning/40 bg-warning/10",
  destructive: "border border-negative/40 bg-negative/10",
} satisfies Record<AlertVariant, string>;

/** The icon's colour, and the only place the variant's hue reaches something drawn. */
const ALERT_ICON_INK = {
  default: "text-foreground",
  info: "text-info",
  warning: "text-warning",
  destructive: "text-negative",
} satisfies Record<AlertVariant, string>;

/** The line under the title. Muted only on the card, where muted is still 4.5:1. */
const ALERT_DESCRIPTION_INK = {
  default: "text-foreground/60",
  info: "text-foreground",
  warning: "text-foreground",
  destructive: "text-foreground",
} satisfies Record<AlertVariant, string>;

/**
 * The variant's own glyph, for when the caller passes no `iconSlot`. `info` has none: it is the
 * blue and nothing else, so the same alert can say "new" or "tip" without an ⓘ arguing with it.
 */
function defaultIcon(variant: AlertVariant): ReactNode {
  if (variant === "info") {
    return null;
  }
  if (variant === "destructive") {
    return <CircleAlert />;
  }
  if (variant === "warning") {
    return <TriangleAlert />;
  }
  return <Info />;
}

/** shadcn's `AlertTitle`: the title, for the compound form. */
export function AlertTitle({ className, children }: AlertTitleProps) {
  return (
    <span
      data-slot="alert-title"
      className={cn("cube-rn-text", "font-medium text-foreground text-sm", className)}
    >
      {children}
    </span>
  );
}

/** shadcn's `AlertDescription`: the line under the title, in the variant's ink. */
export function AlertDescription({ className, children }: AlertDescriptionProps) {
  const variant = useContext(AlertVariantContext);
  return (
    <span
      data-slot="alert-description"
      className={cn("cube-rn-text", "text-sm", ALERT_DESCRIPTION_INK[variant], className)}
    >
      {children}
    </span>
  );
}

/** Whether a child is one of the two text parts, which go into the column rather than the icon box. */
function isTextPart(child: ReactNode): boolean {
  return isValidElement(child) && (child.type === AlertTitle || child.type === AlertDescription);
}

/** A callout: a tinted box with an icon, a title, a description and an optional action. */
export function Alert({
  variant = "default",
  iconSlot,
  title,
  description,
  actionSlot,
  className,
  children,
}: AlertProps) {
  // A bare string is the description, wrapped so native never puts text straight into a `View`.
  const parts = Children.toArray(children).map((child) =>
    typeof child === "string" || typeof child === "number" ? (
      <AlertDescription key={String(child)}>{child}</AlertDescription>
    ) : (
      child
    ),
  );
  const textParts = parts.filter(isTextPart);
  const iconParts = parts.filter((child) => isTextPart(child) === false);
  const ownIcon = parts.length > 0 ? null : defaultIcon(variant);
  const glyph = iconSlot !== undefined ? iconSlot : ownIcon;
  const ink = ALERT_ICON_INK[variant];

  return (
    <div
      data-slot="alert"
      role={variant === "destructive" ? "alert" : "status"}
      className={cn(
        "cube-rn-view",
        "w-full min-w-0 flex-row items-start gap-3 rounded-lg px-4 py-3",
        ALERT_SURFACE[variant],
        className,
      )}
    >
      {glyph || iconParts.length > 0 ? (
        <div
          data-slot="alert-icon"
          aria-hidden
          className={cn(
            "cube-rn-view",
            "mt-0.5 shrink-0 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
            ink,
          )}
        >
          <IconClassContext.Provider value={cn("size-4 shrink-0", ink)}>
            {glyph}
            {iconParts}
          </IconClassContext.Provider>
        </div>
      ) : null}
      <div className="cube-rn-view min-w-0 flex-1 gap-1">
        <AlertVariantContext.Provider value={variant}>
          {title ? <AlertTitle>{title}</AlertTitle> : null}
          {description ? <AlertDescription>{description}</AlertDescription> : null}
          {textParts}
        </AlertVariantContext.Provider>
      </div>
      {actionSlot ? (
        <div data-slot="alert-action" className="cube-rn-view shrink-0 self-center">
          {actionSlot}
        </div>
      ) : null}
    </div>
  );
}
