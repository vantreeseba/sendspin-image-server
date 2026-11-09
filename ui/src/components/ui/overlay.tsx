import {
  Fragment,
  type ReactNode,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
/** A box drawn over the app, or over a modal, that floating content is drawn into. */
export type Layer = {
  /**
   * The layer's own element. On device a `View`, measured in the window so what is drawn into it
   * can be placed against something measured the same way.
   */
  readonly node: { current: unknown };
  /** Draws `content` in the layer, or replaces what was drawn under the same `id`. */
  put: (id: string, content: ReactNode) => void;
  /** Takes away what was drawn under `id`. */
  remove: (id: string) => void;
};

type Entry = { layer: Layer; modal: boolean };

const entries: Entry[] = [];
const listeners = new Set<() => void>();
let top: Layer | null = null;

function publish() {
  // A modal's layer is over the app's whichever mounted first. A dialog that is open on the first
  // render would register before the root around it, because a child's effects run first.
  let modal: Entry | undefined;
  for (const entry of entries) {
    if (entry.modal) {
      modal = entry;
    }
  }
  top = (modal ?? entries.at(-1))?.layer ?? null;
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function read() {
  return top;
}

function serverRead() {
  return null;
}

/**
 * The layer floating content goes in: the last modal's that is open, or the app's. `null` when
 * nothing draws one, as on the web, where the caller draws in place.
 */
export function useTopLayer(): Layer | null {
  return useSyncExternalStore(subscribe, read, serverRead);
}

const EMPTY: ReadonlyMap<string, ReactNode> = new Map();

/** The box itself: over the whole of its parent, and only what is drawn in it takes a touch. */
function LayerBox({ modal }: { modal: boolean }) {
  const node = useRef<unknown>(null);
  const [content, setContent] = useState(EMPTY);

  useLayoutEffect(() => {
    const layer: Layer = {
      node,
      put: (id, next) => setContent((drawn) => new Map(drawn).set(id, next)),
      remove: (id) =>
        setContent((drawn) => {
          if (drawn.has(id) === false) {
            return drawn;
          }
          const left = new Map(drawn);
          left.delete(id);
          return left;
        }),
    };
    const entry: Entry = { layer, modal };
    entries.push(entry);
    publish();
    return () => {
      entries.splice(entries.indexOf(entry), 1);
      publish();
    };
  }, [modal]);

  return (
    <div
      ref={(element) => {
        node.current = element;
      }}
      className="cube-rn-view cube-rn-pe-box-none absolute inset-0"
    >
      {Array.from(content, ([id, drawn]) => (
        <Fragment key={id}>{drawn}</Fragment>
      ))}
    </div>
  );
}

/**
 * The app's layer, for what floats over its screens: a tooltip opened inside a `ScrollView` is
 * drawn here, outside it, rather than clipped by it. Put it once near the root, inside the
 * providers its content reads (the palette's), as `ToastProvider` goes. `ToastProvider` draws one
 * itself, so an app that has one needs no other.
 *
 * On device only. Under the web the tooltip is radix's and portals to `<body>`, and a layer here
 * would take the toast stack out of the place a DOM app's dialogs expect it.
 */
export function OverlayHost({ children }: { children?: ReactNode }) {
  return (
    <>
      {children}
      {null}
    </>
  );
}

/**
 * A modal's layer, drawn last inside its `Modal`, so a tooltip or a toast raised while it is open
 * is drawn over it. The dialog, the popover, the menu and the select each draw one.
 */
export function OverlayLayer() {
  return <LayerBox modal />;
}

/**
 * Draws `children` in `layer` instead of here. They are drawn under the layer's providers, not
 * this element's, so they should read nothing from a context of their own.
 */
export function OverlayPortal({ layer, children }: { layer: Layer; children: ReactNode }) {
  const id = useId();
  // On every render, so the layer draws what this element would have.
  useLayoutEffect(() => {
    layer.put(id, children);
  });
  useLayoutEffect(() => () => layer.remove(id), [layer, id]);
  return null;
}
