// A third entry point beside `index.ts` and `dev.ts`, for the same reason `dev.ts`
// exists: the host app has to configure the flow from its root layout, and
// `index.ts` re-exports the dance screens — reaching the configurator through it
// would pull the camera and network stack into the root module graph. Keep this
// file free of screen and api imports.
import { type MMKVAtom, createAtomWithMMKV } from "@bnewapp/mobile-kit";
import { atom } from "jotai";
import { MMKV } from "react-native-mmkv";

interface DanceFlowConfig {
  /** Base URL every dance request is built from. */
  apiUrl: string;
  /** MMKV store id, so two host apps never share the flow's persisted state. */
  mmkvId: string;
}

export class DanceFlowNotConfiguredError extends Error {
  constructor() {
    super("configureDanceFlow() must run at app bootstrap before the dance flow is used");
    this.name = "DanceFlowNotConfiguredError";
  }
}

export class DanceFlowReconfiguredError extends Error {
  constructor() {
    super(
      "configureDanceFlow() ran twice with different values; the MMKV store is bound on first read and cannot be repointed afterwards",
    );
    this.name = "DanceFlowReconfiguredError";
  }
}

let config: DanceFlowConfig | null = null;

/**
 * Call once at app bootstrap, before anything renders or requests. A repeat call
 * with the same values is a no-op; one that would repoint the flow throws, because
 * `danceMMKV()` memoizes the store on first read and a later `mmkvId` would be
 * silently ignored while `apiUrl` did change.
 */
export function configureDanceFlow(next: DanceFlowConfig): void {
  if (config && (config.apiUrl !== next.apiUrl || config.mmkvId !== next.mmkvId)) {
    throw new DanceFlowReconfiguredError();
  }
  config = next;
}

function requireConfig(): DanceFlowConfig {
  if (!config) throw new DanceFlowNotConfiguredError();
  return config;
}

/** Read per request: the host app owns the base URL and resolves it at bootstrap. */
export function danceApiUrl(): string {
  return requireConfig().apiUrl;
}

// The flow's own storage schema version, not the host app's. Both apps must agree
// on it, which is why it is not part of the injected config — only the store id is.
const KEY_PREFIX = "dance:v1:";

let atomWithDanceMMKV: ReturnType<typeof createAtomWithMMKV> | null = null;

function danceMMKV(): ReturnType<typeof createAtomWithMMKV> {
  if (!atomWithDanceMMKV) {
    atomWithDanceMMKV = createAtomWithMMKV(new MMKV({ id: requireConfig().mmkvId }));
  }
  return atomWithDanceMMKV;
}

/**
 * `atomWithStorage({ getOnInit: true })` reads storage when the atom is *created*,
 * and these atoms are created at module load — before any bootstrap call can run.
 * So the persisted atom is built on first read instead, and memoized from there.
 *
 * Call this at module scope only: each call returns a new proxy atom, so calling it
 * during a render would hand every render a different atom identity.
 */
export function persistedDanceAtom<T>(key: string, initial: T): MMKVAtom<T> {
  let persisted: MMKVAtom<T> | null = null;
  const resolve = (): MMKVAtom<T> => {
    if (!persisted) persisted = danceMMKV()<T>(`${KEY_PREFIX}${key}`, initial);
    return persisted;
  };
  return atom(
    (get) => get(resolve()),
    (_get, set, update: T | ((prev: T) => T)) => set(resolve(), update),
  );
}
