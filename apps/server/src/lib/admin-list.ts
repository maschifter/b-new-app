/** Ignore a sort column the resource does not expose, rather than passing it to PostgREST. */
export function sortColumn(sort: string, sortable: ReadonlySet<string>, fallback: string): string {
  return sortable.has(sort) ? sort : fallback;
}

/**
 * Strip the characters PostgREST reads as filter syntax, so a search term cannot break
 * out of the `ilike`/`or` clause it gets interpolated into. Returns undefined when
 * nothing searchable is left.
 */
export function searchTerm(q: string | undefined): string | undefined {
  const term = q?.replace(/[,%]/g, "").trim();
  return term ? term : undefined;
}

/** react-admin sends a half-open [start, end) range; PostgREST's `range()` is inclusive. */
export function rangeEnd(start: number, end: number): number {
  return Math.max(end - 1, start);
}
