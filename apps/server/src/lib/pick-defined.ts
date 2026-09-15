type PickedDefined<T, K extends keyof T> = { [P in K]?: Exclude<T[P], undefined> };

/**
 * Copy the listed keys whose value is not `undefined`. Admin update bodies are
 * partial, so a field the caller omitted has to stay absent from the row update
 * rather than travel on as an explicit write.
 */
export function pickDefined<T extends object, K extends keyof T>(
  source: T,
  keys: readonly K[],
): PickedDefined<T, K> {
  const picked: Partial<Pick<T, K>> = {};
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined) picked[key] = value;
  }
  // The loop drops every `undefined`, but TypeScript cannot carry that through a
  // narrowed generic `T[K]`, so the `Exclude` only shows up on the return type.
  return picked as PickedDefined<T, K>;
}
