import { type DevMenuFabPosition, devMenuFabPositionAtom } from "@/features/dev-menu/state";
import {
  simulatedDanceRecordingEnabledAtom,
  useBackDanceCameraAtom,
} from "@bnewapp/dance-flow/dev";
import { BouncablePress } from "@bnewapp/mobile-kit/ui";
import { useAtom } from "jotai";
import { useMemo, useRef, useState } from "react";
import { Dimensions, Modal, PanResponder, Switch, Text, View } from "react-native";

if (!__DEV__) {
  throw new Error("dev-menu must only be imported behind __DEV__");
}

const FAB_SIZE = 56;
const SCREEN_MARGIN = 12;
const DRAG_THRESHOLD = 4;

export function DevMenu() {
  const [open, setOpen] = useState(false);
  const [savedFabPosition, setSavedFabPosition] = useAtom(devMenuFabPositionAtom);
  const [fabPosition, setFabPosition] = useState(savedFabPosition);
  const [simulatedRecordingEnabled, setSimulatedRecordingEnabled] = useAtom(
    simulatedDanceRecordingEnabledAtom,
  );
  const [useBackCamera, setUseBackCamera] = useAtom(useBackDanceCameraAtom);
  const fabPositionRef = useRef(fabPosition);
  const dragStartRef = useRef(fabPosition);
  const hasDraggedRef = useRef(false);
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          dragStartRef.current = fabPositionRef.current;
          hasDraggedRef.current = false;
        },
        onPanResponderMove: (_event, gesture) => {
          if (Math.abs(gesture.dx) + Math.abs(gesture.dy) > DRAG_THRESHOLD) {
            hasDraggedRef.current = true;
          }
          const nextPosition = clampFabPosition({
            right: dragStartRef.current.right - gesture.dx,
            bottom: dragStartRef.current.bottom - gesture.dy,
          });
          fabPositionRef.current = nextPosition;
          setFabPosition(nextPosition);
        },
        onPanResponderRelease: () => {
          if (hasDraggedRef.current) setSavedFabPosition(fabPositionRef.current);
          else setOpen(true);
        },
        onPanResponderTerminate: () => setSavedFabPosition(fabPositionRef.current),
      }),
    [setSavedFabPosition],
  );

  return (
    <>
      <View
        {...panResponder.panHandlers}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Open developer menu"
        accessibilityHint="Tap to open. Drag to move this developer button."
        accessibilityActions={[{ name: "activate", label: "Open developer menu" }]}
        onAccessibilityAction={() => setOpen(true)}
        style={{ bottom: fabPosition.bottom, right: fabPosition.right }}
        className="absolute z-50 size-14 items-center justify-center rounded-full border border-neon bg-panel-raised shadow-lg"
      >
        <Text className="font-black text-neon text-xs tracking-wider">DEV</Text>
      </View>
      <Modal
        animationType="slide"
        presentationStyle="pageSheet"
        visible={open}
        onRequestClose={() => setOpen(false)}
      >
        <View className="flex-1 bg-app px-5 pt-12">
          <View className="flex-row items-center justify-between border-border border-b pb-4">
            <Text accessibilityRole="header" className="font-black text-2xl text-foreground">
              Dev menu
            </Text>
            <BouncablePress
              accessibilityRole="button"
              accessibilityLabel="Close developer menu"
              onPress={() => setOpen(false)}
              className="rounded-xl bg-panel-raised px-4 py-2"
            >
              <Text className="font-bold text-foreground">Close</Text>
            </BouncablePress>
          </View>
          <View className="mt-5 flex-row items-center gap-4 rounded-2xl border border-border bg-panel p-4">
            <View className="flex-1 gap-1">
              <Text className="font-bold text-foreground">Simulated scan recording</Text>
              <Text className="text-copy text-sm leading-5">
                Use a different catalog video as a simulated capture and return a cached MP4.
              </Text>
            </View>
            <Switch
              accessibilityLabel="Enable simulated scan recording"
              value={simulatedRecordingEnabled}
              onValueChange={setSimulatedRecordingEnabled}
            />
          </View>
          <View className="mt-3 flex-row items-center gap-4 rounded-2xl border border-border bg-panel p-4">
            <View className="flex-1 gap-1">
              <Text className="font-bold text-foreground">Use back camera for a scan</Text>
              <Text className="text-copy text-sm leading-5">
                Capture someone else dancing when testing on a physical device.
              </Text>
            </View>
            <Switch
              accessibilityLabel="Enable back camera for a scan"
              value={useBackCamera}
              onValueChange={setUseBackCamera}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

function clampFabPosition(position: DevMenuFabPosition): DevMenuFabPosition {
  const { width, height } = Dimensions.get("window");
  return {
    right: clamp(
      position.right,
      SCREEN_MARGIN,
      Math.max(SCREEN_MARGIN, width - FAB_SIZE - SCREEN_MARGIN),
    ),
    bottom: clamp(
      position.bottom,
      SCREEN_MARGIN,
      Math.max(SCREEN_MARGIN, height - FAB_SIZE - SCREEN_MARGIN),
    ),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
