import { CircleQuestionMark } from "lucide-react";
import type { ReactNode } from "react";
import { cloneElement, isValidElement, useId } from "react";
import { cn, type SlotNode } from "@/lib/utils";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The box the absent control leaves behind while it is loading, per orientation: a `vertical`
 * field holds an `Input`, a `Select` trigger or a `DatePicker`, all of which rest at `h-9`; a
 * `horizontal` one holds the 16px box of a checkbox or the 18px pill of a switch.
 *
 * A skeleton that is not the height of what replaces it is a page that jumps when the data lands,
 * which is the whole reason to draw one.
 */
const LOADING_BOX = {
  vertical: "h-9 w-full rounded-md",
  horizontal: "size-4 rounded-[4px]",
} as const;

/**
 * What the shell wires onto the control, handed straight to the caller when `controlSlot` is a
 * function. The names are the DOM's, so the whole object spreads onto an element.
 */
type ControlProps = {
  id: string;
  /** Only ever set under {@link FormFieldProps.asGroup} — otherwise the `<label>` does this job. */
  "aria-labelledby": string | undefined;
  "aria-describedby": string | undefined;
  "aria-invalid": true | undefined;
  "aria-required": true | undefined;
};

/**
 * The ids of the field's own parts, handed to the function form of `controlSlot` beside the props.
 *
 * Not spread with them, because they are not attributes of the control: they are for a control
 * with a second element to name. A `ColorPicker` is one — the `<label htmlFor>` names its hex box,
 * and its swatch row is a `radiogroup` that the label, being a `<label>`, cannot also name, so the
 * row points back at the label's `id` with `aria-labelledby`.
 */
type FieldParts = {
  /** The label's `id`, whenever there is a label; the `FieldTitle`'s under `asGroup`. */
  labelId: string | undefined;
};

