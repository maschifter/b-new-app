import { useMemo, useRef, useState } from "react";
import { Dimensions, Modal, PanResponder, Switch, Text, View } from "react-native";
import { BouncablePress } from "./bouncable-press";

const FAB_SIZE = 56;
const SCREEN_MARGIN = 12;
const DRAG_THRESHOLD = 4;

export interface DevMenuFabPosition {
  right: number;
  bottom: number;
}

export interface DevMenuToggle {
  /** Identifies the row across renders. */
  key: string;
  label: string;
  description: string;
  /**
   * Spelled out rather than derived from `label`: "Use back camera for a scan" reads
   * as "Enable back camera for a scan", which no transformation of the label produces.
   */
  accessibilityLabel: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}

interface DevMenuProps {
  /** Where the button starts. The drag is held locally and reported on release. */
  position: DevMenuFabPosition;
  onPositionChange: (position: DevMenuFabPosition) => void;
  toggles: DevMenuToggle[];
}

/**
 * The draggable DEV button and the sheet behind it, shared so a second app does not
 * re-implement the drag, the clamping or the sheet. It carries no switches of its own:
 * each app passes the toggles it wants, with its own wording.
 *
 * Kept outside the `ui` barrel because Metro does not tree-shake — importing it is the
 * only way it reaches a bundle, and every consumer mounts it behind `__DEV__`.
 */
export function DevMenu({ position, onPositionChange, toggles }: DevMenuProps) {
  const [open, setOpen] = useState(false);
  const [fabPosition, setFabPosition] = useState(position);
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
          if (hasDraggedRef.current) onPositionChange(fabPositionRef.current);
          else setOpen(true);
        },
        onPanResponderTerminate: () => onPositionChange(fabPositionRef.current),
      }),
    [onPositionChange],
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
          {toggles.map((toggle, index) => (
            <View
              key={toggle.key}
              className={`flex-row items-center gap-4 rounded-2xl border border-border bg-panel p-4 ${
                index === 0 ? "mt-5" : "mt-3"
              }`}
            >
              <View className="flex-1 gap-1">
                <Text className="font-bold text-foreground">{toggle.label}</Text>
                <Text className="text-copy text-sm leading-5">{toggle.description}</Text>
              </View>
              <Switch
                accessibilityLabel={toggle.accessibilityLabel}
                value={toggle.value}
                onValueChange={toggle.onValueChange}
              />
            </View>
          ))}
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
