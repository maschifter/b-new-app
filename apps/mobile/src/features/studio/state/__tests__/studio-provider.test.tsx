import { type TestStore, createTestStore } from "@/test-utils/render-with-providers";
import { queryAuthAtom } from "@bnewapp/mobile-kit";
import type { StudioCatalog } from "@bnewapp/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Provider } from "jotai";
import { queryClientAtom } from "jotai-tanstack-query";
import { ItemPicker } from "../../ui/item-picker";
import { StudioStage } from "../../ui/studio-stage";
import { decorationAtom } from "../atoms";
import { type StudioApi, StudioProvider, useStudio } from "../studio-provider";

const UPLOADED_CATALOG: StudioCatalog = {
  version: 1,
  items: [
    {
      id: "plant",
      tags: { type: "decor", size: "S" },
      name: "Plant",
      status: "published",
      access: "free",
      art: { url: "https://example.com/plant.webp" },
    },
  ],
};

function testStore(): TestStore {
  return createTestStore().store;
}

// atomWithStorage only syncs with MMKV while mounted, so seed/read the raw room
// through a subscription — the same way components mount the atom in the app.
function withRoom<T>(store: TestStore, ownerId: string, run: () => T): T {
  const unsub = store.sub(decorationAtom(ownerId), () => {});
  try {
    return run();
  } finally {
    unsub();
  }
}

function Harness() {
  const { state, template, selectSpot } = useStudio();
  return (
    <>
      <StudioStage
        template={template}
        map={state.map}
        mode={state.mode}
        selectedSpotId={state.selectedSpotId}
        onSelectSpot={selectSpot}
      />
      <ItemPicker />
    </>
  );
}

function mountStudio(store: TestStore, ownerId: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: Number.POSITIVE_INFINITY,
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
      },
    },
  });
  store.set(queryClientAtom, queryClient);
  const inventoryUserId = "studio-persistence-inventory-user";
  store.set(queryAuthAtom, { userId: inventoryUserId, accessToken: "token" });
  queryClient.setQueryData(["studio-catalog", inventoryUserId], UPLOADED_CATALOG);
  queryClient.setQueryData(["shop-inventory", inventoryUserId], {
    items: [{ itemId: "plant", acquiredAt: "2026-08-24T08:00:00.000Z" }],
  });
  const tree = (nextOwnerId: string) => (
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>
        <StudioProvider ownerId={nextOwnerId}>
          <Harness />
        </StudioProvider>
      </Provider>
    </QueryClientProvider>
  );
  const view = render(tree(ownerId));
  // The stage only renders spots once it has measured a non-zero size.
  fireEvent(screen.getByTestId("studio-stage"), "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 844 } },
  });
  return { ...view, rerenderOwner: (nextOwnerId: string) => view.rerender(tree(nextOwnerId)) };
}

describe("studio persistence (jotai + mmkv)", () => {
  it("persists an edit synchronously and restores it when remounted for the same owner", () => {
    const ownerId = "user-1";

    const first = mountStudio(testStore(), ownerId);
    fireEvent.press(screen.getByLabelText("Spot decor-1"));
    fireEvent.press(screen.getByText("Plant"));

    // MMKV writes are synchronous — the room is already saved. Remount with a
    // fresh store (relaunch) reading the same MMKV, and the room comes back.
    first.unmount();
    mountStudio(testStore(), ownerId);
    expect(screen.getByTestId("spot-content-decor-1")).toBeTruthy();
    expect(screen.queryByTestId("spot-empty-decor-1")).toBeNull();
  });

  it("does not write over another owner's room", () => {
    const seed = testStore();
    withRoom(seed, "user-1", () =>
      seed.set(decorationAtom("user-1"), {
        version: 1,
        templateId: "studio-room-1",
        map: { "decor-1": { source: "catalog", id: "plant" } },
      }),
    );

    // A different owner starts empty and must not clobber user-1.
    mountStudio(testStore(), "user-2");
    expect(screen.getByTestId("spot-empty-decor-1")).toBeTruthy();

    const check = testStore();
    const user1 = withRoom(check, "user-1", () => check.get(decorationAtom("user-1")).map);
    expect(user1).toEqual({ "decor-1": { source: "catalog", id: "plant" } });
  });

  it("closes the picker when the owner changes", () => {
    const store = testStore();
    const view = mountStudio(store, "user-1");

    fireEvent.press(screen.getByLabelText("Spot decor-1"));
    expect(screen.getByText("Plant")).toBeOnTheScreen();

    view.rerenderOwner("user-2");

    expect(screen.queryByText("Plant")).not.toBeOnTheScreen();
    // A fresh owner opens onto the first-run empty room, not user-1's state.
    expect(store.get(decorationAtom("user-2")).map).toEqual({});
  });

  it("ignores assign and clear outside edit mode", () => {
    let api: StudioApi | undefined;
    function Capture() {
      api = useStudio();
      return null;
    }

    const seed = testStore();
    withRoom(seed, "user-x", () =>
      seed.set(decorationAtom("user-x"), {
        version: 1,
        templateId: "studio-room-1",
        map: { "decor-1": { source: "catalog", id: "plant" } },
      }),
    );

    const store = testStore();
    render(
      <Provider store={store}>
        <StudioProvider ownerId="user-x" mode="visit">
          <Capture />
        </StudioProvider>
      </Provider>,
    );

    act(() => api?.assign("decor-2", { source: "catalog", id: "trophy" }));
    act(() => api?.clear("decor-1"));

    // Nothing changed: visit mode is read-only. Capture keeps the atom mounted,
    // so the store reflects the MMKV-synced room.
    expect(store.get(decorationAtom("user-x")).map).toEqual({
      "decor-1": { source: "catalog", id: "plant" },
    });
  });
});
