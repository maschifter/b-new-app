import { vi } from "vitest";

export interface QueryResult {
  data?: unknown;
  error?: unknown;
  count?: number;
}

export type QueryBuilderMock = Record<string, ReturnType<typeof vi.fn>>;

const CHAINABLE_METHODS = [
  "delete",
  "eq",
  "gte",
  "ilike",
  "in",
  "insert",
  "is",
  "limit",
  "lt",
  "lte",
  "neq",
  "not",
  "or",
  "order",
  "range",
  "select",
  "update",
  "upsert",
] as const;

// A chainable Supabase query builder mock. Every filter/order/write method returns
// the builder, `single()`/`maybeSingle()` resolve the result, and the builder is
// itself a thenable so an awaited terminal chain resolves the result too.
//
// `gate` defers every resolution until it settles, which the job-queue tests use to
// hold a claim open while a second worker races for the same row.
export function queryBuilder(result: QueryResult, gate?: Promise<void>): QueryBuilderMock {
  const query: QueryBuilderMock = {};
  const chain = () => query;
  for (const method of CHAINABLE_METHODS) {
    query[method] = vi.fn(chain);
  }
  const settle = gate
    ? async () => {
        await gate;
        return result;
      }
    : () => Promise.resolve(result);
  query.single = vi.fn(settle);
  query.maybeSingle = vi.fn(settle);
  // biome-ignore lint/suspicious/noThenProperty: mirrors Supabase's awaitable query builder
  query.then = vi.fn((onfulfilled: (value: unknown) => unknown) => settle().then(onfulfilled));
  return query;
}
