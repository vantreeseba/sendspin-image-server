import { type RefObject, useLayoutEffect, useRef, useState } from "react";

/** The variable the box's scrollbar width is written to, in pixels: `0px` where it takes no room. */
const SCROLLBAR_WIDTH = "--scrollbar-width";

/**
 * How far from an end, in pixels, still counts as at it. A zoomed page scrolls by fractions of a
 * pixel, and a box scrolled all the way can stop just short of its last one.
 */
const AT_THE_END = 1;

/**
 * Which ends of the box's inline axis have more past them: `start` is the left in a left-to-right
 * page and `end` the right, the other way round in a right-to-left one. Both are `false` for a box
 * that does not scroll sideways.
 */
export type OverflowEdges = { readonly start: boolean; readonly end: boolean };

/**
 * A ref to put on the box, whether what it holds is larger than it is on either axis, and which
 * ends of it have more to scroll to sideways, kept up to date as either changes size and as the box
 * scrolls. `false` until the box has been measured, just after mount.
 */
export function useOverflows<T extends HTMLElement = HTMLDivElement>(): readonly [
  RefObject<T | null>,
  boolean,
  OverflowEdges,
] {
  const ref = useRef<T>(null);
  const [overflows, setOverflows] = useState(false);
  const [moreAtStart, setMoreAtStart] = useState(false);
  const [moreAtEnd, setMoreAtEnd] = useState(false);
  // Before paint, so a column placed by the scrollbar's width does not draw once without it.
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box || typeof ResizeObserver === "undefined") {
      return;
    }
    // In a right-to-left box `scrollLeft` runs from 0 down to minus the overflow, so its size is
    // the distance from the start either way.
    const measureEdges = () => {
      const scrolled = Math.abs(box.scrollLeft);
      setMoreAtStart(scrolled > AT_THE_END);
      setMoreAtEnd(box.scrollWidth - box.clientWidth - scrolled > AT_THE_END);
    };
    const measure = () => {
      setOverflows(box.scrollWidth > box.clientWidth || box.scrollHeight > box.clientHeight);
      measureEdges();
      const style = getComputedStyle(box);
      const borders =
        Number.parseFloat(style.borderLeftWidth) + Number.parseFloat(style.borderRightWidth);
      box.style.setProperty(SCROLLBAR_WIDTH, `${box.offsetWidth - box.clientWidth - borders}px`);
    };
    // The box keeps its size when what it holds grows, so each child is watched as well, and the
    // list of children, for a child that arrives later.
    const resizes = new ResizeObserver(measure);
    const watchChildren = () => {
      for (const child of Array.from(box.children)) {
        resizes.observe(child);
      }
    };
    const arrivals = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of Array.from(record.removedNodes)) {
          if (node instanceof Element) {
            resizes.unobserve(node);
          }
        }
      }
      watchChildren();
      measure();
    });
    resizes.observe(box);
    watchChildren();
    arrivals.observe(box, { childList: true });
    box.addEventListener("scroll", measureEdges, { passive: true });
    measure();
    return () => {
      resizes.disconnect();
      arrivals.disconnect();
      box.removeEventListener("scroll", measureEdges);
    };
  }, []);
  return [ref, overflows, { start: moreAtStart, end: moreAtEnd }] as const;
}
