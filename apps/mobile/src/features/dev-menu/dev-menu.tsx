import { devMenuFabPositionAtom } from "@/features/dev-menu/state";
import {
  simulatedDanceRecordingEnabledAtom,
  useBackDanceCameraAtom,
} from "@bnewapp/dance-flow/dev";
import { DevMenu as SharedDevMenu } from "@bnewapp/mobile-kit/ui/dev-menu";
import { useAtom } from "jotai";

if (!__DEV__) {
  throw new Error("dev-menu must only be imported behind __DEV__");
}

export function DevMenu() {
  const [fabPosition, setFabPosition] = useAtom(devMenuFabPositionAtom);
  const [simulatedRecordingEnabled, setSimulatedRecordingEnabled] = useAtom(
    simulatedDanceRecordingEnabledAtom,
  );
  const [useBackCamera, setUseBackCamera] = useAtom(useBackDanceCameraAtom);

  return (
    <SharedDevMenu
      position={fabPosition}
      onPositionChange={setFabPosition}
      toggles={[
        {
          key: "simulated-recording",
          label: "Simulated dance recording",
          description:
            "Use a different catalog video as a simulated capture and return a cached MP4.",
          accessibilityLabel: "Enable simulated dance recording",
          value: simulatedRecordingEnabled,
          onValueChange: setSimulatedRecordingEnabled,
        },
        {
          key: "back-camera",
          label: "Use back camera for dance recording",
          description: "Capture someone else dancing when testing on a physical device.",
          accessibilityLabel: "Enable back camera for dance recording",
          value: useBackCamera,
          onValueChange: setUseBackCamera,
        },
      ]}
    />
  );
}