type FormFieldProps = {
  /**
   * The control itself — one `<Input>`, `<Textarea>`, `<Checkbox>`, `<Switch>`.
   *
   * The one body in this set not called `contentSlot`, because it is the one body that is not
   * merely placed. The shell clones it to hand it the `id` the label points at, the
   * `aria-describedby` that reaches the description and the error, and the `aria-invalid` the
   * shadcn primitives already draw their red ring from. That contract — a single element that
   * forwards its props to a form control — is what the name carries. `contentSlot` would promise
   * that any nodes fit, and a `<div>` holding two inputs would take the `id` and leave the label
   * pointing at a wrapper, which is a label that does nothing and an axe failure that says so.
   *
   * **Pass a function when the element the props belong on is not the outermost one.** A
   * `<Select>` is the case that forces this: its root renders no DOM at all, so a clone of it
   * swallows every attribute and the field ends up wired to nothing — silently, which is the
   * worst way for an accessibility fix to fail. It is not hypothetical: `auto-cal`'s `SelectField`
   * routes through a `Slot`, which has the same blind spot, and every select in that app is a
   * trigger with no `aria-invalid` and an error message nothing points at. Given a function, the
   * shell calls it with the props instead of guessing, and the caller spreads them where they go:
   *
   * ```tsx
   * controlSlot={(props) => (
   *   <Select>
   *     <SelectTrigger {...props}>…</SelectTrigger>
   *     …
   *   </Select>
   * )}
   * ```
   */
  controlSlot: SlotNode | ((props: ControlProps, parts: FieldParts) => SlotNode);
  /**
   * What the control is called, as a real `<FieldLabel htmlFor>`. Most of why this component
   * exists: a placeholder is not a label — it leaves at the first keystroke, and a field wearing
   * one is a field a screen reader announces as "edit text".
   */
  label?: ReactNode | undefined;
  /**
   * What to put in the field, or what changing it costs.
   *
   * Where it goes is {@link FormFieldProps.descriptionPlacement}, not a second prop: the sentence
   * is the same sentence either way, and it very often is not written here at all — it is a
   * GraphQL schema description, a JSON-schema `description`, a docstring off a generated type.
   * One prop is what lets a form pass `schema.fields[k].description` straight through and decide
   * separately whether this particular form has room to print it.
   */
  description?: ReactNode | undefined;
  /**
   * Where the description is drawn. `inline` puts it under the control; `popover` puts it behind
   * a small button beside the label.
   *
   * `popover` is for descriptions that came from somewhere else and are prose. A generated
   * schema writes a paragraph per field because it is documentation, and fifteen paragraphs
   * stacked down a form is a form nobody reads — but the paragraph is still the best answer to
   * "what is this?", so it should be one click away rather than deleted.
   *
   * It changes nothing about the wiring. The description is announced by the control either way,
   * because the text is always in the DOM either way — see the component note.
   */
  descriptionPlacement?: "inline" | "popover" | undefined;
  /** The `popover` trigger's glyph. Defaults to a question mark; an `Info` reads as less of a plea. */
  descriptionIconSlot?: SlotNode | undefined;
  /**
   * What is wrong with the value, as a node or a string. Falsy — `undefined`, `""`, whatever a
   * validator holds for a field that passed — draws nothing and leaves the control unmarked, so
   * a call site passes `errors.email?.message` straight in rather than branching around it.
   */
  error?: ReactNode | undefined;
  /**
   * Whether a value is needed. Draws the asterisk, and says so to assistive technology as
   * `aria-required`; the asterisk itself is decoration and stays out of the accessibility tree,
   * so the label still reads "Email" rather than "Email star".
   *
   * It deliberately does not set the native `required` attribute, which hands validation to the
   * browser — whose bubble appears somewhere other than where this field puts its `error`, and
   * which blocks a submit the caller may have wanted to make.
   */
  required?: boolean | undefined;
  /** The label row's far end. "Forgot password?", a character count, a reveal toggle. */
  actionSlot?: SlotNode | undefined;
  /**
   * Whether the value is still being fetched. On, a skeleton stands in for the control and
   * `error` is not consulted — a value that has not arrived is not a value that came back wrong.
   * The same ordering `CardLayout` makes between `loading` and `emptySlot`, one level down.
   *
   * The label and the description are still drawn, and drawn for real: they are literals the
   * form already knows, not data being waited on, so a field that hides them while loading is a
   * field whose label rail appears out of nowhere when the values land — which is the reflow the
   * skeleton was drawn to prevent.
   *
   * That is the part a hand-written loading state gets wrong. One app builds a whole second copy
   * of every form out of skeleton twins, so each form exists twice and the two drift; another
   * writes `{loading ? <Skeleton className="h-[42px]" /> : <input …/>}` inline, once, in one
   * field, and nowhere else. Here it is a boolean on the field that already knows its own box.
   */
  loading?: boolean | undefined;
  /**
   * The control's `id`, for a caller that already owns one — something else on the page points
   * at this control, or a form library minted it. Left off, the shell generates one, which is
   * what makes the same field safe to render twice on a page. A control the shell cannot reach
   * wants the function form of `controlSlot`, not this: an `htmlFor` alone points the label at the
   * right element and leaves the description and the error pointing at nothing.
   */
  htmlFor?: string | undefined;
  /**
   * Whether the control is a *group* of controls rather than one.
   *
   * A `RadioGroup` is a `<div role="radiogroup">`, a swatch grid is a row of buttons, a
   * segmented control is a set of toggles. None of them is labellable, so the `<label htmlFor>`
   * this shell draws by default points at an element the HTML spec says a label cannot name,
   * and the browser silently drops the association — a `for` that reads as wired and is not,
   * which is the exact failure the rest of this component exists to stop.
   *
   * On, the label is drawn as a `FieldTitle` — the same type, the same row, no `<label>` — and
   * the control is handed an `aria-labelledby` pointing at it instead of an `htmlFor` pointing
   * back. Everything else is unchanged: the description and the error still reach the group
   * through `aria-describedby`, which is valid on any element, and `required` still marks it.
   *
   * It needs the function form of `controlSlot`, because the name has to land on the element that
   * carries the `role`:
   *
   * ```tsx
   * <FormField
   *   asGroup
   *   label="Priority"
   *   controlSlot={(props) => (
   *     <RadioGroup {...props} value={value} onValueChange={onValueChange}>…</RadioGroup>
   *   )}
   * />
   * ```
   */
  asGroup?: boolean | undefined;
  /**
   * `horizontal` puts the control first and the label beside it, for the controls whose label is
   * part of the hit target: a checkbox, a switch. Stacked, a 16px box sits on a line of its own
   * above its own caption, which is the shape every app that hand-wrote one worked around
   * differently.
   *
   * These are `Field`'s own words and its own arrangement. Its third, `responsive`, is not
   * offered here: it switches on `@md/field-group`, so it silently behaves as `vertical` unless
   * the caller also wrapped the form in a `FieldGroup` — a prop that depends on an ancestor the
   * shell cannot see is a prop that does nothing most of the time it is passed.
   */
  orientation?: keyof typeof LOADING_BOX | undefined;
  className?: string | undefined;
  labelClassName?: string | undefined;
  descriptionClassName?: string | undefined;
  errorClassName?: string | undefined;
  /** Sizes the loading box for a control that is not input-height — a `<Textarea rows={6}>`. */
  loadingClassName?: string | undefined;
};

