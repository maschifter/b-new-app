import { z } from "zod";

export const ListQuery = z.object({
  sort: z.string().optional(),
  range: z.string().optional(),
  filter: z.string().optional(),
});

const MAX_LIST_PAGE_SIZE = 100;
const ListRange = z
  .tuple([
    z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  ])
  .refine(([start, end]) => end >= start, { message: "Range end must not precede start" })
  .refine(([start, end]) => end - start + 1 <= MAX_LIST_PAGE_SIZE, {
    message: `Range cannot exceed ${MAX_LIST_PAGE_SIZE} records`,
  });
const ListSort = z.tuple([z.string().min(1), z.enum(["ASC", "DESC"])]);
const ListFilter = z.object({}).catchall(z.unknown());

export interface ParsedListQuery {
  start: number;
  end: number;
  sort: string;
  order: "asc" | "desc";
  filter: Record<string, unknown>;
}

function parseJson(value: string): unknown {
  return JSON.parse(value);
}

export function parseListQuery(raw: unknown, fallbackSort = "created_at"): ParsedListQuery {
  const query = ListQuery.parse(raw);
  const [start, inclusiveEnd] = query.range
    ? ListRange.parse(parseJson(query.range))
    : [0, 24];
  const [sort, rawOrder] = query.sort
    ? ListSort.parse(parseJson(query.sort))
    : [fallbackSort, "DESC"];
  const filter = query.filter ? ListFilter.parse(parseJson(query.filter)) : {};
  const end = inclusiveEnd + 1;
  const order = rawOrder === "ASC" ? "asc" : "desc";

  return { start, end, sort, order, filter };
}

export function contentRange(
  resource: string,
  start: number,
  rowCount: number,
  total: number,
): string {
  const end = Math.max(start + rowCount - 1, start);
  return `${resource} ${start}-${end}/${total}`;
}
