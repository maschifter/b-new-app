import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Provider, createStore } from "jotai";
import { ItemPicker } from "../../ui/item-picker";
import { StudioStage } from "../../ui/studio-stage";
import { decorationAtom } from "../atoms";
import { type StudioApi, StudioProvider, useStudio } from "../studio-provider";

type Store = ReturnType<typeof createStore>;

// atomWithStorage only syncs with MMKV while mounted, so seed/read the raw room
// through a subscription — the same way components mount the atom in the app.
function withRoom<T>(store: Store, ownerId: string, run: () => T): T {
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

function mountStudio(store: ReturnType<typeof createStore>, ownerId: string) {
  const view = render(
    <Provider store={store}>
      <StudioProvider ownerId={ownerId}>
        <Harness />
      </StudioProvider>
    </Provider>,
  );
  // The stage only renders spots once it has measured a non-zero size.
  fireEvent(screen.getByTestId("studio-stage"), "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 844 } },
  });
  return view;
}

describe("studio persistence (jotai + mmkv)", () => {
  it("persists an edit synchronously and restores it when remounted for the same owner", () => {
    const ownerId = "user-1";

    const first = mountStudio(createStore(), ownerId);
    fireEvent.press(screen.getByLabelText("Spot decor-1"));
    fireEvent.press(screen.getByText("Plant"));

    // MMKV writes are synchronous — the room is already saved. Remount with a
    // fresh store (relaunch) reading the same MMKV, and the room comes back.
    first.unmount();
    mountStudio(createStore(), ownerId);
    expect(screen.getByTestId("spot-content-decor-1")).toBeTruthy();
    expect(screen.queryByTestId("spot-empty-decor-1")).toBeNull();
  });

  it("does not write over another owner's room", () => {
    const seed = createStore();
    withRoom(seed, "user-1", () =>
      seed.set(decorationAtom("user-1"), {
        version: 1,
        templateId: "studio-room-1",
        map: { "decor-1": { source: "catalog", id: "plant" } },
      }),
    );

    // A different owner starts empty and must not clobber user-1.
    mountStudio(createStore(), "user-2");
    expect(screen.getByTestId("spot-empty-decor-1")).toBeTruthy();

    const check = createStore();
    const user1 = withRoom(check, "user-1", () => check.get(decorationAtom("user-1")).map);
    expect(user1).toEqual({ "decor-1": { source: "catalog", id: "plant" } });
  });

  it("closes the picker when the owner changes", () => {
    const store = createStore();
    const view = mountStudio(store, "user-1");

    fireEvent.press(screen.getByLabelText("Spot decor-1"));
    expect(screen.getByText("Plant")).toBeOnTheScreen();

    view.rerender(
      <Provider store={store}>
        <StudioProvider ownerId="user-2">
          <Harness />
        </StudioProvider>
      </Provider>,
    );

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

    const seed = createStore();
    withRoom(seed, "user-x", () =>
      seed.set(decorationAtom("user-x"), {
        version: 1,
        templateId: "studio-room-1",
        map: { "decor-1": { source: "catalog", id: "plant" } },
      }),
    );

    const store = createStore();
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
