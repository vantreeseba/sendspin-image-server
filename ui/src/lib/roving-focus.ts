import * as React from 'react';

/** The web's key event, narrowed to the two members used — the same shape on both halves. */
export type RovingKeyEvent = { key: string; preventDefault: () => void };

/** What an option's node has to be: something focus can be moved to. */
type Focusable = { focus: () => void };

/** The one DOM method the ordering needs, which a device's node does not have. */
type Positioned = { compareDocumentPosition: (other: unknown) => number };

function isPositioned(node: unknown): node is Positioned {
  return typeof node === 'object' && node !== null && 'compareDocumentPosition' in node;
}

/** DOM order, where there is a DOM. On device there is no keyboard to need it. */
function byDocumentPosition(a: unknown, b: unknown) {
  if (isPositioned(a) === false || !b) {
    return 0;
  }
  // `Node.DOCUMENT_POSITION_FOLLOWING`, spelled out: `Node` is not a global on device.
  return a.compareDocumentPosition(b) & 4 ? -1 : 1;
}

/** The keys that step forward and back, per orientation. */
const STEP_KEYS = {
  // A radio group takes all four, as radix's does.
  both: { next: ['ArrowDown', 'ArrowRight'], previous: ['ArrowUp', 'ArrowLeft'] },
  // A row of tabs leaves Up and Down to the page, as radix's tabs do.
  horizontal: { next: ['ArrowRight'], previous: ['ArrowLeft'] },
} as const;

export type RovingFocusOptions = {
  /** The chosen option, which is the tab stop while it is enabled. */
  current: string | undefined;
  /** Called with the option an arrow key moved to, after focus has moved there. */
  onMove: (value: string) => void;
  /** The whole set is disabled: no option is a tab stop. */
  disabled?: boolean | undefined;
  /** Whether a step past the last option lands on the first. On by default. */
  loop?: boolean | undefined;
  /** Which arrows step. `both` by default. */
  orientation?: keyof typeof STEP_KEYS | undefined;
};

/** A roving tab stop over the options that register with it. */
export function useRovingFocus({
  current,
  onMove,
  disabled = false,
  loop = true,
  orientation = 'both',
}: RovingFocusOptions) {
  const refs = React.useRef(new Map<string, React.RefObject<Focusable | null>>());
  // Which options exist and whether each is disabled — state rather than a ref, because the tab
  // stop is derived from it and has to re-render when an option arrives.
  const [options, setOptions] = React.useState<ReadonlyMap<string, boolean>>(new Map());

  const register = React.useCallback(
    (option: string, ref: React.RefObject<Focusable | null>, optionDisabled: boolean) => {
      refs.current.set(option, ref);
      setOptions((prev) => {
        if (prev.get(option) === optionDisabled) {
          return prev;
        }
        const next = new Map(prev);
        next.set(option, optionDisabled);
        return next;
      });
    },
    [],
  );
  const unregister = React.useCallback((option: string) => {
    refs.current.delete(option);
    setOptions((prev) => {
      if (prev.has(option) === false) {
        return prev;
      }
      const next = new Map(prev);
      next.delete(option);
      return next;
    });
  }, []);

  const enabled = () =>
    disabled
      ? []
      : [...options]
          .filter(([, optionDisabled]) => optionDisabled === false)
          .map(([option]) => option)
          .sort((a, b) =>
            byDocumentPosition(
              refs.current.get(a)?.current ?? null,
              refs.current.get(b)?.current ?? null,
            ),
          );

  const move = (from: string, event: RovingKeyEvent) => {
    const order = enabled();
    const at = order.indexOf(from);
    const last = order.length - 1;
    const keys: { next: readonly string[]; previous: readonly string[] } = STEP_KEYS[orientation];
    // Where a step past either end lands: round to the other end, or nowhere.
    const pastLast = loop ? 0 : at;
    const pastFirst = loop ? last : at;
    let to: number;
    if (keys.next.includes(event.key)) {
      to = at < last ? at + 1 : pastLast;
    } else if (keys.previous.includes(event.key)) {
      to = at > 0 ? at - 1 : pastFirst;
    } else if (event.key === 'Home') {
      to = 0;
    } else if (event.key === 'End') {
      to = last;
    } else {
      return;
    }
    // Always, even at an end with `loop={false}`: an arrow key the set owns must not also scroll
    // the page.
    event.preventDefault();
    const target = order[to];
    if (target === undefined || target === from) {
      return;
    }
    refs.current.get(target)?.current?.focus();
    onMove(target);
  };

  const order = enabled();
  const tabStop = current !== undefined && order.includes(current) ? current : order[0];

  return { tabStop, register, unregister, move };
}

/** What an option needs from its set: the two calls that put it in the order and take it out. */
export type RovingSet = Pick<ReturnType<typeof useRovingFocus>, 'register' | 'unregister'>;

/**
 * Puts one option in its set's order while it is mounted, and hands back the ref to put on the
 * option's pressable, which is where an arrow key moves focus to.
 */
export function useRovingItem<Node extends Focusable>(
  set: RovingSet,
  value: string,
  disabled: boolean,
) {
  const ref = React.useRef<Node>(null);
  const { register, unregister } = set;
  React.useEffect(() => {
    register(value, ref, disabled);
  }, [register, value, disabled]);
  React.useEffect(() => () => unregister(value), [unregister, value]);
  return ref;
}
