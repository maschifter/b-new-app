import { createAtomWithMMKV } from "@bnewapp/mobile-kit";
import type { DevMenuFabPosition } from "@bnewapp/mobile-kit/ui/dev-menu";
import { MMKV } from "react-native-mmkv";

const atomWithDevMenuMMKV = createAtomWithMMKV(new MMKV({ id: "dev-menu" }));

/** Starts clear of the tab bar; dragging the DEV button persists a preferred position. */
export const devMenuFabPositionAtom = atomWithDevMenuMMKV<DevMenuFabPosition>(
  "dev-menu:v1:fab-position",
  { right: 12, bottom: 108 },
);
