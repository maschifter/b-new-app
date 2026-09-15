import {
  type TestStore,
  createTestQueryClient,
  createTestStore,
} from "@/test-utils/render-with-providers";
import {
  CURRENT_VERSION,
  DEFAULT_TEMPLATE_ID,
  type DecorationSnapshot,
} from "@bnewapp/studio-core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, renderHook, waitFor } from "@testing-library/react-native";
import { Provider } from "jotai";
import { queryClientAtom } from "jotai-tanstack-query";
import type { ReactNode } from "react";

import { useAuthSession } from "@/lib/auth/session-provider";
import { getStudioRoom, saveStudioRoom } from "../../api";
import { decorationAtom, syncedSnapshotAtom } from "../atoms";
import { StudioSync, useStudioVisitorCount } from "../studio-sync";

jest.mock("@/lib/auth/session-provider", () => ({ useAuthSession: jest.fn() }));
jest.mock("../../api", () => ({ getStudioRoom: jest.fn(), saveStudioRoom: jest.fn() }));
const mockedUseFocusEffect = jest.fn();
jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => mockedUseFocusEffect(effect),
}));

const mockedSession = useAuthSession as jest.Mock;
const mockedGetRoom = getStudioRoom as jest.Mock;
const mockedSaveRoom = saveStudioRoom as jest.Mock;

function snapshot(map: DecorationSnapshot["map"]): DecorationSnapshot {
  return { version: CURRENT_VERSION, templateId: DEFAULT_TEMPLATE_ID, map };
}

function room(map: DecorationSnapshot["map"]) {
  return {
    id: "room-1",
    ownerId: "user-1",
    snapshot: snapshot(map),
    updatedAt: "2026-08-10T00:00:00.000Z",
  };
}

// atomWithStorage only syncs with MMKV while mounted, so seed the raw room the
// same way a component does — through a live subscription (mirrors the provider
// test's helper).
function seedRoom(store: TestStore, ownerId: string, map: DecorationSnapshot["map"]) {
  const unsub = store.sub(decorationAtom(ownerId), () => {});
  store.set(decorationAtom(ownerId), snapshot(map));
  unsub();
}

function signedInAs(userId: string) {
  mockedSession.mockReturnValue({
    hydrated: true,
    session: { access_token: "token-abc", user: { id: userId } },
  });
}

function createQueryClient() {
  return createTestQueryClient({
    mutations: { gcTime: Number.POSITIVE_INFINITY, retry: false },
  });
}

function testStore(client = createQueryClient()): TestStore {
  return createTestStore({ queryClient: client }).store;
}

function mountSync(store: TestStore, ownerId: string, client = store.get(queryClientAtom)) {
  store.set(queryClientAtom, client);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </Provider>
  );
  return render(<StudioSync ownerId={ownerId} />, { wrapper });
}

const PUSH_TIMEOUT = { timeout: 3000 };

afterEach(() => {
  jest.clearAllMocks();
});

