import { CURRENT_VERSION, DEFAULT_TEMPLATE_ID } from "@bnewapp/studio-core";
import type { ExploreRoom, ExploreRoomsPage } from "@bnewapp/types";
import { QueryClient } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Provider, createStore } from "jotai";
import { queryClientAtom } from "jotai-tanstack-query";

import { queryAuthAtom } from "@/lib/auth/query-auth-atom";
import { getExploreRooms } from "../../api";
import { ExploreScreen } from "../explore-screen";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock("../../api", () => ({ getExploreRooms: jest.fn(), getExploreRoom: jest.fn() }));

const mockedGetRooms = getExploreRooms as jest.Mock;

function cursor(id: string) {
  return { updatedAt: "2026-08-01T00:00:00.000Z", id };
}

function room(ownerId: string): ExploreRoom {
  return {
    ownerId,
    username: `dancer-${ownerId}`,
    snapshot: { version: CURRENT_VERSION, templateId: DEFAULT_TEMPLATE_ID, map: {} },
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
}

function page(items: ExploreRoom[], nextId: string | null): ExploreRoomsPage {
  return { items, nextCursor: nextId ? cursor(nextId) : null };
}

// Serve pages keyed by the requested cursor id ("start" for the first page) and
// record every requested key so a cursor re-request shows up as a duplicate.
function serve(pages: Record<string, ExploreRoomsPage>): string[] {
  const requested: string[] = [];
  mockedGetRooms.mockImplementation((_token: string, opts: { cursor?: { id: string } } = {}) => {
    const key = opts.cursor ? opts.cursor.id : "start";
    requested.push(key);
    const next = pages[key];
    return next ? Promise.resolve(next) : Promise.reject(new Error(`no page for ${key}`));
  });
  return requested;
}

function mountExplore() {
  const store = createStore();
  store.set(
    queryClientAtom,
    new QueryClient({
      defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY, retry: false } },
    }),
  );
  store.set(queryAuthAtom, { userId: "viewer", accessToken: "token" });
  render(
    <Provider store={store}>
      <ExploreScreen />
    </Provider>,
  );
}

function label(ownerId: string): string {
  return `Visit dancer-${ownerId}'s studio`;
}

beforeEach(() => {
  mockedGetRooms.mockReset();
});

it("shows the skeleton while the first page is loading", () => {
  mockedGetRooms.mockReturnValue(new Promise(() => {}));
  mountExplore();
  expect(screen.getByTestId("explore-skeleton", { includeHiddenElements: true })).toBeTruthy();
});

it("renders a card per room once the first page resolves", async () => {
  const requested = serve({ start: page([room("a"), room("b")], null) });
  mountExplore();

  await screen.findByLabelText(label("a"));
  expect(screen.getByLabelText(label("b"))).toBeTruthy();
  expect(requested).toEqual(["start"]);
});

it("shows the empty state and stops when every page reconciles to nothing", async () => {
  const requested = serve({
    start: page([], "c1"),
    c1: page([], "c2"),
    c2: page([], null),
  });
  mountExplore();

  await screen.findByText("No studios yet");
  await waitFor(() => expect(requested).toEqual(["start", "c1", "c2"]));
});

it("advances past an initial empty page to the first page with items", async () => {
  const requested = serve({ start: page([], "c1"), c1: page([room("z")], null) });
  mountExplore();

  await screen.findByLabelText(label("z"));
  expect(screen.queryByText("No studios yet")).toBeNull();
  expect(requested).toEqual(["start", "c1"]);
});

it("does not show the empty state while advancing past an empty page", async () => {
  const requested: string[] = [];
  mockedGetRooms.mockImplementation(
    (_token: string, opts: { cursor?: { id: string } } = {}) => {
      const key = opts.cursor ? opts.cursor.id : "start";
      requested.push(key);
      return key === "start" ? Promise.resolve(page([], "c1")) : new Promise(() => {});
    },
  );
  mountExplore();

  await waitFor(() => expect(requested).toEqual(["start", "c1"]));
  expect(screen.queryByText("No studios yet")).not.toBeOnTheScreen();
  expect(screen.getByTestId("explore-footer")).toBeOnTheScreen();
});

it("advances through an empty middle page after loading more, without re-requesting a cursor", async () => {
  const requested = serve({
    start: page([room("a")], "c1"),
    c1: page([], "c2"),
    c2: page([room("b")], null),
  });
  mountExplore();

  await screen.findByLabelText(label("a"));
  expect(requested).toEqual(["start"]);

  act(() => {
    screen.getByTestId("explore-list").props.onEndReached();
  });

  await screen.findByLabelText(label("b"));
  expect(screen.getByLabelText(label("a"))).toBeTruthy();
  await waitFor(() => expect(requested).toEqual(["start", "c1", "c2"]));
});

it("shows the footer spinner while the next page is in flight", async () => {
  let resolveNext: ((page: ExploreRoomsPage) => void) | undefined;
  mockedGetRooms.mockImplementation((_token: string, opts: { cursor?: { id: string } } = {}) => {
    if (!opts.cursor) return Promise.resolve(page([room("a")], "c1"));
    return new Promise<ExploreRoomsPage>((resolve) => {
      resolveNext = resolve;
    });
  });
  mountExplore();

  await screen.findByLabelText(label("a"));
  act(() => {
    screen.getByTestId("explore-list").props.onEndReached();
  });

  await screen.findByTestId("explore-footer");
  act(() => resolveNext?.(page([room("b")], null)));
  await screen.findByLabelText(label("b"));
});

it("stops auto-advancing after a next-page error and retries only on request", async () => {
  const requested: string[] = [];
  let nextAttempt = 0;
  mockedGetRooms.mockImplementation((_token: string, opts: { cursor?: { id: string } } = {}) => {
    const key = opts.cursor ? opts.cursor.id : "start";
    requested.push(key);
    if (key === "start") return Promise.resolve(page([], "c1"));
    nextAttempt += 1;
    return nextAttempt === 1
      ? Promise.reject(new Error("boom"))
      : Promise.resolve(page([room("recovered")], null));
  });
  mountExplore();

  const retry = await screen.findByLabelText("Retry loading more studios");
  expect(requested).toEqual(["start", "c1"]);

  fireEvent.press(retry);

  await screen.findByLabelText(label("recovered"));
  expect(requested).toEqual(["start", "c1", "c1"]);
});

it("shows an error state with a retry when the first page fails", async () => {
  mockedGetRooms.mockRejectedValue(new Error("boom"));
  mountExplore();

  await screen.findByText("Couldn't load studios");
  expect(screen.getByLabelText("Retry loading studios")).toBeTruthy();
});
