export function messageOf(error: unknown): string | undefined {
  if (error == null) {
    return undefined;
  }
  if (typeof error === "string") {
    return error;
  }
  if (typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return String(error);
}
