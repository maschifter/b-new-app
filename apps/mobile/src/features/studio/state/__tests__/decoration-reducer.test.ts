import type { DecorationSnapshot } from "../../domain/types";
import { type StudioState, decorationReducer, initStudioState } from "../decoration-reducer";

const snapshot: DecorationSnapshot = { version: 1, templateId: "room-1", map: {} };

function editState(overrides: Partial<StudioState> = {}): StudioState {
  return { ...initStudioState(snapshot, "edit"), ...overrides };
}

describe("decorationReducer", () => {
  it("selects and deselects a spot", () => {
    const selected = decorationReducer(editState(), { type: "SELECT_SPOT", spotId: "floor-main" });
    expect(selected.selectedSpotId).toBe("floor-main");
    const cleared = decorationReducer(selected, { type: "SELECT_SPOT", spotId: null });
    expect(cleared.selectedSpotId).toBeNull();
  });

  it("assigns an item, marks dirty, and closes the picker", () => {
    const next = decorationReducer(editState({ selectedSpotId: "floor-main" }), {
      type: "ASSIGN",
      spotId: "floor-main",
      ref: { source: "catalog", id: "rug" },
    });
    expect(next.map["floor-main"]).toEqual({ source: "catalog", id: "rug" });
    expect(next.status).toBe("dirty");
    expect(next.selectedSpotId).toBeNull();
  });

  it("assign replaces the existing item in a spot", () => {
    const withRug = editState({ map: { "floor-main": { source: "catalog", id: "rug" } } });
    const next = decorationReducer(withRug, {
      type: "ASSIGN",
      spotId: "floor-main",
      ref: { source: "catalog", id: "stage" },
    });
    expect(next.map["floor-main"]).toEqual({ source: "catalog", id: "stage" });
  });

  it("clears a spot", () => {
    const withRug = editState({ map: { "floor-main": { source: "catalog", id: "rug" } } });
    const next = decorationReducer(withRug, { type: "CLEAR", spotId: "floor-main" });
    expect(next.map["floor-main"]).toBeUndefined();
    expect(next.status).toBe("dirty");
  });

  it("does not mutate the previous state on assign", () => {
    const prev = editState();
    decorationReducer(prev, {
      type: "ASSIGN",
      spotId: "floor-main",
      ref: { source: "catalog", id: "rug" },
    });
    expect(prev.map).toEqual({});
  });

  it("ignores assign and clear outside edit mode", () => {
    const preview = editState({ mode: "preview" });
    expect(
      decorationReducer(preview, {
        type: "ASSIGN",
        spotId: "floor-main",
        ref: { source: "catalog", id: "rug" },
      }),
    ).toBe(preview);
    const visit = editState({
      mode: "visit",
      map: { "floor-main": { source: "catalog", id: "rug" } },
    });
    expect(decorationReducer(visit, { type: "CLEAR", spotId: "floor-main" })).toBe(visit);
  });

  it("walks the save-status transitions dirty -> saving -> saved", () => {
    let state = decorationReducer(editState({ selectedSpotId: "floor-main" }), {
      type: "ASSIGN",
      spotId: "floor-main",
      ref: { source: "catalog", id: "rug" },
    });
    expect(state.status).toBe("dirty");
    state = decorationReducer(state, { type: "SAVE_START", revision: state.revision });
    expect(state.status).toBe("saving");
    state = decorationReducer(state, { type: "SAVE_OK", revision: state.revision });
    expect(state.status).toBe("saved");
    state = decorationReducer(state, { type: "SAVE_ERROR", revision: state.revision });
    expect(state.status).toBe("error");
  });

  it("ignores a save result for an older edit revision", () => {
    const firstEdit = decorationReducer(editState(), {
      type: "ASSIGN",
      spotId: "floor-main",
      ref: { source: "catalog", id: "rug" },
    });
    const secondEdit = decorationReducer(firstEdit, {
      type: "ASSIGN",
      spotId: "floor-main",
      ref: { source: "catalog", id: "stage" },
    });

    expect(decorationReducer(secondEdit, { type: "SAVE_OK", revision: firstEdit.revision })).toBe(
      secondEdit,
    );
  });

  it("hydrates a fresh snapshot as clean", () => {
    const dirty = editState({ status: "dirty", selectedSpotId: "floor-main" });
    const next = decorationReducer(dirty, {
      type: "HYDRATE",
      snapshot: {
        version: 1,
        templateId: "room-1",
        map: { "wall-art": { source: "catalog", id: "poster" } },
      },
    });
    expect(next.map).toEqual({ "wall-art": { source: "catalog", id: "poster" } });
    expect(next.status).toBe("idle");
    expect(next.selectedSpotId).toBeNull();
  });
});