/**
 * One form field: the label, the control it names, a description, and the error. It composes
 * shadcn's `Field` parts and adds the wiring: a generated id, the label pointed at the control,
 * and an `aria-describedby` reaching whichever of the description and the error is on screen.
 *
 * `descriptionPlacement="popover"` still renders the text into an always-mounted `sr-only` span,
 * because Radix unmounts popover content when it closes. `asGroup` is for a control that is not
 * one element (a radio group, a swatch grid): the label becomes a `FieldTitle` and the group is
 * named by `aria-labelledby`. The field takes `error` as a node and never reads a form store, so
 * the binding to TanStack Form stays one layer up.
 */
export function FormField({
  controlSlot,
  label,
  description,
  descriptionPlacement = "inline",
  descriptionIconSlot,
  error,
  required = false,
  actionSlot,
  loading = false,
  htmlFor,
  asGroup = false,
  orientation = "vertical",
  className,
  labelClassName,
  descriptionClassName,
  errorClassName,
  loadingClassName,
}: FormFieldProps) {
  const reactId = useId();

  // A control keeps an `id` it arrived with: a caller that set one is a caller referencing it
  // from somewhere this shell cannot see.
  const renderControl = typeof controlSlot === "function" ? controlSlot : null;
  const element =
    !renderControl && isValidElement<Record<string, unknown>>(controlSlot) ? controlSlot : null;
  const givenId = typeof element?.props.id === "string" ? element.props.id : undefined;
  const controlId = htmlFor ?? givenId ?? reactId;

  // Suppressed while loading, so the field does not report a stale rejection of a value that is
  // on its way. It is also what keeps the message rail honest: `error` is the only part of the
  // field that is data rather than a literal.
  const shownError = loading ? null : error;

  // Derived from the control's id rather than minted separately, so that when something points
  // at the wrong element the three of them still read as one field in the DOM.
  const descriptionId = description ? `${controlId}-description` : undefined;
  const errorId = shownError ? `${controlId}-error` : undefined;
  // Minted whenever there is a label, but only *wired* in group mode: outside it the
  // `<label htmlFor>` is the association, and a second one pointing the other way is two names for
  // one control. The function form of `controlSlot` is handed it regardless, for a control with a
  // second part to name (see `FieldParts`).
  const labelId = label ? `${controlId}-label` : undefined;
  const groupLabelId = asGroup ? labelId : undefined;

  const rendered = renderControl
    ? renderControl(
        {
          id: controlId,
          "aria-labelledby": groupLabelId,
          "aria-describedby": [descriptionId, errorId].filter(Boolean).join(" ") || undefined,
          "aria-invalid": shownError ? true : undefined,
          "aria-required": required || undefined,
        },
        { labelId },
      )
    : controlSlot;
  const wired = element
    ? cloneElement(element, {
        id: controlId,
        "aria-labelledby": element.props["aria-labelledby"] ?? groupLabelId,
        // Appended, not replaced: a control already described by something outside this field —
        // a shared unit hint, a password policy — keeps it and gains these.
        "aria-describedby":
          [element.props["aria-describedby"], descriptionId, errorId].filter(Boolean).join(" ") ||
          undefined,
        // The caller's answer wins where it gave one, so a control a form library has already
        // marked keeps its mark and this only fills the gap.
        "aria-invalid": element.props["aria-invalid"] ?? (shownError ? true : undefined),
        "aria-required": element.props["aria-required"] ?? (required || undefined),
      })
    : rendered;

  const body = loading ? (
    <Skeleton
      data-slot="form-field-skeleton"
      aria-hidden
      className={cn(LOADING_BOX[orientation], loadingClassName)}
    />
  ) : (
    wired
  );

  // One child, so `FieldLabel`'s own `gap-2` — which is there for icons — is not spent between a
  // word and its asterisk.
  const labelText = required ? (
    <span className="min-w-0">
      {label}
      <span data-slot="form-field-required" aria-hidden="true" className="ml-0.5 text-negative">
        *
      </span>
    </span>
  ) : (
    label
  );

  // `FieldTitle` in group mode: the same type in the same place, drawn as a `<div>`, because the
  // element it names is one a `<label>` cannot name. Its `id` is what the group points back at.
  const drawnLabel = asGroup ? (
    <FieldTitle id={labelId} className={labelClassName}>
      {labelText}
    </FieldTitle>
  ) : (
    <FieldLabel
      id={labelId}
      // No control to point at while one is being drawn for. A `for` naming an element that is
      // not there is worse than no `for`: it reads as wired and is not.
      htmlFor={loading ? undefined : controlId}
      className={labelClassName}
    >
      {labelText}
    </FieldLabel>
  );
  const labelNode = label ? drawnLabel : null;

  // Beside the label rather than inside it: `FieldLabel` renders a real `<label>`, and a button
  // nested in one is a button whose click the label also claims.
  //
  // `type="button"` is not decoration. The default for a `<button>` inside a `<form>` is
  // `submit`, so a help icon written without it is a help icon that submits the form — which is
  // exactly how it is written by hand, because it works fine in the story and fails in the app.
  //
  // Radix gives the content `role="dialog"`, and a dialog with no accessible name is an axe
  // failure and a screen reader announcing "dialog" — so the trigger's name is reused for it
  // rather than left to the paragraph inside, which is the description, not the name.
  const helpName = typeof label === "string" ? `About ${label}` : "About this field";
  const help =
    description && descriptionPlacement === "popover" ? (
      <Popover>
        <PopoverTrigger asChild>
          <button
            data-slot="form-field-description-trigger"
            type="button"
            aria-label={helpName}
            className="shrink-0 rounded-full text-foreground/60 outline-none transition-colors hover:text-foreground focus-visible:text-foreground [&_svg]:size-3.5"
          >
            {descriptionIconSlot ?? <CircleQuestionMark aria-hidden />}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          aria-label={helpName}
          className="max-w-xs text-balance text-sm leading-relaxed"
        >
          {description}
        </PopoverContent>
      </Popover>
    ) : null;

  // Only drawn when there is a second thing on the row. A label on its own is the row.
  const header =
    help || actionSlot ? (
      <div data-slot="form-field-label-row" className="flex min-w-0 items-center gap-2">
        {labelNode}
        {help}
        {actionSlot ? (
          <div data-slot="form-field-action" className="ml-auto shrink-0">
            {actionSlot}
          </div>
        ) : null}
      </div>
    ) : (
      labelNode
    );

  const messages = (
    <>
      {description && descriptionPlacement === "inline" ? (
        <FieldDescription id={descriptionId} className={descriptionClassName}>
          {description}
        </FieldDescription>
      ) : null}
      {/* Behind a popover, the text still has to exist somewhere permanent for the control to be
          described by — Radix unmounts popover content on close, so a description living only
          there is one a screen reader can never reach. Same span, same id, same announcement;
          only the visible copy comes and goes. */}
      {description && descriptionPlacement === "popover" ? (
        <span id={descriptionId} className="sr-only">
          {description}
        </span>
      ) : null}
      {/* `FieldError` is already the `role="alert"` this shell used to draw by hand. Announcing
          matters more here than in shadcn's own forms: those sit downstream of react-hook-form,
          which moves focus to the first invalid field on a failed submit and gets the message
          read that way, and nothing in this shell moves focus. */}
      {shownError ? (
        <FieldError id={errorId} className={errorClassName}>
          {shownError}
        </FieldError>
      ) : null}
    </>
  );

  return (
    <Field
      orientation={orientation}
      // `Field` turns the whole field destructive from this attribute, which is the primitive's
      // own error state rather than one invented here.
      data-invalid={shownError ? true : undefined}
      className={cn("min-w-0", className)}
    >
      {orientation === "horizontal" ? (
        <>
          {body}
          {/* The label and its messages share a column beside the control, so the second line of
              a description starts under the label rather than under the checkbox. `Field`'s
              horizontal arrangement is written around this element being here. */}
          <FieldContent>
            {header}
            {messages}
          </FieldContent>
        </>
      ) : (
        <>
          {header}
          {body}
          {messages}
        </>
      )}
    </Field>
  );
}

