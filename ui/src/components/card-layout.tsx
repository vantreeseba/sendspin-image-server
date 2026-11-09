import type { ReactNode } from "react";
import { Children, createContext, isValidElement, useContext } from "react";
import {
  actionGap,
  cn,
  HEADING_BODY_PAD,
  HEADING_GAP,
  HEADING_WRAP_FLOOR,
  HEADING_WRAP_GAP,
  hasSlot,
  type SlotNode,
} from "@/lib/utils";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { DescribedTitle, type DescriptionPlacement, foldsDescription } from "@/components/ui/description-hint";
import { hasRows, List } from "@/components/list";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The parts a floating panel draws a card with, handed down by the panel that already draws the
 * surface: the border, the fill, the shadow and the inset. `DialogLayout` hands its own, so the
 * title is the `DialogTitle` that names the dialog, the description the `DialogDescription` that
 * describes it, the body the one part that scrolls, and the footer the one that stacks below `sm`.
 * The panel owns those parts, so a card installed without a dialog carries none of them.
 */
export type FloatingSurface = {
  /** The title, as the element that names the panel. */
  drawTitle: (title: ReactNode, className: string | undefined) => SlotNode;
  /** The description, as the element that describes the panel. */
  drawDescription: (description: ReactNode) => SlotNode;
  /**
   * The description while `descriptionPlacement="popover"` folds it: off the screen, and still
   * what describes the panel, so a dialog is announced with it when it opens. Present, it takes
   * the place of the hidden copy a card draws; absent, the card draws that copy as on the page.
   * Optional, so a `card-layout` and a `dialog-layout` installed at different times still agree.
   */
  drawFoldedDescription?: ((description: ReactNode) => SlotNode) | undefined;
  /** The card's header, body and footer, placed on the panel. */
  drawParts: (parts: FloatingCardParts) => SlotNode;
};

/** What a card hands its floating panel to place. */
export type FloatingCardParts = {
  /** The heading row, or nothing. */
  headerSlot: SlotNode;
  /** The body: the content, its empty state or its skeleton. */
  contentSlot: SlotNode;
  contentClassName: string | undefined;
  /** The footer's rows, or nothing. The panel draws the footer around them. */
  footerSlot: SlotNode;
  footerClassName: string | undefined;
  /** The caller's `wrapperSlot`, for the panel to wrap its parts in. */
  wrapperSlot: CardLayoutProps["wrapperSlot"];
};

/**
 * The floating panel the `CardLayout` directly inside is drawn on, or `null` on the page.
 * `DialogLayout` sets it, and the card then draws no `Card` of its own: it hands its parts to the
 * panel instead. The card sets it back to `null` for what it holds, so a card in a dialog's body
 * is a card again.
 *
 * A context rather than a prop, so `CardLayout` takes no prop that only one caller may pass. It
 * is the first answer to "what surface am I on?"; a surface-level context covering the page, a
 * raised card and a floating panel would take its place.
 */
export const FloatingSurfaceContext = createContext<FloatingSurface | null>(null);

/**
 * What a heading row does with its action when the title and the action do not both fit on one
 * line: move the action under the title, or keep it beside the title and cut the title short.
 */
export type ActionPlacement = "wrap" | "inline";

