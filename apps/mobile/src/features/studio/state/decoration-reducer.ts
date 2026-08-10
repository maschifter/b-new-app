import type { ContentRef, DecorationSnapshot, StudioMode } from "../domain/types";

// Pure editing state, one-directional: action -> update the map -> re-render
// (design §9.3). No storage, no React here. Assignment actions are inert
// outside edit mode so the same reducer serves preview/visit unchanged.

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export interface StudioState {
  templateId: string;
  map: Record<string, ContentRef>;
  selectedSpotId: string | null;
  mode: StudioMode;
  status: SaveStatus;
  /** Monotonic local edit token used to ignore stale persistence callbacks. */
  revision: number;
}

export type StudioAction =
  | { type: "HYDRATE"; snapshot: DecorationSnapshot }
  | { type: "SELECT_SPOT"; spotId: string | null }
  | { type: "ASSIGN"; spotId: string; ref: ContentRef }
  | { type: "CLEAR"; spotId: string }
  | { type: "SET_MODE"; mode: StudioMode }
  | { type: "SAVE_START"; revision: number }
  | { type: "SAVE_OK"; revision: number }
  | { type: "SAVE_ERROR"; revision: number };

export function initStudioState(snapshot: DecorationSnapshot, mode: StudioMode): StudioState {
  return {
    templateId: snapshot.templateId,
    map: snapshot.map,
    selectedSpotId: null,
    mode,
    status: "idle",
    revision: 0,
  };
}

export function toSnapshot(state: StudioState, version: number): DecorationSnapshot {
  return { version, templateId: state.templateId, map: state.map };
}

export function decorationReducer(state: StudioState, action: StudioAction): StudioState {
  switch (action.type) {
    case "HYDRATE":
      return {
        ...state,
        templateId: action.snapshot.templateId,
        map: action.snapshot.map,
        selectedSpotId: null,
        status: "idle",
        revision: state.revision + 1,
      };

    case "SELECT_SPOT":
      return { ...state, selectedSpotId: action.spotId };

    case "ASSIGN": {
      if (state.mode !== "edit") return state; // inert in preview/visit
      return {
        ...state,
        map: { ...state.map, [action.spotId]: action.ref },
        selectedSpotId: null,
        status: "dirty",
        revision: state.revision + 1,
      };
    }

    case "CLEAR": {
      if (state.mode !== "edit") return state; // inert in preview/visit
      if (!(action.spotId in state.map)) return state;
      const { [action.spotId]: _removed, ...rest } = state.map;
      return {
        ...state,
        map: rest,
        selectedSpotId: null,
        status: "dirty",
        revision: state.revision + 1,
      };
    }

    case "SET_MODE":
      return { ...state, mode: action.mode, selectedSpotId: null };

    case "SAVE_START":
      return state.revision === action.revision ? { ...state, status: "saving" } : state;

    case "SAVE_OK":
      return state.revision === action.revision ? { ...state, status: "saved" } : state;

    case "SAVE_ERROR":
      return state.revision === action.revision ? { ...state, status: "error" } : state;
  }
}