/**
 * Turns the backtick spans in a schema description into `<code>`.
 *
 * {@link FormFieldProps.description} takes a `ReactNode` so a form can hand it
 * `schema.fields[k].description` straight through. The string that arrives has usually been
 * written for two readers at once — a GraphQL description, a JSON-schema `description`, a
 * docstring off a generated type all end up in front of a model as well as a person — and the
 * backticks are there for the model, which has no other way of being told that `ondemand` is a
 * value and not a word. Printed as they stand, they are stray punctuation in the middle of an
 * otherwise correct sentence. There is no wording that serves both readers, so this is the
 * adapter between them:
 *
 * ```tsx
 * <FormField label="Tool discovery" description={ticks(describe("Agent", "toolDiscovery"))} />
 * ```
 *
 * Backticks and nothing else. It is the one piece of markdown that turns up in a schema
 * description *because* it means something to both readers; the moment this parses emphasis or a
 * link it is a markdown renderer, and that belongs behind a library rather than in six lines here.
 *
 * An unpaired backtick stays the character it is rather than swallowing the rest of the sentence
 * into a `<code>`. A description is prose that has to survive however it was written, not markup
 * being validated.
 */
export function ticks(text: string): ReactNode {
  const parts = text.split("`");

  return parts.map((part, index) => {
    // An even part is plain prose. An odd one sat between two backticks — unless it is the last
    // one, in which case the tick that opened it never closed and was only ever a tick.
    if (index % 2 === 0) {
      return part;
    }
    if (index === parts.length - 1) {
      return `\`${part}`;
    }

    // No background. `code` in shadcn's docs is `bg-foreground/10`, and this lands inside a
    // `text-foreground/60` description — muted on muted is 4.34:1, under the 4.5 a body-size
    // string needs. Monospace at a hair under the surrounding size says the same thing and stays
    // readable. The size is there because a monospace face at `1em` reads larger than the sans
    // beside it.
    return (
      // biome-ignore lint/suspicious/noArrayIndexKey: a span of a split string has no identity but its position
      <code key={index} className="font-mono text-[0.9em]">
        {part}
      </code>
    );
  });
}