export type CardLayoutProps = {
  /** The body. */
  contentSlot?: SlotNode | undefined;
  /**
   * A string, a heading, whatever names the card. Absent, no header row is drawn. On device it is
   * rendered inside a `Text`, so pass text or inline text nodes.
   */
  title?: ReactNode | undefined;
  /**
   * Which heading the title is, `1 | 2 | 3` — 3 by default, a card under a page title. A card that
   * *is* the page (a sign-in, a token gate, a lone settings panel) passes `1`, so the page has an
   * `<h1>`. The title is the same size at every level: pick the rank by where it sits.
   */
  level?: 1 | 2 | 3 | undefined;
  /** One line on what the card holds, or what changing it costs. */
  description?: ReactNode | undefined;
  /**
   * Where the description is drawn. `inline` (the default) puts it under the title; `popover`
   * puts it behind a small button after the title, named "About <title>", and on the web a screen
   * reader still reads it under the title. It stays inline on a card with no title, which has nothing to put
   * the button beside, and on a card with no body and no footer, where the description is all
   * the card says.
   */
  descriptionPlacement?: DescriptionPlacement | undefined;
  /** The `popover` button's glyph. A question mark by default. */
  descriptionIconSlot?: SlotNode | undefined;
  /**
   * Sits before the title. On the web it is sized to the text — pass a bare `<Plus />`. On device
   * an icon cannot be sized from outside it, so pass it at the size you want.
   */
  iconSlot?: SlotNode | undefined;
  /** The header's far end: an add button, a menu, a switch. */
  actionSlot?: SlotNode | undefined;
  /**
   * Where the action goes when the title and the action do not both fit on one line. `wrap` (the
   * default) moves the action under the title once the title would have less than 10rem, so the
   * whole title stays readable. `inline` keeps the action beside the title on every width and
   * cuts the title short with an ellipsis instead: for a narrow card whose action belongs on the
   * title's line, such as a switch that turns the card's subject on.
   */
  actionPlacement?: ActionPlacement | undefined;
  /**
   * Shown instead of `contentSlot` when there is nothing in it: no element (`[]`, `null`, `false`),
   * or a `List` with no rows. A body of any other element is drawn as it is, even one that turns
   * out to render nothing — pass `emptySlot` the case, or decide it yourself.
   */
  emptySlot?: SlotNode | undefined;
  /**
   * Whether the body is still being fetched. On, a skeleton stands in for it and `emptySlot` is not
   * consulted — data that has not arrived is not data that came back empty, and a card that says
   * "no members yet" for half a second before showing four of them is worse than one that waits.
   *
   * A caller wanting its own placeholder passes it as `contentSlot` and leaves this off.
   */
  loading?: boolean | undefined;
  /**
   * The footer's start. A timestamp, a note, a destructive action held away from the rest. Words
   * come in a `<Text>` of the caller's, as in every slot.
   *
   * Several elements — a fragment, an array — sit together in one row with a small gap, and wrap
   * on a narrow card; `footerActionsSlot` stays at the far end. There is no row of your own to add.
   */
  footerSlot?: SlotNode | undefined;
  /** The footer's end. The buttons. Given alone, the footer is simply right-aligned. */
  footerActionsSlot?: SlotNode | undefined;
  /**
   * Wraps the header, the body and the footer together, inside the card. Its use is a form: with
   * the fields and the submit button under one `<form>`, Enter in a field submits it and the
   * footer's submit button is a real one, where a `<form>` around the body alone leaves the button
   * outside it.
   *
   * A function, called rather than mounted, so the fields keep their state across renders. The
   * element it returns takes `className`, which keeps the parts laid out as the card lays them.
   *
   * ```tsx
   * wrapperSlot={(parts, { className }) => (
   *   <FormElement onSubmit={() => form.handleSubmit()} className={className}>
   *     {parts}
   *   </FormElement>
   * )}
   * ```
   */
  wrapperSlot?: ((parts: SlotNode, wrapper: { className: string }) => SlotNode) | undefined;
  /** On the card itself, the bordered box around every part. */
  className?: string | undefined;
  /**
   * On the header: the icon, the title and description, and the action beside them. Over a body
   * it has 24px under it, past the body's 16px between rows; `pb-4` here closes that up.
   */
  headerClassName?: string | undefined;
  /** On the title itself: its size, a `line-through`. */
  titleClassName?: string | undefined;
  /**
   * On the body, the box that holds `contentSlot`. It is a column with `gap-4` between what it
   * holds, as `Section`'s is; a gap here replaces it, and `gap-0` lets the children touch.
   */
  contentClassName?: string | undefined;
  /** On the footer: `footerSlot` at its start and `footerActionsSlot` at its end. */
  footerClassName?: string | undefined;
};

/** Sized from outside on the web; see the file comment for the device. */
const ICON = "[&_svg]:size-4";

/**
 * The heading row: the title and description in one column, the action after it. `CardLayout`,
 * its floating form in a dialog and `Section` all draw this one row.
 *
 * The action used to be `CardAction`, which is absolute and so reserves no width — right for the
 * badge or lone button it was written for, and wrong for anything wider, because a long title ran
 * on underneath it. `CardAction` cannot be given a place in the flow instead: `CardHeader` is a
 * column whose children are the title and the description, as shadcn's is, and Yoga has no grid
 * to put a third child beside them. So the shell that owns this header's children lays them out,
 * and the primitive stays as it is for a card composed by hand.
 *
 * `items-start` keeps the action in the corner `CardAction` held: level with the top of the
 * title, at the far end, as the heading rhythm puts every action (`HEADING_WRAP_GAP` and the rest,
 * in `@/lib/utils`). Its description runs beside the action, not under it: under it, a button
 * taller than the title's line would push the description off the title by the difference, and
 * the 4px between a title and its line is the rhythm's.
 */
const HEADING_ROW = cn("min-w-0 flex-row items-start gap-x-4", HEADING_WRAP_GAP);

