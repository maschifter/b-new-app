import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type AccessibilityActionEvent, Text, View } from "react-native";
import { Gesture, GestureDetector, type NativeGesture } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import {
  TEMPO_STEPS,
  describeTempoRate,
  formatTempoRate,
  shiftTempoRate,
  tempoFraction,
  tempoRateAtFraction,
} from "./tempo-steps";

export const TEMPO_BAR_TEST_ID = "tempo-bar";
export const TEMPO_BAR_PAN_TEST_ID = "tempo-bar-pan";
export const TEMPO_BAR_VALUE_TEST_ID = "tempo-bar-value";
export const TEMPO_BAR_HEIGHT = 174;

interface TempoBarProps {
  rate: number;
  onRateChange: (rate: number) => void;
  iconColor: string;
  /** The selectable levels, slowest first. A drag settles on the nearest one. */
  steps?: readonly number[];
  /**
   * The host pager's own scroll gesture, which this bar has to out-argue. Two vertical
   * gestures overlap on a vertical pager: a drag inside the bar must change speed without
   * paging, and a swipe outside it must still page. It has to be the gesture object rather
   * than a ref to the list: RNGH resolves a relation to a handler tag, a `FlatList`
   * instance carries none, and the unresolved relation is dropped without a word. Omit it
   * where nothing competes.
   */
  pagerGesture?: NativeGesture;
  /**
   * The axis the host pager scrolls on, read only beside `pagerGesture`. A vertical pager
   * wants the same drags this bar does, so the bar keeps every one that starts on it. A
   * horizontal pager does not: the bar takes a drag once it reads as vertical and fails a
   * sideways one, which releases the pager it blocks so the swipe still turns the page.
   */
  pagerAxis?: "vertical" | "horizontal";
  onDragChange?: (dragging: boolean) => void;
  /** Shows a diagnostic value label; production controls intentionally omit it. */
  showValueAtRest?: boolean;
}

