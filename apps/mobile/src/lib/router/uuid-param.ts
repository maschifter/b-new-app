const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Guards a route param before it is used as a resource id or a query key. */
export function isUuidParam(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}