/** Whether the row wraps, by `actionPlacement`: `inline` holds the action on the title's line. */
const ROW_WRAP = { wrap: "flex-wrap", inline: "flex-nowrap" } as const;

/**
 * The heading's text: the rhythm's wrap floor, which the title keeps beside the action or the
 * action goes under it, and the rhythm's gap between the title and its description. The lower
 * the floor, the narrower the block in which a single button still sits where it always did. A
 * row that does not wrap shrinks the text past the floor instead.
 */
const HEADING_TEXT = cn(HEADING_WRAP_FLOOR, HEADING_GAP);

/**
 * A title held to one line, for a row whose action stays beside it. `truncate` is the ellipsis on
 * the web; on device it is `numberOfLines`, which is what `line-clamp-1` becomes and what
 * `truncate` does not. `min-w-0 shrink` let it give way inside the icon's row as well.
 */
const ONE_LINE_TITLE = cn("min-w-0 shrink", "truncate");

/**
 * The heading's action, never shrunk and never wider than the row: on a line of its own, a
 * fragment of controls wraps on this row instead of running out of the block. Its gap is
 * `actionGap`'s, by what the controls are.
 */
const HEADING_ACTION = cn(
  "max-w-full shrink-0 flex-row flex-wrap items-center",
  // The caller's own wrapping row, in a browser: a flex item there is as wide as its content and
  // a react-native-web view does not shrink, so without this it runs out of the block. Yoga
  // measures a child against its parent's width, and NativeWind has no child selector anyway.
  "[&>*]:max-w-full",
);

export type HeadingRowProps = {
  /** The title and description: a `DescribedTitle`. Absent, the action is pushed to the far end. */
  textSlot?: SlotNode | undefined;
  /** The row's far end: an add button, a menu, a switch. */
  actionSlot?: SlotNode | undefined;
  /**
   * `wrap` (the default) moves the action under the text when both do not fit; `inline` keeps it
   * beside the text, which shrinks. The shell holds its own title to one line for `inline`.
   */
  actionPlacement?: ActionPlacement | undefined;
  /** The row's `testID` / `data-slot`. */
  "data-slot"?: string | undefined;
  /** The action's `testID` / `data-slot`. */
  actionTestID?: string | undefined;
  className?: string | undefined;
  textClassName?: string | undefined;
};

/**
 * The heading row a block draws over its body: its text at the start and its action at the far
 * end, with the action dropping under the text when both do not fit, unless it is `inline`.
 */