export function TempoBar({
  rate,
  onRateChange,
  iconColor,
  steps = TEMPO_STEPS,
  pagerGesture,
  pagerAxis = "vertical",
  onDragChange,
  showValueAtRest = false,
}: TempoBarProps) {
  const [dragging, setDragging] = useState(false);
  // The gesture is built once and reads everything else through this
  // ref. A rebuild keyed on a prop the host passes inline would replace the handler under
  // the finger already on it.
  const latest = useRef({ rate, steps, onRateChange, onDragChange });
  latest.current = { rate, steps, onRateChange, onDragChange };

  const restFraction = tempoFraction(rate, steps);
  // The fill lives on the UI thread so a drag can track the finger without a render per
  // frame and the release can ease into its level.
  const fill = useSharedValue(restFraction);
  const draggingRef = useRef(false);
  const settledRef = useRef(false);
  const fractionAtDragStart = useRef(restFraction);
  const freeFraction = useRef(restFraction);
  const lastEmitted = useRef(rate);

  // Anything that moves the level without a drag — an assistive action or the host
  // setting it — settles the thumb the same way a release does.
  useEffect(() => {
    if (draggingRef.current) return;
    fill.value = withTiming(restFraction, SETTLE);
  }, [fill, restFraction]);

  const pan = useMemo(() => {
    const gesture = Gesture.Pan()
      .withTestId(TEMPO_BAR_PAN_TEST_ID)
      // The handlers write React state, so they run on the JS thread rather than
      // as worklets.
      .runOnJS(true)
      .onStart(() => {
        const { rate: current, steps: levels } = latest.current;
        fractionAtDragStart.current = tempoFraction(current, levels);
        freeFraction.current = fractionAtDragStart.current;
        lastEmitted.current = current;
        draggingRef.current = true;
        settledRef.current = false;
        setDragging(true);
        latest.current.onDragChange?.(true);
      })
      .onUpdate((event) => {
        // Dragging up is a negative translationY, hence the sign. The thumb takes the raw
        // position so it stays under the finger. Boogiz publishes the nearest level
        // only after the drag ends and the thumb has snapped.
        const fraction = clamp01(
          fractionAtDragStart.current - event.translationY / TEMPO_BAR_HEIGHT,
        );
        freeFraction.current = fraction;
        fill.value = fraction;
      })
      .onEnd(() => {
        const { steps: levels, onRateChange: emit } = latest.current;
        const level = tempoRateAtFraction(freeFraction.current, levels);
        settledRef.current = true;
        fill.value = withTiming(tempoFraction(level, levels), SETTLE);
        if (level === lastEmitted.current) return;
        lastEmitted.current = level;
        emit(level);
      })
      .onFinalize(() => {
        // A cancelled drag never reaches `onEnd`, so the thumb is still wherever the finger
        // left it and has to fall back to the level in force.
        if (!settledRef.current) {
          const { rate: current, steps: levels } = latest.current;
          fill.value = withTiming(tempoFraction(current, levels), SETTLE);
        }
        draggingRef.current = false;
        setDragging(false);
        latest.current.onDragChange?.(false);
      });
    // Nothing competes without a pager gesture, and the axis thresholds would only cost
    // the bar drags it should have kept.
    if (!pagerGesture) return gesture;
    if (pagerAxis === "horizontal") {
      gesture.activeOffsetY([-AXIS_SLOP, AXIS_SLOP]).failOffsetX([-AXIS_SLOP, AXIS_SLOP]);
    }
    return gesture.blocksExternalGesture(pagerGesture);
  }, [fill, pagerAxis, pagerGesture]);

  const onAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      const { actionName } = event.nativeEvent;
      if (actionName === "increment") onRateChange(shiftTempoRate(rate, 1, steps));
      if (actionName === "decrement") onRateChange(shiftTempoRate(rate, -1, steps));
    },
    [onRateChange, rate, steps],
  );

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - fill.value) * TEMPO_BAR_HEIGHT - THUMB_SIZE / 2 }],
  }));

  return (
    <View style={{ width: THUMB_SIZE }} className="items-center">
      {/* Kept as an opt-in diagnostic label; production surfaces use the Boogiz control
          without a numeric readout. */}
      {showValueAtRest ? (
        <Text
          testID={TEMPO_BAR_VALUE_TEST_ID}
          className="-top-7 absolute font-extrabold text-foreground text-xs"
        >
          {formatTempoRate(rate)}
        </Text>
      ) : null}
      <GestureDetector gesture={pan}>
        <View
          testID={TEMPO_BAR_TEST_ID}
          accessibilityRole="adjustable"
          accessibilityLabel="Playback speed"
          accessibilityValue={{ text: describeTempoRate(rate) }}
          accessibilityActions={ACCESSIBILITY_ACTIONS}
          onAccessibilityAction={onAccessibilityAction}
          style={{ height: TEMPO_BAR_HEIGHT, width: THUMB_SIZE }}
          className="items-center"
        >
          <View pointerEvents="none" style={{ width: TRACK_WIDTH }} className="h-full rounded-full bg-white/60" />
          <Animated.View
            pointerEvents="none"
            style={[{ height: THUMB_SIZE, width: THUMB_SIZE }, thumbStyle]}
            className="absolute items-center justify-center rounded-full bg-white"
          >
            <MaterialCommunityIcons name="run-fast" size={16} color={iconColor} />
          </Animated.View>
        </View>
      </GestureDetector>
    </View>
  );
}

const ACCESSIBILITY_ACTIONS = [{ name: "increment" }, { name: "decrement" }] as const;

/** Travel, in pixels, before a drag reads as vertical or as sideways. */
const AXIS_SLOP = 8;

/** Long enough to read as a settle, short enough that the level still feels immediate. */
const SETTLE = { duration: 160 };

/** Exact dimensions of the Boogiz `VideoSpeedControl`. */
const TRACK_WIDTH = 8;
const THUMB_SIZE = 28;

export function TempoBarSkeleton() {
  return (
    <View testID="tempo-bar-skeleton" style={{ height: TEMPO_BAR_HEIGHT, width: THUMB_SIZE }} className="items-center">
      <View style={{ width: TRACK_WIDTH }} className="h-full rounded-full bg-panel-raised" />
      <View
        style={{ height: THUMB_SIZE, width: THUMB_SIZE, top: -THUMB_SIZE / 2 }}
        className="absolute rounded-full bg-panel-raised"
      />
    </View>
  );
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
