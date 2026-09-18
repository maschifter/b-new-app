import { persistedEduAtom } from "@/lib/jotai/atom-with-mmkv";
import type { DevMenuFabPosition } from "@bnewapp/mobile-kit/ui/dev-menu";

/**
 * Starts clear of the feed's call to action and its right rail; dragging the DEV
 * button persists a preferred position.
 */
export const devMenuFabPositionAtom = persistedEduAtom<DevMenuFabPosition>(
  "dev-menu:fab-position",
  {
    right: 12,
    bottom: 260,
  },
);
