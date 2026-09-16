import { atom } from "jotai";

// Suspense query atoms depend on this revision so retrying an error boundary
// invalidates a cached rejected promise as well as the TanStack query itself.
export const queryErrorResetVersionAtom = atom(0);
