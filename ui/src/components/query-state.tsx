import { useState } from "react";
import { cn, type SlotNode } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RefreshCw, TriangleAlert } from "@/components/ui/icons";

/** What a list screen needs off its query, and nothing more. */
type QueryLike = {
  isPending: boolean;
  isError: boolean;
  /**
   * `unknown` because that is what a failure is: TanStack types it `Error | null`, Apollo hands
   * over its own error class, and a thrown string is still a throw. An `Error | null` fits.
   */
  error: unknown;
  refetch: () => unknown;
};

/** What a failure says when neither the caller nor the error has anything to say. */
const FALLBACK = "The server did not answer.";

/**
 * The error's own `message`, which is the transport's wording rather than the app's. Empty when it
 * has none, so the caller's `|| FALLBACK` speaks; the forms' `messageOf` prints the value instead.
 */
function messageOf(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (typeof error === "object" && error !== null && "message" in error) {
    const { message } = error as { message: unknown };
    if (typeof message === "string") {
      return message;
    }
  }
  return "";
}

const settles = (value: unknown): value is PromiseLike<unknown> =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { then?: unknown }).then === "function";

/** Draws a query's error, loading or empty state, and `contentSlot` once there are rows. */
export function QueryState({
  query,
  what,
  count,
  emptySlot,
  rows = 3,
  compact = false,
  describe,
  className,
}: {
  query: QueryLike;
  /** What could not be fetched, in the reader's words: "your agents", "the archive". */
  what: string;
  /**
   * How many rows the screen is about to draw.
   *
   * Passed rather than derived, because the rows a screen draws are usually a filtered or paged
   * view of what came back: an empty *result* and an empty *view* are different states, and only
   * the screen knows which one it is showing.
   */
  count: number;
  /** What to say when there are none — whatever invites the first one. */
  emptySlot?: SlotNode | undefined;
  /** How many placeholder rows stand in for the list while it loads. */
  rows?: number | undefined;
  /**
   * The rungs drawn small enough for a rail: the failure as two lines and a text-sized retry, and
   * the placeholders as bars the height of a nav row rather than cards. For a list that lives in a
   * sidebar, where a card-sized error would be taller than the list it replaced.
   */
  compact?: boolean | undefined;
  /** What the failure means, in the app's words — handed through to `QueryError`. */
  describe?: ((error: unknown) => string) | undefined;
  className?: string | undefined;
}) {
  if (query.isError) {
    return (
      <QueryError
        error={query.error}
        onRetry={() => query.refetch()}
        what={what}
        compact={compact}
        {...(describe === undefined ? {} : { describe })}
        {...(className === undefined ? {} : { className })}
      />
    );
  }
  if (query.isPending) {
    return (
      <RowSkeleton
        rows={rows}
        compact={compact}
        {...(className === undefined ? {} : { className })}
      />
    );
  }
  if (count === 0) {
    return <>{emptySlot}</>;
  }
  return null;
}

/**
 * A request that failed, said out loud.
 *
 * Its own export because a screen that draws one object rather than a list needs this rung and
 * neither of the others. It is also the rung most often left out entirely: with retries off, a
 * failed query stays failed, and a screen that renders a failure as an absence tells somebody
 * whose server has gone away that they have no data — which is an invitation to rebuild
 * something that is fine.
 *
 * The retry is awaited when it hands back a promise, as every refetch does: the button is disabled
 * and says "Retrying…" until it settles, so a second press does not stack a second request on a
 * slow server, and a rejected refetch is caught here rather than escaping as an unhandled
 * rejection. What the retry failed with is the query's to report, not the button's.
 *
 * The root is `role="alert"` in both forms — the counterpart of the loading rung's `role="status"`.
 * An alert rather than a polite live region, because it replaces the content the reader asked for:
 * somebody who triggered a load and cannot see the screen hears that it failed, rather than finding
 * the card later by moving through the page.
 */
