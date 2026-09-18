import { useCallback, useMemo, useRef, useState } from "react";
import { type AccessibilityActionEvent, Text, View } from "react-native";
import { Gesture, GestureDetector, type NativeGesture } from "react-native-gesture-handler";
import {
  TEMPO_STEPS,
  describeTempoRate,
  formatTempoRate,
  shiftTempoRate,
  snapTempoRate,
  tempoFraction,
  tempoRateAtFraction,
} from "./tempo-steps";

export const TEMPO_BAR_TEST_ID = "tempo-bar";
export const TEMPO_BAR_PAN_TEST_ID = "tempo-bar-pan";
export const TEMPO_BAR_TAP_TEST_ID = "tempo-bar-tap";
export const TEMPO_BAR_VALUE_TEST_ID = "tempo-bar-value";

interface TempoBarProps {
  height: number;
  rate: number;
  onRateChange: (rate: number) => void;
  /** The selectable levels, slowest first. A drag or a tap snaps to the nearest one. */
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
  /** Keeps the value label on the screen at rest, where no other control shows the level. */
  showValueAtRest?: boolean;
}

export function TempoBar({
  height,
  rate,
  onRateChange,
  steps = TEMPO_STEPS,
  pagerGesture,
  pagerAxis = "vertical",
  onDragChange,
  showValueAtRest = false,
}: TempoBarProps) {
  const [dragging, setDragging] = useState(false);
  // The gesture is built once per host geometry and reads everything else through this
  // ref. `onUpdate` re-renders the host on every frame, so a rebuild keyed on a prop the
  // host passes inline would replace the handler under the finger already on it.
  const latest = useRef({ rate, steps, onRateChange, onDragChange });
  latest.current = { rate, steps, onRateChange, onDragChange };
  const rateAtDragStart = useRef(rate);

  const pan = useMemo(() => {
    const gesture = Gesture.Pan()
      .withTestId(TEMPO_BAR_PAN_TEST_ID)
      // The handlers write React state, so they run on the JS thread rather than
      // as worklets.
      .runOnJS(true)
      .onStart(() => {
        rateAtDragStart.current = latest.current.rate;
        setDragging(true);
        latest.current.onDragChange?.(true);
      })
      .onUpdate((event) => {
        // Dragging up is a negative translationY, hence the sign. Applied on every
        // update, not on release, and snapped so the bar lands on a level instead of
        // an arbitrary number.
        const { steps: levels, onRateChange: emit } = latest.current;
        const travelled =
          rateAtDragStart.current + (-event.translationY / height) * tempoSpan(levels);
        emit(snapTempoRate(travelled, levels));
      })
      .onFinalize(() => {
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
  }, [height, pagerAxis, pagerGesture]);

  // A tap sets the level it lands on. Without it the bar answers only to a drag, which
  // leaves a plain tap doing nothing at all.
  const tap = useMemo(
    () =>
      Gesture.Tap()
        .withTestId(TEMPO_BAR_TAP_TEST_ID)
        .runOnJS(true)
        .onEnd((event) => {
          const { steps: levels, onRateChange: emit } = latest.current;
          // The bar fills from the bottom, so a y measured from its top inverts.
          emit(tempoRateAtFraction(1 - event.y / height, levels));
        }),
    [height],
  );

  // Whichever recognises the touch first takes it: a tap never travels far enough to
  // start the pan, and a drag leaves the tap's own distance limit behind.
  const gesture = useMemo(() => Gesture.Race(pan, tap), [pan, tap]);

  const onAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      const { actionName } = event.nativeEvent;
      if (actionName === "increment") onRateChange(shiftTempoRate(rate, 1, steps));
      if (actionName === "decrement") onRateChange(shiftTempoRate(rate, -1, steps));
    },
    [onRateChange, rate, steps],
  );

  const filledFraction = tempoFraction(rate, steps);
  // The ends of the scale are the ends of the bar, so only the levels between them
  // need a mark.
  const interiorSteps = steps.slice(1, -1);

  return (
    <View className="items-end">
      {/* The value is an interaction label, not furniture. It is positioned absolutely
          so appearing mid-drag cannot move the bar under the finger already on it. */}
      {dragging || showValueAtRest ? (
        <Text
          testID={TEMPO_BAR_VALUE_TEST_ID}
          className="-top-7 absolute right-0 font-extrabold text-foreground text-xs"
        >
          {formatTempoRate(rate)}
        </Text>
      ) : null}
      <GestureDetector gesture={gesture}>
        <View
          testID={TEMPO_BAR_TEST_ID}
          accessibilityRole="adjustable"
          accessibilityLabel="Playback speed"
          accessibilityValue={{ text: describeTempoRate(rate) }}
          accessibilityActions={ACCESSIBILITY_ACTIONS}
          onAccessibilityAction={onAccessibilityAction}
          style={{ height }}
          className="w-11 justify-end overflow-hidden rounded-full border border-border bg-black/40"
        >
          <View
            pointerEvents="none"
            style={{ height: `${filledFraction * 100}%` }}
            className="w-full bg-primary/70"
          />
          {interiorSteps.map((step) => (
            <View
              key={step}
              pointerEvents="none"
              style={{ bottom: `${tempoFraction(step, steps) * 100}%` }}
              className="absolute h-px w-full bg-white/30"
            />
          ))}
        </View>
      </GestureDetector>
    </View>
  );
}

const ACCESSIBILITY_ACTIONS = [{ name: "increment" }, { name: "decrement" }] as const;

/** Travel, in pixels, before a drag reads as vertical or as sideways. */
const AXIS_SLOP = 8;

/** The scale's full width, which one bar-height drag walks end to end. */
function tempoSpan(steps: readonly number[]): number {
  const slowest = steps[0] ?? 0;
  return (steps[steps.length - 1] ?? 0) - slowest;
}
