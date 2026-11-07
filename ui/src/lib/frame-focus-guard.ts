import { useEffect } from "react";

/** What counts as an open overlay: cubeui's own contents, and the roles anything else gives one. */
const OVERLAY_SELECTOR = [
  '[data-slot="menu-content"]',
  '[data-slot="dialog-content"]',
  '[data-slot="alert-dialog-content"]',
  '[data-slot="popover-content"]',
  '[data-slot="select-content"]',
  '[role="menu"]',
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[role="listbox"]',
].join(", ");

/** Where focus went is only known once the blur is over; the next tick is when it is looked at. */
const NEXT_TICK_MS = 0;

/** How many open overlays hold the guard. */
let holders = 0;
/** The frames this guard made inert, so it gives back only those, and never one the app set itself. */
const madeInert = new Set<HTMLIFrameElement>();
let observer: MutationObserver | null = null;
let lastFocusedInOverlay: HTMLElement | null = null;
/** Set while a held-back blur is sent again, so the guard lets that one through. */
let isReplaying = false;

/** The overlay on top: overlays portal to the end of `<body>`, so the last one in the document. */
function topOverlay(): HTMLElement | null {
  const overlays = document.querySelectorAll<HTMLElement>(OVERLAY_SELECTOR);
  return overlays.item(overlays.length - 1);
}

/** Makes every frame outside the overlays inert, and gives back any that has moved inside one. */
function syncFrames(): void {
  // `Array.from`, not the list itself: the native half's typecheck has no `DOM.Iterable`.
  for (const frame of Array.from(document.querySelectorAll("iframe"))) {
    const isInOverlay = frame.closest(OVERLAY_SELECTOR) !== null;
    if (isInOverlay) {
      if (madeInert.has(frame)) {
        frame.inert = false;
        madeInert.delete(frame);
      }
      continue;
    }
    if (frame.inert === false) {
      frame.inert = true;
      madeInert.add(frame);
    }
  }
}

/** Gives back every frame this guard made inert. */
function restoreFrames(): void {
  for (const frame of madeInert) {
    frame.inert = false;
  }
  madeInert.clear();
}

function rememberFocus(event: FocusEvent): void {
  const { target } = event;
  const isInOverlay = target instanceof HTMLElement && target.closest(OVERLAY_SELECTOR) !== null;
  if (isInOverlay) {
    lastFocusedInOverlay = target;
  }
}

/** Puts focus back where it was in the overlay on top, taking the window's focus back first. */
function refocusOverlay(overlay: HTMLElement): void {
  const previous = lastFocusedInOverlay;
  const target = previous !== null && overlay.contains(previous) ? previous : overlay;
  window.focus();
  target.focus({ preventScroll: true });
}

/** Sends a held-back blur again, for the overlays that close on one. */
function replayBlur(): void {
  isReplaying = true;
  try {
    window.dispatchEvent(new FocusEvent("blur"));
  } finally {
    isReplaying = false;
  }
}

/**
 * Holds every window blur back from the overlays while one holds the guard, and decides on the next
 * tick (see the top of the file). Only the window's own blur: a capture listener on the window also
 * sees each element's, and those are the page's business.
 */
function holdBlur(event: FocusEvent): void {
  const isWindowBlur = event.target === window;
  if (holders === 0 || isReplaying || isWindowBlur === false) {
    return;
  }
  event.stopImmediatePropagation();
  setTimeout(() => {
    const overlay = topOverlay();
    if (overlay === null) {
      return;
    }
    const focused = document.activeElement;
    const isTakenByFrame = focused instanceof HTMLIFrameElement && madeInert.has(focused);
    if (isTakenByFrame) {
      refocusOverlay(overlay);
      return;
    }
    if (document.hasFocus()) {
      return;
    }
    replayBlur();
  }, NEXT_TICK_MS);
}

// Added once, when this module is first imported, and never removed. A window's listeners run in the
// order they were added, capture or not, so the guard has to be added before any overlay's: Radix adds
// its blur listener when a menu or select opens, and every overlay that holds the guard imports this
// module first. While nothing holds the guard it returns at once.
if (typeof window !== "undefined") {
  window.addEventListener("blur", holdBlur, true);
}

/**
 * Holds the guard while an overlay is open.
 *
 * @returns The release; call it when the overlay closes. The last release takes everything down.
 */
export function acquireFrameFocusGuard(): () => void {
  holders += 1;
  if (holders === 1) {
    observer = new MutationObserver(syncFrames);
    // Overlays mount in portals at the end of <body>, and frames come and go with the page.
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("focusin", rememberFocus, true);
  }
  syncFrames();
  let isHeld = true;
  return () => {
    if (isHeld === false) {
      return;
    }
    isHeld = false;
    holders -= 1;
    if (holders > 0) {
      syncFrames();
      return;
    }
    observer?.disconnect();
    observer = null;
    document.removeEventListener("focusin", rememberFocus, true);
    lastFocusedInOverlay = null;
    restoreFrames();
  };
}

/** Holds the guard for as long as the component that calls it is mounted. */
export function useFrameFocusGuard(): void {
  useEffect(() => acquireFrameFocusGuard(), []);
}

/**
 * Holds the guard while it is mounted, and draws nothing. Placed inside an overlay's content, which
 * Radix mounts only while the overlay is open.
 */
export function FrameFocusGuard(): null {
  useFrameFocusGuard();
  return null;
}
