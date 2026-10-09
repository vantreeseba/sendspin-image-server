import { type Ref, useImperativeHandle, useRef } from "react";
import { cn, type SlotNode } from "@/lib/utils";

/**
 * The column a page's chrome and its content share.
 *
 * A header that caps itself while the table beneath it runs to the pane edge reads as two
 * screens stacked, and the mismatch is there at every width, not only past the cap: the header
 * carries its own inset and the table did not. One class, applied to every slot, is what keeps
 * the title above the first column rather than beside it.
 *
 * The cap is the `2xl` breakpoint. The web reads it from the theme variable so it moves with the
 * app's own breakpoints; native has no such variable, so it spells the default (`96rem`) out.
 */
export const PAGE_COLUMN = "mx-auto w-full max-w-(--breakpoint-2xl)";

/**
 * The reading column: a page of prose, a settings screen, a form.
 *
 * Narrower than {@link PAGE_COLUMN} because the constraint is a line length, not a viewport.
 * Both app shells that had grown a page component of their own defaulted to exactly this, and
 * then disagreed about what the *other* width was called — one said `max-w-5xl` and the other
 * `max-w-none`, both spelled `wide`. Naming the columns is what stops the third app inventing an
 * eleventh value: across these projects there are 51 capped page columns wearing 10 widths.
 */
export const PROSE_COLUMN = "mx-auto w-full max-w-3xl";

const COLUMNS = {
  full: undefined,
  page: PAGE_COLUMN,
  prose: PROSE_COLUMN,
} as const;

/** The column names `width` takes. Exported for shells that pass one through. */
export type HeaderContentFooterWidth = keyof typeof COLUMNS;

/**
 * Where the scrolling body is, in pixels: how far down it has moved, how tall what it scrolls is,
 * and how tall the window onto it is. The body is at its end when `offset + viewportHeight`
 * reaches `contentHeight` — compare with a pixel or two to spare, since all three are fractional.
 */
export type ScrollPosition = {
  offset: number;
  contentHeight: number;
  viewportHeight: number;
};

/**
 * What moves the scrolling body, the same call on the web and on device. `contentRef` is the
 * element itself, and the two elements share no method.
 */
export type ScrollHandle = {
  /**
   * Scrolls to the last row. Animated unless told otherwise; a list following a row that is
   * still streaming in passes `{ animated: false }`, or each new line starts a glide the next
   * one interrupts.
   */
  scrollToEnd: (options?: { animated?: boolean }) => void;
};

/** The part of the web's scrolling `<div>` that `scrollToEnd` uses. */
type WebScroller = {
  scrollHeight: number;
  scrollTo: (options: { top: number; behavior: "smooth" | "instant" }) => void;
};

/** The part of a DOM scroll event {@link Body} reads. */
type WebScrollEvent = {
  currentTarget: { scrollTop: number; scrollHeight: number; clientHeight: number };
};

export type HeaderContentFooterProps = {
  /** The body. The only slot that grows. */
  contentSlot: SlotNode;
  /** Page title, toolbar, filters — whatever stays above the body. Absent, no row is drawn. */
  headerSlot?: SlotNode | undefined;
  /** Paging, totals, a save bar. Absent, no row is drawn. */
  footerSlot?: SlotNode | undefined;
  /**
   * Whether the body scrolls inside the chassis rather than growing it.
   *
   * On, the header and footer stay put while the body moves, which needs the chassis to have a
   * height to divide — `h-full`, or a parent that gives it one. Off, the chassis is as tall as
   * what is in it and the page scrolls as a whole.
   */
  scroll?: boolean | undefined;
  /**
   * - `full` — slots fill whatever box the chassis was given. Print sheets, dialogs, and
   *   anything already inside its own column.
   * - `page` — slots share the capped, centred {@link PAGE_COLUMN}, inset to match the header.
   *   Every list page, every board.
   * - `prose` — the narrower {@link PROSE_COLUMN}. Settings, a detail page, a form.
   */
  width?: HeaderContentFooterWidth | undefined;
  /**
   * The scrolling body, for a caller that has to reach it — restoring a scroll position. A
   * `<div>` on the web and, while `scroll` is on, the `ScrollView` on device.
   */
  contentRef?: Ref<HTMLDivElement> | undefined;
  /**
   * A handle that moves the body: `scrollRef.current?.scrollToEnd()`, the same on both halves.
   * It does nothing while `scroll` is off, when there is no scrolling body to move.
   */
  scrollRef?: Ref<ScrollHandle> | undefined;
  /**
   * Called as the body scrolls, with where it now is — the same three numbers on the web and on
   * device, so a list that follows its newest row can tell whether the reader is still at the
   * end. Only a body that scrolls reports: with `scroll` off it is never called.
   */
  onScroll?: ((position: ScrollPosition) => void) | undefined;
  className?: string | undefined;
  headerClassName?: string | undefined;
  /**
   * On the body. On device, where the scroller and what it scrolls are two boxes, this goes on
   * the scrolled content — padding on the scroller itself would scroll away with nothing.
   */
  contentClassName?: string | undefined;
  footerClassName?: string | undefined;
};

type BodyProps = {
  contentSlot: SlotNode;
  scroll: boolean;
  column: string | undefined;
  contentRef: HeaderContentFooterProps["contentRef"];
  scrollRef: HeaderContentFooterProps["scrollRef"];
  onScroll: HeaderContentFooterProps["onScroll"];
  className: string | undefined;
};

/**
 * Moves a scroller to its last row. Its own function, and statements, for the reason {@link Body}
 * is: the compiler keeps the web arm and drops the `ScrollView` call under it.
 */
