import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { CATALOG } from "../data/catalog";
import {
  DEFAULT_TEMPLATE_ID,
  ROOM_TEMPLATE,
  emptyDecoration,
  templateById,
} from "../data/templates";
import { migrate } from "../domain/migrate";
import { reconcile } from "../domain/reconcile";
import type { ContentRef, DecorationSnapshot, RoomTemplate, StudioMode } from "../domain/types";
import { asyncStorageRepository } from "../storage/async-storage-repository";
import type { DecorationRepository } from "../storage/repository";
import {
  type StudioState,
  decorationReducer,
  initStudioState,
  toSnapshot,
} from "./decoration-reducer";

// useReducer + Context, with the load pipeline (read -> migrate -> reconcile ->
// render) and debounced autosave living above the repository (design §6, §9.3).
// The gateway only does raw I/O; migration and compatibility validation happen
// here before anything is rendered.

const SAVE_DEBOUNCE_MS = 600;
const CURRENT_VERSION = 1;

interface StudioContextValue {
  state: StudioState;
  template: RoomTemplate;
  hydrated: boolean;
  selectSpot: (spotId: string | null) => void;
  assign: (spotId: string, ref: ContentRef) => void;
  clear: (spotId: string) => void;
  setMode: (mode: StudioMode) => void;
}

const StudioContext = createContext<StudioContextValue | undefined>(undefined);

interface StudioProviderProps extends PropsWithChildren {
  ownerId?: string;
  templateId?: string;
  mode?: StudioMode;
  repository?: DecorationRepository;
}

export function StudioProvider({
  children,
  ownerId = "local",
  templateId = DEFAULT_TEMPLATE_ID,
  mode = "edit",
  repository = asyncStorageRepository,
}: StudioProviderProps) {
  const template = templateById(templateId) ?? ROOM_TEMPLATE;
  const [state, dispatch] = useReducer(
    decorationReducer,
    initStudioState(emptyDecoration(templateId), mode),
  );
  const [hydratedIdentity, setHydratedIdentity] = useState<string | null>(null);
  const mounted = useRef(true);
  const identity = `${ownerId}:${templateId}`;
  const hydrated = hydratedIdentity === identity;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Load pipeline: read -> migrate -> reconcile -> HYDRATE (render).
  useEffect(() => {
    let active = true;
    void (async () => {
      let snapshot: DecorationSnapshot;
      try {
        const raw = await repository.load(ownerId);
        const base = raw ?? emptyDecoration(templateId);
        snapshot = reconcile(migrate(base), template, CATALOG);
      } catch {
        snapshot = emptyDecoration(templateId);
      }
      if (!active) return;
      dispatch({ type: "HYDRATE", snapshot });
      setHydratedIdentity(identity);
    })();
    return () => {
      active = false;
    };
  }, [ownerId, templateId, template, repository, identity]);

  // Debounced autosave: any map change -> dirty -> (debounce) -> saving -> saved.
  // No Save button (design §5 rule 5). Never writes before the first hydrate.
  useEffect(() => {
    if (!hydrated || state.status !== "dirty") return;
    const snapshot = toSnapshot(state, CURRENT_VERSION);
    const { revision } = state;
    const handle = setTimeout(() => {
      dispatch({ type: "SAVE_START", revision });
      void repository
        .save(ownerId, snapshot)
        .then(() => {
          if (mounted.current) dispatch({ type: "SAVE_OK", revision });
        })
        .catch(() => {
          if (mounted.current) dispatch({ type: "SAVE_ERROR", revision });
        });
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [hydrated, state, ownerId, repository]);

  const selectSpot = useCallback((spotId: string | null) => {
    dispatch({ type: "SELECT_SPOT", spotId });
  }, []);
  const assign = useCallback((spotId: string, ref: ContentRef) => {
    dispatch({ type: "ASSIGN", spotId, ref });
  }, []);
  const clear = useCallback((spotId: string) => {
    dispatch({ type: "CLEAR", spotId });
  }, []);
  const setMode = useCallback((next: StudioMode) => {
    dispatch({ type: "SET_MODE", mode: next });
  }, []);

  const value = useMemo<StudioContextValue>(
    () => ({ state, template, hydrated, selectSpot, assign, clear, setMode }),
    [state, template, hydrated, selectSpot, assign, clear, setMode],
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio(): StudioContextValue {
  const value = useContext(StudioContext);
  if (!value) throw new Error("useStudio must be used within StudioProvider");
  return value;
}
