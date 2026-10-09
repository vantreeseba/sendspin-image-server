import type { ComponentType } from "react";
import { createContext } from "react";

/**
 * What a component that takes an icon *as a prop* should ask for. The two
 * implementations produce structurally different components — a lucide
 * forwardRef on web, a `styled` wrapper on native — and this is the part
 * they have in common.
 */
export type IconComponent = ComponentType<{ className?: string | undefined }>;

/**
 * The text colour class an icon should take from its container.
 *
 * Native-only machinery. On web an `<svg>` picks up `currentColor` from its
 * parent, including hover states, so `icons.web.tsx` ignores this entirely —
 * pinning an explicit colour on the icon there would freeze it through the
 * container's `hover:text-*`. Native has no inheritance at all, so a container
 * that sets its own text colour (a `Button` variant, a destructive row)
 * publishes that class here and every icon below merges it in.
 *
 * Merged *before* the icon's own `className`, so an explicit `text-*` at the
 * call site still wins.
 */
export const IconClassContext = createContext<string | undefined>(undefined);