describe("studio sync", () => {
  it("distinguishes a pending visitor count from a confirmed empty room", async () => {
    signedInAs("user-1");
    let resolveRoom: ((value: null) => void) | undefined;
    mockedGetRoom.mockReturnValue(
      new Promise((resolve) => {
        resolveRoom = resolve;
      }),
    );
    const client = createQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useStudioVisitorCount("user-1"), { wrapper });

    expect(result.current).toBeUndefined();
    const finishRoomRequest = resolveRoom;
    if (!finishRoomRequest) throw new Error("Expected visitor count request to start");
    act(() => finishRoomRequest(null));
    await waitFor(() => expect(result.current).toBe(0));
  });

  it("refetches the visitor count whenever Studio receives focus", async () => {
    signedInAs("user-1");
    mockedGetRoom
      .mockResolvedValueOnce({ ...room({}), visitorCount: 3 })
      .mockResolvedValueOnce({ ...room({}), visitorCount: 4 });
    const client = createQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useStudioVisitorCount("user-1"), { wrapper });

    await waitFor(() => expect(result.current).toBe(3));
    const focusEffect = mockedUseFocusEffect.mock.calls.at(-1)?.[0] as (() => void) | undefined;
    if (!focusEffect) throw new Error("Expected Studio focus effect to be registered");
    act(() => focusEffect());
    await waitFor(() => expect(result.current).toBe(4));
  });

  it("pulls the server room when the local room is untouched", async () => {
    signedInAs("user-1");
    mockedGetRoom.mockResolvedValue(room({ "floor-main": { source: "catalog", id: "stage" } }));
    const store = testStore();

    mountSync(store, "user-1");

    await waitFor(() =>
      expect(store.get(decorationAtom("user-1")).map).toEqual({
        "floor-main": { source: "catalog", id: "stage" },
      }),
    );
    expect(store.get(syncedSnapshotAtom("user-1"))).toBe(
      JSON.stringify(snapshot({ "floor-main": { source: "catalog", id: "stage" } })),
    );
    // Nothing was dirty, so it never pushed the pulled room back.
    expect(mockedSaveRoom).not.toHaveBeenCalled();
  });

  it("does not push a pulled dynamic item while the remote catalog is still loading", async () => {
    signedInAs("user-catalog-race");
    const remoteSnapshot = snapshot({
      "decor-1": { source: "catalog", id: "remote-plant" },
    });
    mockedGetRoom.mockResolvedValue({
      ...room(remoteSnapshot.map),
      ownerId: "user-catalog-race",
      snapshot: remoteSnapshot,
    });
    const store = testStore();

    mountSync(store, "user-catalog-race");

    await waitFor(() =>
      expect(store.get(syncedSnapshotAtom("user-catalog-race"))).toBe(
        JSON.stringify(remoteSnapshot),
      ),
    );
    // The bundled fallback cannot render an admin-added item, but that temporary
    // catalog view must not make the pulled source snapshot look locally dirty.
    expect(store.get(decorationAtom("user-catalog-race")).map).toEqual({});
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(mockedSaveRoom).not.toHaveBeenCalled();
  });

  it("refetches the room when Studio remounts after a new login", async () => {
    signedInAs("user-refetch");
    const client = createQueryClient();
    const store = testStore(client);
    mockedGetRoom.mockResolvedValueOnce(room({ "floor-main": { source: "catalog", id: "stage" } }));

    const firstMount = mountSync(store, "user-refetch", client);
    await waitFor(() =>
      expect(store.get(decorationAtom("user-refetch")).map).toEqual({
        "floor-main": { source: "catalog", id: "stage" },
      }),
    );
    firstMount.unmount();

    mockedGetRoom.mockResolvedValueOnce(room({ "wall-art": { source: "catalog", id: "mirror" } }));
    mountSync(store, "user-refetch", client);

    await waitFor(() =>
      expect(store.get(decorationAtom("user-refetch")).map).toEqual({
        "wall-art": { source: "catalog", id: "mirror" },
      }),
    );
    expect(mockedGetRoom).toHaveBeenCalledTimes(2);
  });

  it("keeps local edits and pushes them when the local room is dirty", async () => {
    signedInAs("user-1");
    mockedGetRoom.mockResolvedValue(room({ "wall-art": { source: "catalog", id: "mirror" } }));
    mockedSaveRoom.mockImplementation((_token, next) => Promise.resolve(room(next.map)));
    const store = testStore();
    seedRoom(store, "user-1", { "decor-2": { source: "catalog", id: "plant" } });

    mountSync(store, "user-1");

    await waitFor(() => expect(mockedSaveRoom).toHaveBeenCalledTimes(1), PUSH_TIMEOUT);
    // The server room was ignored — local edits win — and the local room was
    // pushed up untouched.
    expect(mockedSaveRoom.mock.calls[0][1].map).toEqual({
      "decor-2": { source: "catalog", id: "plant" },
    });
    expect(store.get(decorationAtom("user-1")).map).toEqual({
      "decor-2": { source: "catalog", id: "plant" },
    });
    expect(store.get(syncedSnapshotAtom("user-1"))).toBe(
      JSON.stringify(snapshot({ "decor-2": { source: "catalog", id: "plant" } })),
    );
  });

  it("adopts the server-reconciled snapshot without re-pushing (no loop)", async () => {
    signedInAs("user-1");
    mockedGetRoom.mockResolvedValue(null);
    // Server returns a different (reconciled) snapshot than we sent.
    mockedSaveRoom.mockResolvedValue(
      room({ "ceiling-light": { source: "catalog", id: "spotlight" } }),
    );
    const store = testStore();
    seedRoom(store, "user-1", { "decor-2": { source: "catalog", id: "plant" } });

    mountSync(store, "user-1");

    await waitFor(() => expect(mockedSaveRoom).toHaveBeenCalledTimes(1), PUSH_TIMEOUT);
    // Local converges to the server's version...
    await waitFor(() =>
      expect(store.get(decorationAtom("user-1")).map).toEqual({
        "ceiling-light": { source: "catalog", id: "spotlight" },
      }),
    );
    expect(store.get(syncedSnapshotAtom("user-1"))).toBe(
      JSON.stringify(snapshot({ "ceiling-light": { source: "catalog", id: "spotlight" } })),
    );
    // ...and does not push the adopted snapshot back again.
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(mockedSaveRoom).toHaveBeenCalledTimes(1);
  });

  it("preserves an edit made while an earlier push is in flight", async () => {
    signedInAs("user-1");
    mockedGetRoom.mockResolvedValue(null);
    const firstSnapshot = snapshot({ "decor-2": { source: "catalog", id: "plant" } });
    const newerSnapshot = snapshot({ "ceiling-light": { source: "catalog", id: "spotlight" } });
    let resolveFirstSave: ((value: ReturnType<typeof room>) => void) | undefined;
    mockedSaveRoom
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirstSave = resolve;
          }),
      )
      .mockImplementation((_token, next) => Promise.resolve(room(next.map)));
    const store = testStore();
    seedRoom(store, "user-1", firstSnapshot.map);

    mountSync(store, "user-1");

    await waitFor(() => expect(mockedSaveRoom).toHaveBeenCalledTimes(1), PUSH_TIMEOUT);
    act(() => store.set(decorationAtom("user-1"), newerSnapshot));
    const firstSave = resolveFirstSave;
    if (!firstSave) throw new Error("First save did not start");
    act(() => firstSave(room(firstSnapshot.map)));

    await waitFor(() => expect(mockedSaveRoom).toHaveBeenCalledTimes(2), PUSH_TIMEOUT);
    expect(mockedSaveRoom.mock.calls[1][1]).toEqual(newerSnapshot);
    await waitFor(() =>
      expect(store.get(syncedSnapshotAtom("user-1"))).toBe(JSON.stringify(newerSnapshot)),
    );
    expect(store.get(decorationAtom("user-1"))).toEqual(newerSnapshot);
  });

  it("retries a failed push when the connection recovers", async () => {
    signedInAs("user-1");
    mockedGetRoom.mockResolvedValue(null);
    mockedSaveRoom.mockRejectedValueOnce(new Error("Offline"));
    mockedSaveRoom.mockImplementation((_token, next) => Promise.resolve(room(next.map)));
    const store = testStore();
    seedRoom(store, "user-1", { "decor-2": { source: "catalog", id: "plant" } });

    mountSync(store, "user-1");

    await waitFor(() => expect(mockedSaveRoom).toHaveBeenCalledTimes(1), PUSH_TIMEOUT);
    await waitFor(() => expect(mockedSaveRoom).toHaveBeenCalledTimes(2), PUSH_TIMEOUT);
    expect(mockedSaveRoom.mock.calls[1][1].map).toEqual({
      "decor-2": { source: "catalog", id: "plant" },
    });
  });

  it("does nothing for a room that is not the signed-in user's", async () => {
    signedInAs("user-2");
    mockedGetRoom.mockResolvedValue(room({}));
    const store = testStore();

    mountSync(store, "user-1");

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockedGetRoom).not.toHaveBeenCalled();
    expect(mockedSaveRoom).not.toHaveBeenCalled();
  });
});
