export function parseNumber(text: string, integer = false): number | null {
  const trimmed = text.trim();
  if (trimmed === "") {
    return null;
  }
  const parsed = Number(trimmed);
  if (integer) {
    return Number.isInteger(parsed) ? parsed : null;
  }
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The text a number box draws: the draft while it still means the stored number, the stored number
 * otherwise.
 *
 * The second half is what lets a value replaced from outside win. After a `form.reset()` or a
 * `setFieldValue` the draft no longer parses to what is stored, so it is dropped without anyone
 * having to clear it.
 *
 * @param draft - What was last typed, or `undefined` when the box is not being typed in.
 * @param stored - The number the form holds, `null` for none.
 * @param integer - Whether the box takes only whole numbers, as {@link parseNumber} reads it.
 * @returns The text for the box's `value`.
 */
export function numberText(
  draft: string | undefined,
  stored: number | null,
  integer = false,
): string {
  // `String`, not the raw number: `TextInput` takes only a string, so `Input` does on both halves.
  const storedText = stored === null ? "" : String(stored);
  if (draft !== undefined && parseNumber(draft, integer) === stored) {
    return draft;
  }
  return storedText;
}