export function HeadingRow({
  textSlot,
  actionSlot,
  actionPlacement = "wrap",
  "data-slot": testID,
  actionTestID,
  className,
  textClassName,
}: HeadingRowProps) {
  return (
    <div
      data-slot={testID}
      // With no text there is no column to push the action along, so the row does it.
      className={cn(
        "cube-rn-view",
        HEADING_ROW,
        ROW_WRAP[actionPlacement],
        hasSlot(textSlot) ? undefined : "justify-end",
        className,
      )}
    >
      {hasSlot(textSlot) ? (
        <div
          className={cn(
            "cube-rn-view",
            HEADING_TEXT,
            actionPlacement === "inline" && "shrink",
            textClassName,
          )}
        >
          {textSlot}
        </div>
      ) : null}
      {hasSlot(actionSlot) ? (
        <div
          data-slot={actionTestID}
          className={cn("cube-rn-view", HEADING_ACTION, actionGap(actionSlot))}
        >
          {actionSlot}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The `footerActionsSlot` row. It shrinks to the footer and wraps rather than holding its buttons
 * on one line: a view does not shrink by default on either half, so three buttons in a phone-width
 * card ran past its left edge instead of moving the last one down. `justify-end` keeps a wrapped
 * line against the right edge, where the primary action is.
 */
const ACTIONS = "min-w-0 shrink flex-row flex-wrap items-center justify-end gap-2";

/**
 * What `wrapperSlot`'s element takes: the column the card itself is, so the header, body and
 * footer inside it stack and stretch as they did with nothing between them and the card. `gap-0`
 * because `FormElement` spaces its children for fields, and these are the card's own parts.
 */
const WRAPPER = "flex min-w-0 flex-col gap-0";

/**
 * The `footerSlot` row: the actions row held at the start. Its elements were once placed straight
 * into the footer, and with `footerActionsSlot` beside them the footer's `justify-between` spread
 * *every* child, so a second one landed mid-footer rather than beside the first. Grouped here,
 * they sit together at the same `gap-2`, and the footer splits between this row and that one.
 */
const FOOTER_START = "min-w-0 shrink flex-row flex-wrap items-center gap-2";

/**
 * The same row on a floating panel, stacked below `sm` as `DialogFooter` stacks, at the same
 * `gap-2` and stretched to the footer's width, so a phone draws a column of full-width parts. It
 * wraps only once it is a row: a wrapping column sized its lines to their content, and Archive
 * drew at its label's width (#465). `sm:mr-auto` holds it at the start, since the buttons beside
 * it are the footer's own children.
 */
const FLOATING_FOOTER_START =
  "min-w-0 shrink flex-col-reverse items-stretch gap-2 sm:mr-auto sm:flex-row sm:flex-wrap sm:items-center";

/**
 * Whether a body holds nothing to draw: no element at all, or one `List` with no rows.
 *
 * Elements rather than a truth test: `{items.map(…)}` on an empty array is an empty array, not
 * null, and it is the shape a card is nearly always handed. A `List` is the one element looked
 * into, because it is the other shape a card is handed — `<List contentSlot={items.map(…)} />` —
 * and it draws nothing when it has no rows. Anything else is taken to draw something.
 */
function isEmptyBody(slot: SlotNode): boolean {
  const parts = Children.toArray(slot).filter((part) => isValidElement(part));
  if (parts.length === 0) {
    return true;
  }
  const [only] = parts;
  return (
    parts.length === 1 &&
    isValidElement<{ contentSlot?: SlotNode }>(only) &&
    only.type === List &&
    hasRows(only.props.contentSlot) === false
  );
}

/**
 * A card with its slots already placed.
 *
 * The shape is the one every card in these apps arrives at on its own — an icon and a title, a
 * line of description under it, an action at the far end of the header, a body, and a footer
 * that holds the buttons — and writing it out each time is how they drift: some put the action
 * beside the title and some under it, some give the description a `text-sm` and some a `text-xs`,
 * and a card with nothing to show says so in a different voice on every screen.
 *
 * Every slot is a node, `contentSlot` included, so a card is one element at the call site and the
 * question "where does this go?" has one answer per prop. `emptySlot` and `loading` are the two
 * that are not slots the caller places: they are what the body says when the data came back empty,
 * and while it has not come back at all. A list rendered from a `map` reaches the first state on
 * its own the moment its array is empty.
 */
export function CardLayout({
  contentSlot,
  title,
  level = 3,
  description,
  descriptionPlacement = "inline",
  descriptionIconSlot,
  iconSlot,
  actionSlot,
  actionPlacement = "wrap",
  emptySlot,
  loading = false,
  footerSlot,
  footerActionsSlot,
  wrapperSlot,
  className,
  headerClassName,
  titleClassName,
  contentClassName,
  footerClassName,
}: CardLayoutProps) {
  const surface = useContext(FloatingSurfaceContext);
  const isEmpty = isEmptyBody(contentSlot);
  const settled = isEmpty && hasSlot(emptySlot) ? emptySlot : contentSlot;
  const body = loading ? <CardLayoutSkeleton /> : settled;

  const hasText = hasSlot(title) || hasSlot(description);
  const hasHeader = hasText || hasSlot(actionSlot);
  const hasFooter = hasSlot(footerSlot) || hasSlot(footerActionsSlot);
  const hasBody = hasSlot(body);

  // A card that is only its title and description keeps the description: folded, it would be a
  // heading on an empty card.
  const folded =
    foldsDescription(title, description, descriptionPlacement) && (hasBody || hasFooter);
  const oneLineTitle = actionPlacement === "inline" ? ONE_LINE_TITLE : undefined;

  const titleSlot = title ? (
    surface ? (
      surface.drawTitle(title, cn(oneLineTitle, titleClassName))
    ) : (
      <CardTitle
        level={level}
        className={cn("min-w-0 shrink truncate", oneLineTitle, titleClassName)}
      >
        {title}
      </CardTitle>
    )
  ) : null;

  let descriptionSlot: SlotNode = null;
  if (description) {
    descriptionSlot = surface ? (
      surface.drawDescription(description)
    ) : (
      <CardDescription>{description}</CardDescription>
    );
  }

  const headingText = hasText ? (
    <DescribedTitle
      titleSlot={titleSlot}
      label={title}
      leadingSlot={
        hasSlot(iconSlot) ? (
          // Sized here rather than by the caller, so an icon passed as `<Plus />` and one passed
          // as `<Plus className="size-4" />` land at the same size.
          <div className={cn("cube-rn-view", "shrink-0 text-foreground/60", ICON)}>{iconSlot}</div>
        ) : null
      }
      description={description}
      // A card is not a landmark or a control, so there is nothing for an `aria-describedby` to
      // hang on: folded, the text is only read where it was. A panel is a dialog, which its
      // description describes, so it draws the folded copy itself.
      descriptionSlot={descriptionSlot}
      foldedDescriptionSlot={folded ? surface?.drawFoldedDescription?.(description) : undefined}
      folded={folded}
      fallbackName="About this card"
      iconSlot={descriptionIconSlot}
      triggerTestID="card-layout-description-trigger"
    />
  ) : null;

  // On a floating panel the buttons are the footer's own children, as `ConfirmDialog`'s are, so
  // `DialogFooter` is the one rule for both: a row past `sm`, and below it a column of full-width
  // buttons with the main one on top. In a row of their own they kept their labels' width (#465).
  const footerParts = surface ? (
    <>
      {hasSlot(footerSlot) ? (
        <div className={cn("cube-rn-view", FLOATING_FOOTER_START)}>{footerSlot}</div>
      ) : null}
      {footerActionsSlot}
    </>
  ) : (
    <>
      {hasSlot(footerSlot) ? (
        <div className={cn("cube-rn-view", FOOTER_START)}>{footerSlot}</div>
      ) : null}
      {hasSlot(footerActionsSlot) ? (
        <div className={cn("cube-rn-view", ACTIONS)}>{footerActionsSlot}</div>
      ) : null}
    </>
  );

  if (surface) {
    return (
      <FloatingSurfaceContext.Provider value={null}>
        {surface.drawParts({
          headerSlot: hasHeader ? (
            <HeadingRow
              textSlot={headingText}
              actionSlot={actionSlot}
              actionPlacement={actionPlacement}
              className={headerClassName}
            />
          ) : null,
          contentSlot: body,
          contentClassName,
          footerSlot: hasFooter ? footerParts : null,
          footerClassName,
          wrapperSlot,
        })}
      </FloatingSurfaceContext.Provider>
    );
  }

  const parts = (
    <>
      {hasHeader ? (
        // Over a body, 24px stands the heading off the 16px between the rows under it. Over a
        // footer alone it keeps the header's own 16px: a row of buttons is not a group of rows.
        <CardHeader className={cn(hasBody && HEADING_BODY_PAD, headerClassName)}>
          <HeadingRow
            textSlot={headingText}
            actionSlot={actionSlot}
            actionPlacement={actionPlacement}
          />
        </CardHeader>
      ) : null}

      {/* The header keeps its real title while loading: only the part that is waiting waits. */}
      {hasBody ? (
        // `CardContent` is `pt-0` because a header above it brings the top padding. With no
        // header the body is the first thing in the card and sat on its top edge.
        // `gap-4` spaces what the body holds, as `Section`'s body does: rows handed to a card
        // otherwise touched (#474). `contentClassName` replaces it.
        <CardContent
          className={cn("min-w-0 gap-4", hasHeader === false && "pt-4", contentClassName)}
        >
          {body}
        </CardContent>
      ) : null}

      {hasFooter ? (
        <CardFooter
          className={cn(
            hasSlot(footerSlot) && hasSlot(footerActionsSlot) && "justify-between",
            hasSlot(footerSlot) === false && "justify-end",
            // The same, for a footer with neither a header nor a body over it.
            hasHeader === false && hasBody === false && "pt-4",
            footerClassName,
          )}
        >
          {footerParts}
        </CardFooter>
      ) : null}
    </>
  );

  return (
    <Card data-slot="card-layout" className={className}>
      {/* Inside the card, so its border, background and accent stripe stay the card's own. */}
      {wrapperSlot ? wrapperSlot(parts, { className: WRAPPER }) : parts}
    </Card>
  );
}

/**
 * Three bars at the widths a paragraph or a short list settles at, so the card holds roughly the
 * height its content will and the page does not jump when the data lands.
 *
 * The bars are `aria-hidden` under one `role="status"` saying "Loading", as `RowSkeleton`'s are.
 * Hidden as a whole, the body said nothing while it waited, and a screen reader heard a title
 * over an empty card. The status is the wrapper and its name the `aria-label`, because on device
 * there is no `sr-only` text for a live region to read.
 */
function CardLayoutSkeleton() {
  return (
    <div
      data-slot="card-layout-skeleton"
      role="status"
      aria-label="Loading"
      className="cube-rn-view gap-2"
    >
      <Skeleton aria-hidden className="h-4 w-2/3" />
      <Skeleton aria-hidden className="h-4 w-full" />
      <Skeleton aria-hidden className="h-4 w-1/2" />
    </div>
  );
}
