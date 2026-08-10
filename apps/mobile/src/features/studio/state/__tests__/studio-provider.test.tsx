import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { createMemoryRepository } from "../../storage/memory-repository";
import type { DecorationRepository } from "../../storage/repository";
import { ItemPicker } from "../../ui/item-picker";
import { StudioStage } from "../../ui/studio-stage";
import { StudioProvider, useStudio } from "../studio-provider";

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

async function mountStudio(repository: DecorationRepository, ownerId: string) {
  const view = render(
    <StudioProvider ownerId={ownerId} repository={repository}>
      <Harness />
    </StudioProvider>,
  );
  await act(async () => {}); // flush load pipeline
  fireEvent(screen.getByTestId("studio-stage"), "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 844 } },
  });
  return view;
}

describe("StudioProvider persistence", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("autosaves an edit and restores it when remounted for the same owner", async () => {
    const repository = createMemoryRepository();
    const ownerId = "user-1";

    const first = await mountStudio(repository, ownerId);
    fireEvent.press(screen.getByLabelText("Spot decor-1"));
    fireEvent.press(screen.getByText("Plant"));

    // Debounced autosave fires after the delay; flush the save promise too.
    await act(async () => {
      jest.advanceTimersByTime(700);
    });
    await act(async () => {});

    const saved = await repository.load(ownerId);
    expect(saved?.map["decor-1"]).toEqual({ source: "catalog", id: "plant" });

    // Remount (simulating relaunch) -> the room is restored from storage.
    first.unmount();
    await mountStudio(repository, ownerId);
    const block = screen.getByTestId("spot-content-decor-1");
    expect(within(block).getByText("Plant")).toBeTruthy();
  });

  it("does not autosave over another owner's empty room", async () => {
    const repository = createMemoryRepository({
      "user-1": {
        version: 1,
        templateId: "studio-room-1",
        map: { "decor-1": { source: "catalog", id: "plant" } },
      },
    });

    // A different owner starts empty and must not clobber user-1.
    await mountStudio(repository, "user-2");
    await act(async () => {
      jest.advanceTimersByTime(700);
    });
    await act(async () => {});

    expect(await repository.load("user-1")).not.toBeNull();
    expect(await repository.load("user-2")).toBeNull();
  });

  it("does not save a dirty room under a new owner after ownerId changes", async () => {
    const repository = createMemoryRepository();
    const view = await mountStudio(repository, "user-1");

    fireEvent.press(screen.getByLabelText("Spot decor-1"));
    fireEvent.press(screen.getByText("Plant"));

    view.rerender(
      <StudioProvider ownerId="user-2" repository={repository}>
        <Harness />
      </StudioProvider>,
    );

    await act(async () => {
      jest.advanceTimersByTime(700);
    });
    await act(async () => {});

    expect(await repository.load("user-2")).toBeNull();
  });

  it("saves a later edit when an earlier save resolves after it", async () => {
    let resolveFirstSave: (() => void) | undefined;
    const savedSnapshots: Parameters<DecorationRepository["save"]>[1][] = [];
    const repository: DecorationRepository = {
      async load() {
        return null;
      },
      save(_ownerId, snapshot) {
        savedSnapshots.push(snapshot);
        return new Promise((resolve) => {
          if (!resolveFirstSave) resolveFirstSave = resolve;
        });
      },
    };

    await mountStudio(repository, "user-1");
    fireEvent.press(screen.getByLabelText("Spot decor-1"));
    fireEvent.press(screen.getByText("Plant"));

    await act(async () => {
      jest.advanceTimersByTime(700);
    });

    fireEvent.press(screen.getByLabelText("Spot decor-2"));
    fireEvent.press(screen.getByText("Trophy"));

    await act(async () => {
      resolveFirstSave?.();
    });
    await act(async () => {
      jest.advanceTimersByTime(700);
    });

    expect(savedSnapshots).toHaveLength(2);
    expect(savedSnapshots[1]?.map).toEqual({
      "decor-1": { source: "catalog", id: "plant" },
      "decor-2": { source: "catalog", id: "trophy" },
    });
  });
});