export function QueryError({
  error,
  onRetry,
  what,
  compact = false,
  describe,
  className,
}: {
  error: unknown;
  /** A promise returned here is awaited — see above. */
  onRetry: () => unknown;
  what: string;
  /** No card, smaller type, a small outline retry — see `QueryState`'s `compact`. */
  compact?: boolean | undefined;
  /**
   * What the failure means, in the app's words. Without it the line under the heading is the
   * error's own `message` — the transport's wording, "Failed to fetch" or "Received status code
   * 401" — which is right for a bug report and wrong for somebody whose session has expired.
   */
  describe?: ((error: unknown) => string) | undefined;
  className?: string | undefined;
}) {
  const [retrying, setRetrying] = useState(false);
  const retry = () => {
    const result = onRetry();
    if (settles(result) === false) {
      return;
    }
    setRetrying(true);
    Promise.resolve(result)
      .catch(() => {})
      .finally(() => setRetrying(false));
  };
  const reason = (describe ?? messageOf)(error) || FALLBACK;
  const label = retrying ? "Retrying…" : "Try again";

  // The same three parts — what failed, why, try again — at the size of a nav row. No card, since a
  // bordered box inside a rail reads as one more row, and the retry is a small outline button so the rail's
  // only filled control stays the primary action above it.
  if (compact) {
    return (
      <div
        role="alert"
        data-slot="query-error"
        className={cn("cube-rn-view", "min-w-0 gap-1 px-2 py-1", className)}
      >
        <div className="cube-rn-view min-w-0 flex-row items-center gap-1.5">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-negative" aria-hidden />
          <span className="cube-rn-text min-w-0 flex-1 font-medium text-negative text-xs">
            Could not load {what}
          </span>
        </div>
        <span className="cube-rn-text text-foreground/60 text-xs">{reason}</span>
        <div className="cube-rn-view flex-row">
          <Button
            variant="outline"
            size="xs"
            onClick={retry}
            disabled={retrying}
            iconSlot={<RefreshCw className="h-3.5 w-3.5" aria-hidden />}
            content={label}
          />
        </div>
      </div>
    );
  }

  return (
    <Card
      role="alert"
      data-slot="query-error"
      // No tinted ground behind it. The version this was lifted from washed the card with
      // `bg-negative/5`, which drops both the red heading and the grey message under 4.5:1
      // against their own background — 4.36 and 4.33, caught by the story's axe run. The border
      // and the icon say "this failed" without moving the ground the words sit on.
      className={cn("gap-2 border-negative/40 p-4", className)}
    >
      {/* `flex-row` is explicit because a column is Yoga's default, and the icon carries its own
          colour because native inherits none — the two standing conversion rules. */}
      <div className="cube-rn-view flex-row items-center gap-2">
        <TriangleAlert className="h-4 w-4 text-negative" aria-hidden />
        <span className="cube-rn-text font-medium text-negative text-sm">
          Could not load {what}
        </span>
      </div>
      <span className="cube-rn-text text-foreground/60 text-sm">{reason}</span>
      <div className="cube-rn-view flex-row">
        <Button
          variant="outline"
          size="sm"
          onClick={retry}
          disabled={retrying}
          iconSlot={<RefreshCw className="h-3.5 w-3.5" aria-hidden />}
          content={label}
        />
      </div>
    </Card>
  );
}

/**
 * What a list shows before its first answer.
 *
 * Drawn as the row it stands in for — a bordered `Card`, which is what these lists are lists of
 * on device — so the screen does not change shape underneath the reader when the answer lands.
 * The web half of `main` drew an outlined `Item` here; `Item` is a DOM-only primitive, and a
 * placeholder that matches the row is the point rather than which component draws it.
 *
 * The placeholders are `aria-hidden` under one `role="status"` saying "Loading", because three
 * cards' worth of placeholder text is three cards' worth of nothing to a screen reader. `main`
 * hung that status off an `sr-only` sibling in a fragment; a fragment has nothing to attach a
 * live region to on device, so the status is the wrapper itself and the announcement is its
 * `aria-label`. That wrapper is the one structural difference from the DOM version, which is why
 * it carries the `gap` the rows would otherwise have taken from their parent.
 *
 * Only ever on `isPending`: a cache-and-network client keeps rendering what it had while it
 * refetches, and putting this behind `isFetching` flashes a skeleton over a perfectly good list.
 */
export function RowSkeleton({
  rows = 3,
  compact = false,
  className,
}: {
  rows?: number | undefined;
  /** Bars the height of a nav row instead of cards — see `QueryState`'s `compact`. */
  compact?: boolean | undefined;
  className?: string | undefined;
}) {
  if (compact) {
    return (
      <div role="status" aria-label="Loading" className={cn("cube-rn-view", "gap-1", className)}>
        {Array.from({ length: rows }, (_, index) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: placeholders, in a list with no identity
            key={index}
            data-slot="row-skeleton"
            aria-hidden
            className="cube-rn-view h-8 animate-pulse rounded-md bg-hover"
          />
        ))}
      </div>
    );
  }

  return (
    <div role="status" aria-label="Loading" className={cn("cube-rn-view", "gap-2", className)}>
      {Array.from({ length: rows }, (_, index) => (
        <Card
          // biome-ignore lint/suspicious/noArrayIndexKey: placeholders, in a list with no identity
          key={index}
          data-slot="row-skeleton"
          aria-hidden
          className="gap-2 p-4"
        >
          {/* `animate-pulse` resolves to nothing on device and is kept for the same reason
              `page.tsx` keeps `container mx-auto`: the class is what the compiled web half needs,
              and dropping it here to tidy the native file would quietly regress the DOM. */}
          <div className="cube-rn-view h-4 w-1/3 animate-pulse rounded-md bg-hover" />
          <div className="cube-rn-view h-3 w-2/3 animate-pulse rounded-md bg-hover" />
        </Card>
      ))}
    </div>
  );
}
