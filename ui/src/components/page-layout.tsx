import type { ReactNode } from "react";
import { cn, type SlotNode } from "@/lib/utils";
import { HeaderContentFooter, type HeaderContentFooterProps } from "@/components/header-content-footer";
import { PageHeader, type PageHeaderLevel } from "@/components/page-header";

export type PageLayoutProps = {
  /** The page. The only slot that scrolls, unless `scroll` is off. */
  contentSlot: SlotNode;
  /** What the page is called. Required for the same reason it is on {@link PageHeader}. */
  title: ReactNode;
  /** One line on what the page is for. */
  description?: ReactNode | undefined;
  /** Sits before the title, sized from `level`. Pass a bare `<Users />`. */
  iconSlot?: SlotNode | undefined;
  /** The header's far end: the page's buttons, a status pill, a menu. */
  actionSlot?: SlotNode | undefined;
  /** The line above the title: a breadcrumb trail, or a back link. */
  breadcrumbsSlot?: SlotNode | undefined;
  /**
   * The row under the title: a search field, a filter row, tabs. It is `PageHeader`'s `contentSlot`
   * slot, named for the part it belongs to because this component's own `contentSlot` is the page.
   *
   * Passing it also removes the rule under the header — see `PageHeader`, which derives that.
   */
  headerContentSlot?: SlotNode | undefined;
  /** Whether the *title* is still being fetched. The body is the caller's to place. */
  loading?: boolean | undefined;
  /** Which heading the title is. `1` unless this page is nested inside another's chrome. */
  level?: PageHeaderLevel | undefined;
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
  headerClassName?: string | undefined;
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
  breadcrumbsSlot,
  headerContentSlot,
  loading = false,
  level = 1,
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
  return (
    // `h-full` because the chassis needs a height to divide, whichever part ends up scrolling.
    <HeaderContentFooter
      width={width}
      scroll={scroll}
      contentRef={contentRef}
      scrollRef={scrollRef}
      onScroll={onScroll}
      className={cn("h-full", className)}
      contentClassName={contentClassName}
      footerClassName={footerClassName}
      headerSlot={
        <PageHeader
          title={title}
          description={description}
          iconSlot={iconSlot}
          actionSlot={actionSlot}
          breadcrumbsSlot={breadcrumbsSlot}
          contentSlot={headerContentSlot}
          loading={loading}
          level={level}
          className={headerClassName}
        />
      }
      contentSlot={contentSlot}
      footerSlot={footerSlot}
    />
  );
}
