import type { ReactNode } from "react";
import { cn, type SlotNode } from "@/lib/utils";
import {
  COLUMNS,
  HeaderContentFooter,
  type HeaderContentFooterProps,
} from "@/components/header-content-footer";
import { PageHeader, type PageHeaderLevel, type PageHeaderSize } from "@/components/page-header";

/** The line under a page's header, the colour `PageHeader` draws it in. */
const HEADER_RULE = "border-b border-foreground/10";

export type PageLayoutProps = {
  /** The page. The only slot that scrolls, unless `scroll` is off. */
  contentSlot: SlotNode;
  /** What the page is called. Required for the same reason it is on {@link PageHeader}. */
  title: ReactNode;
  /** One line on what the page is for. */
  description?: ReactNode | undefined;
  /** Sits before the title, sized with it. Pass a bare `<Users />`. */
  iconSlot?: SlotNode | undefined;
  /** The header's far end: the page's buttons, a status pill, a menu. */
  actionSlot?: SlotNode | undefined;
  /** The way back, above the title: a back link, or a breadcrumb trail. */
  backSlot?: SlotNode | undefined;
  /** @deprecated Renamed `backSlot`. Read when `backSlot` is not passed. */
  breadcrumbsSlot?: SlotNode | undefined;
  /**
   * The row under the title: a search field, a filter row, tabs. It is `PageHeader`'s `contentSlot`
   * slot, named for the part it belongs to because this component's own `contentSlot` is the page.
   *
   * Passing it also removes the rule under the header, as it does on `PageHeader`.
   */
  headerContentSlot?: SlotNode | undefined;
  /**
   * Bars under the title that run the full width while the title keeps its column: a second
   * toolbar, a notice pinned with the header, a strip of the page's state. Stacked in the order
   * passed, each as wide as the page; a bar draws its own fill and inset (`px-4`). Pinned with
   * the title, so it is there wherever the body has scrolled to. Tabs that should line up with
   * the title go in `headerContentSlot` instead.
   */
  headerBarSlot?: SlotNode | undefined;
  /** Whether the *title* is still being fetched. The body is the caller's to place. */
  loading?: boolean | undefined;
  /** Which heading the title is. `1` unless this page is nested inside another's chrome. */
  level?: PageHeaderLevel | undefined;
  /**
   * How large the title is drawn, apart from `level`: `lg`, `md` or `sm`, following `level` when
   * left out. `size="sm"` is a compact title on a page that is still the `h1`.
   */
  size?: PageHeaderSize | undefined;
  /** Pinned under the body: paging, totals, a save bar. Absent, no row is drawn. */
  footerSlot?: SlotNode | undefined;
  /**
   * The column the header and body share. `page` for a list or a board, `prose` for settings, a
   * detail page or a form, `full` for a pane that is already inside someone else's column.
   */
  width?: HeaderContentFooterProps["width"];
  /**
   * Whether the body scrolls. On unless the page fills the height and scrolls its own parts: a
   * chat's message list over a pinned composer, a framed app, tab panels that each keep their
   * place. Off, the body is the height left under the header and `contentSlot` divides it.
   */
  scroll?: boolean | undefined;
  /** The scrolling body, for a caller that has to reach it — restoring a scroll position. */
  contentRef?: HeaderContentFooterProps["contentRef"];
  /** A handle that moves the body: `scrollToEnd()`, the same on both halves. */
  scrollRef?: HeaderContentFooterProps["scrollRef"];
  /** Called as the body scrolls, with where it now is. Never called while `scroll` is off. */
  onScroll?: HeaderContentFooterProps["onScroll"];
  className?: string | undefined;
  /**
   * On the whole header — the title block and `headerBarSlot` — which runs the full width. The
   * rule under it is here: `border-b-0` removes it, and `border-b border-foreground/10` draws it
   * under a `headerContentSlot`, which otherwise has none.
   */
  headerClassName?: string | undefined;
  /**
   * Merged after the body's own `gap-4 py-4`, so `py-0` or `gap-6` replaces just that half. The
   * body's `px-4` comes with `width` and is not here.
   */
  contentClassName?: string | undefined;
  footerClassName?: string | undefined;
};

/**
 * A whole page: its title block pinned above a body that scrolls under it. This is
 * `HeaderContentFooter` filling its parent, with a `PageHeader` in its header slot.
 *
 * What it adds is that `width` is a word (`page`, `prose`, `full`) instead of a number each page
 * picks again. It does not own the sidebar, the theme toggle or the route, which belong to an app
 * shell.
 */
export function PageLayout({
  contentSlot,
  title,
  description,
  iconSlot,
  actionSlot,
  backSlot,
  breadcrumbsSlot,
  headerContentSlot,
  headerBarSlot,
  loading = false,
  level = 1,
  size,
  footerSlot,
  width = "page",
  scroll = true,
  contentRef,
  scrollRef,
  onScroll,
  className,
  headerClassName,
  contentClassName,
  footerClassName,
}: PageLayoutProps) {
  // `PageHeader`'s own rule, drawn on the header around it instead, so that the line runs the
  // full width under the bars rather than across the title's column above them.
  const rule = level === 1 && Boolean(headerContentSlot) === false ? HEADER_RULE : undefined;

  return (
    // `h-full` because the chassis needs a height to divide, whichever part ends up scrolling.
    <HeaderContentFooter
      width={width}
      headerWidth="full"
      scroll={scroll}
      contentRef={contentRef}
      scrollRef={scrollRef}
      onScroll={onScroll}
      className={cn("h-full", className)}
      // Room under the header's rule and between the blocks a page stacks; a page that wants
      // its rows flush says so with `py-0` or `gap-0`, merged after.
      contentClassName={cn("gap-4 py-4", contentClassName)}
      // A pinned footer over a scrolling body gets the boundary the header has, and room in it:
      // bare, it read as one more row flush to the bottom edge. The caller's classes after.
      footerClassName={cn("border-t border-foreground/10 py-3", footerClassName)}
      headerClassName={cn(rule, headerClassName)}
      headerSlot={
        <>
          <PageHeader
            title={title}
            description={description}
            iconSlot={iconSlot}
            actionSlot={actionSlot}
            backSlot={backSlot ?? breadcrumbsSlot}
            contentSlot={headerContentSlot}
            loading={loading}
            level={level}
            size={size}
            // The title block keeps the body's column, and leaves the rule to the header.
            className={cn(COLUMNS[width], "border-b-0")}
          />
          {headerBarSlot}
        </>
      }
      contentSlot={contentSlot}
      footerSlot={footerSlot}
    />
  );
}