function toEnd(scroller: unknown, animated: boolean) {
  const box = scroller as WebScroller;
  box.scrollTo({ top: box.scrollHeight, behavior: animated ? "smooth" : "instant" });
  return;
}

/** Hands a node to a caller's ref, whichever kind of ref it is. */
function assign<T>(ref: Ref<T> | undefined, node: T | null) {
  if (typeof ref === "function") {
    ref(node);
  } else if (ref) {
    ref.current = node;
  }
}

/**
 * The floor every body needs, whichever element it is. See {@link HeaderContentFooter}.
 *
 * The growth differs. On the web `flex-1` is `1 1 0%`, which in a chassis of no set height — a
 * dialog capped by `max-h` — still sizes from content. Yoga's `flex: 1` starts from nothing, so the
 * same body in the same dialog collapses to zero; there it starts from its content (`basis-auto`),
 * grows into a height it is given and shrinks under a cap.
 */
const BODY = cn("relative min-h-0 min-w-0", "flex-1");

/**
 * The body, which is the one part that is a different element on each platform.
 *
 * Written as statements rather than a ternary because the two arms are different elements, and
 * the compiler refuses an element chosen at runtime — it folds `Platform.OS === "web"` to `true`
 * and keeps the first arm, and the `ScrollView` below it is dropped as unreachable.
 */
function Body({
  contentSlot,
  scroll,
  column,
  contentRef,
  scrollRef,
  onScroll,
  className,
}: BodyProps) {
  // The scroller is kept here as well as handed to `contentRef`, for `scrollToEnd` to move.
  const scroller = useRef<unknown>(null);
  useImperativeHandle<ScrollHandle, ScrollHandle>(scrollRef, () => ({
    scrollToEnd: ({ animated = true } = {}) => {
      if (scroll && scroller.current) {
        toEnd(scroller.current, animated);
      }
    },
  }));
  return (
    <div
      data-slot="header-content-footer-content"
      // The chassis's own ref type is the device's scroller; on the web both are a `<div>`.
      ref={(node) => {
        scroller.current = node;
        assign(contentRef as Ref<HTMLDivElement>, node);
      }}
      // A scrolling region a keyboard cannot reach is a region a keyboard user cannot read:
      // the mouse wheel moves it and nothing else does, which axe reports as
      // `scrollable-region-focusable`. A tab stop is the fix the rule asks for, and it costs
      // nothing when the body already holds focusable children — the caret goes to them next.
      tabIndex={scroll ? 0 : undefined}
      // A view's own props have no scroll event — on device a view does not scroll — so the
      // listener goes on as a spread, untyped. The element under it is a `<div>` either way.
      {...(scroll && onScroll
        ? {
            onScroll: ({ currentTarget }: WebScrollEvent) =>
              onScroll({
                offset: currentTarget.scrollTop,
                contentHeight: currentTarget.scrollHeight,
                viewportHeight: currentTarget.clientHeight,
              }),
          }
        : {})}
      className={cn("cube-rn-view", BODY, scroll && "overflow-y-auto", column, className)}
    >
      {contentSlot}
    </div>
  );
}

/**
 * Header, body, footer, in a column.
 *
 * A flex column rather than three fixed grid rows, because the rows only line up when all three
 * slots are present: with `grid-rows-[min-content_1fr_min-content]` and no header, the body
 * auto-places into the min-content row and is squashed to its own text, and any `gap` on the
 * chassis is still spent on the slots that are not there. Flex gives the same shape — the body
 * takes the leftover, the chrome takes what it needs — and an absent slot costs nothing. It is
 * also the only one of the two Yoga has, which is what lets this be one component.
 *
 * `min-h-0` / `min-w-0` on the body is not decoration. A flex item's floor is its content, so
 * one wide child — a table, a long unbroken string — grows the chassis and pushes the chrome off
 * the screen instead of scrolling inside it, and `scroll` does nothing at all without the floor.
 */
export function HeaderContentFooter({
  contentSlot,
  headerSlot,
  footerSlot,
  scroll = false,
  width = "full",
  contentRef,
  scrollRef,
  onScroll,
  className,
  headerClassName,
  contentClassName,
  footerClassName,
}: HeaderContentFooterProps) {
  // The header slot stays unpadded: a page header carries its own `px-4`, and the body matches
  // it so the two edges line up.
  const column = COLUMNS[width];
  const bodyColumn = column && cn(column, "px-4");

  return (
    // `shrink` because a chassis is sized by its parent, and a view does not shrink by default.
    <div
      data-slot="header-content-footer"
      className={cn("cube-rn-view", "min-h-0 min-w-0 shrink flex-col", className)}
    >
      {headerSlot ? (
        <div
          data-slot="header-content-footer-header"
          className={cn("cube-rn-view", "min-w-0 shrink-0", column, headerClassName)}
        >
          {headerSlot}
        </div>
      ) : null}

      <Body
        contentSlot={contentSlot}
        scroll={scroll}
        column={bodyColumn}
        contentRef={contentRef}
        scrollRef={scrollRef}
        onScroll={onScroll}
        className={contentClassName}
      />

      {footerSlot ? (
        <div
          data-slot="header-content-footer-footer"
          className={cn("cube-rn-view", "min-w-0 shrink-0", bodyColumn, footerClassName)}
        >
          {footerSlot}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The same chassis with the body scrolling and the chrome pinned — a list page, a pane inside a
 * split, anything whose header should not leave with the rows.
 *
 * It needs a height to divide, so it defaults to filling its parent.
 */
export function StickyHeaderContentFooter({
  className,
  ...props
}: Omit<HeaderContentFooterProps, "scroll">) {
  return <HeaderContentFooter scroll {...props} className={cn("h-full", className)} />;
}
