import { isUuidParam } from "../uuid-param";

it("accepts a canonical uuid in either case", () => {
  expect(isUuidParam("00000000-0000-4000-8000-000000000001")).toBe(true);
  expect(isUuidParam("00000000-0000-4000-8000-00000000000A")).toBe(true);
});

it("rejects anything that is not exactly a uuid", () => {
  expect(isUuidParam("not-a-uuid")).toBe(false);
  expect(isUuidParam("00000000-0000-4000-8000-000000000001 ")).toBe(false);
  expect(isUuidParam("/00000000-0000-4000-8000-000000000001")).toBe(false);
  expect(isUuidParam(undefined)).toBe(false);
  expect(isUuidParam(123)).toBe(false);
});
