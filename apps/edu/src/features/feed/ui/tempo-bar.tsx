import { useAtom } from "jotai";
import { useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { Gesture, GestureDetector, type NativeGesture } from "react-native-gesture-handler";
import { MAX_PLAYBACK_RATE, MIN_PLAYBACK_RATE, playbackRateAtom } from "../_atoms/ui";

const RATE_SPAN = MAX_PLAYBACK_RATE - MIN_PLAYBACK_RATE;

function clampRate(rate: number): number {
  return Math.min(MAX_PLAYBACK_RATE, Math.max(MIN_PLAYBACK_RATE, rate));
}

interface TempoBarProps {
  height: number;
  /**
   * The pager's own scroll gesture, which this bar has to out-argue. Two vertical
   * gestures overlap here: a drag inside the bar must change speed without paging,
   * and a swipe outside it must still page. It has to be the gesture object rather
   * than a ref to the list: RNGH resolves a relation to a handler tag, a `FlatList`
   * instance carries none, and the unresolved relation is dropped without a word.
   */
  pagerGesture: NativeGesture;
  onDragChange: (dragging: boolean) => void;
}

export function TempoBar({ height, pagerGesture, onDragChange }: TempoBarProps) {
  const [rate, setRate] = useAtom(playbackRateAtom);
  const [dragging, setDragging] = useState(false);
  const rateRef = useRef(rate);
  rateRef.current = rate;
  const rateAtDragStart = useRef(rate);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .withTestId("feed-tempo-pan")
        // The handlers write React state, so they run on the JS thread rather than
        // as worklets.
        .runOnJS(true)
        .blocksExternalGesture(pagerGesture)
        .onStart(() => {
          rateAtDragStart.current = rateRef.current;
          setDragging(true);
          onDragChange(true);
        })
        .onUpdate((event) => {
          // Dragging up is a negative translationY, hence the sign. Applied on every
          // update, not on release (document 01 line 45).
          setRate(clampRate(rateAtDragStart.current + (-event.translationY / height) * RATE_SPAN));
        })
        .onFinalize(() => {
          setDragging(false);
          onDragChange(false);
        }),
    [height, onDragChange, pagerGesture, setRate],
  );

  const filledFraction = (rate - MIN_PLAYBACK_RATE) / RATE_SPAN;

  return (
    <View className="items-end">
      {/* Document 01 line 67: the value is an interaction label, not furniture. It is
          positioned absolutely so appearing mid-drag cannot move the bar under the
          finger already on it. */}
      {dragging ? (
        <Text
          testID="feed-tempo-value"
          className="-top-7 absolute right-0 font-extrabold text-foreground text-xs"
        >
          {rate.toFixed(2)}×
        </Text>
      ) : null}
      <GestureDetector gesture={pan}>
        <View
          testID="feed-tempo-bar"
          accessibilityRole="adjustable"
          accessibilityLabel="Playback speed"
          accessibilityValue={{ text: `${rate.toFixed(2)} times normal speed` }}
          style={{ height }}
          className="w-11 justify-end overflow-hidden rounded-full border border-border bg-black/40"
        >
          <View
            pointerEvents="none"
            style={{ height: `${filledFraction * 100}%` }}
            className="w-full bg-primary/70"
          />
        </View>
      </GestureDetector>
    </View>
  );
}
