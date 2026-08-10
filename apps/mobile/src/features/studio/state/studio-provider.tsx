import {
  CURRENT_VERSION,
  type ContentRef,
  ROOM_TEMPLATE,
  type RoomTemplate,
  type StudioMode,
  templateById,
} from "@bnewapp/studio-core";
import { useAtom } from "jotai";
import { type PropsWithChildren, createContext, useCallback, useContext, useMemo } from "react";
import { decorationAtom, selectedSpotAtom } from "./atoms";

// State now lives in jotai atoms (see ./atoms) persisted through MMKV. This
// provider is a thin config context carrying only which room (`ownerId`) and
// mode the subtree edits — the reducer, the async load pipeline, and the
// repository gateway are gone. `useStudio()` keeps the same shape consumers
// used before (state / template / selectSpot / assign / clear) so the UI is
// untouched. Writes persist synchronously, so there is no hydrate gate and no
// save-status to expose.

interface StudioConfig {
  ownerId: string;
  mode: StudioMode;
}

const StudioConfigContext = createContext<StudioConfig | undefined>(undefined);

interface StudioProviderProps extends PropsWithChildren {
  ownerId?: string;
  mode?: StudioMode;
}

export function StudioProvider({
  children,
  ownerId = "local",
  mode = "edit",
}: StudioProviderProps) {
  const config = useMemo<StudioConfig>(() => ({ ownerId, mode }), [ownerId, mode]);
  return <StudioConfigContext.Provider value={config}>{children}</StudioConfigContext.Provider>;
}

export interface StudioViewState {
  templateId: string;
  map: Record<string, ContentRef>;
  selectedSpotId: string | null;
  mode: StudioMode;
}

export interface StudioApi {
  state: StudioViewState;
  template: RoomTemplate;
  selectSpot: (spotId: string | null) => void;
  assign: (spotId: string, ref: ContentRef) => void;
  clear: (spotId: string) => void;
}

export function useStudio(): StudioApi {
  const config = useContext(StudioConfigContext);
  if (!config) throw new Error("useStudio must be used within StudioProvider");
  const { ownerId, mode } = config;

  // `snapshot` is already reconciled against the current template + catalog.
  const [snapshot, setSnapshot] = useAtom(decorationAtom(ownerId));
  const [selectedSpotId, setSelectedSpotId] = useAtom(selectedSpotAtom(ownerId));
  const template = templateById(snapshot.templateId) ?? ROOM_TEMPLATE;

  const selectSpot = useCallback(
    (spotId: string | null) => setSelectedSpotId(spotId),
    [setSelectedSpotId],
  );

  const assign = useCallback(
    (spotId: string, ref: ContentRef) => {
      if (mode !== "edit") return; // inert in preview/visit
      setSnapshot({
        version: CURRENT_VERSION,
        templateId: snapshot.templateId,
        map: { ...snapshot.map, [spotId]: ref },
      });
      setSelectedSpotId(null);
    },
    [mode, snapshot, setSnapshot, setSelectedSpotId],
  );

  const clear = useCallback(
    (spotId: string) => {
      if (mode !== "edit") return; // inert in preview/visit
      if (!(spotId in snapshot.map)) return;
      const { [spotId]: _removed, ...rest } = snapshot.map;
      setSnapshot({ version: CURRENT_VERSION, templateId: snapshot.templateId, map: rest });
      setSelectedSpotId(null);
    },
    [mode, snapshot, setSnapshot, setSelectedSpotId],
  );

  const state = useMemo<StudioViewState>(
    () => ({ templateId: snapshot.templateId, map: snapshot.map, selectedSpotId, mode }),
    [snapshot, selectedSpotId, mode],
  );

  return { state, template, selectSpot, assign, clear };
}
