import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { useState } from "react";
import { View } from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
  State,
} from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";
import { TEMPO_BAR_TEST_ID, TEMPO_BAR_VALUE_TEST_ID, TempoBar } from "../tempo-bar";

const BAR_HEIGHT = 400;

function Host({
  initialRate = 1,
  ...props
}: { initialRate?: number } & Partial<Parameters<typeof TempoBar>[0]>) {
  const [rate, setRate] = useState(initialRate);
  const bar = <TempoBar height={BAR_HEIGHT} rate={rate} onRateChange={setRate} {...props} />;
  // A gesture is only registered once a detector mounts it, so a supplied pager
  // gesture needs the host view a real pager would give it.
  return (
    <GestureHandlerRootView>
      {props.pagerGesture ? (
        <GestureDetector gesture={props.pagerGesture}>
          <View>{bar}</View>
        </GestureDetector>
      ) : (
        bar
      )}
    </GestureHandlerRootView>
  );
}

/** Drags by `translationY` pixels; negative is upwards, which speeds the video up. */
function drag(translationY: number) {
  act(() => {
    fireGestureHandler(getByGestureTestId("tempo-bar-pan"), [
      { state: State.BEGAN, translationY: 0 },
      { state: State.ACTIVE, translationY: 0 },
      { translationY },
      { state: State.END, translationY },
    ]);
  });
}

/** Taps `y` pixels down from the top of the bar, where 0 is the fastest level. */
function tapAt(y: number) {
  act(() => {
    fireGestureHandler(getByGestureTestId("tempo-bar-tap"), [
      { state: State.BEGAN, y },
      { state: State.ACTIVE, y },
      { state: State.END, y },
    ]);
  });
}

function rateFromLabel(): string {
  return screen.getByTestId(TEMPO_BAR_VALUE_TEST_ID).props.children;
}

it("snaps a drag to the nearest level instead of a free number", () => {
  render(<Host showValueAtRest />);

  // A quarter of the bar is a quarter of the 0.5x-to-1.5x span: exactly one level up.
  drag(-BAR_HEIGHT / 4);
  expect(rateFromLabel()).toBe("1.25×");

  // Two thirds of a level still resolves to the whole level.
  drag(-BAR_HEIGHT / 6);
  expect(rateFromLabel()).toBe("1.5×");
});

it("rounds a drag that stops between two levels back to the closer one", () => {
  render(<Host showValueAtRest />);

  // 40% of one level's travel: short of the halfway point, so the level does not change.
  drag(-BAR_HEIGHT * 0.1);
  expect(rateFromLabel()).toBe("1×");

  // 60% of it: past halfway, so it does.
  drag(-BAR_HEIGHT * 0.15);
  expect(rateFromLabel()).toBe("1.25×");
});

it("clamps a drag past either end of the scale", () => {
  render(<Host showValueAtRest />);

  drag(BAR_HEIGHT * 10);
  expect(rateFromLabel()).toBe("0.5×");

  drag(-BAR_HEIGHT * 10);
  expect(rateFromLabel()).toBe("1.5×");
});

it("keeps the value off the screen at rest unless the host asks for it", () => {
  render(<Host />);
  expect(screen.queryByTestId(TEMPO_BAR_VALUE_TEST_ID)).toBeNull();

  screen.rerender(<Host showValueAtRest />);
  expect(screen.getByTestId(TEMPO_BAR_VALUE_TEST_ID)).toBeOnTheScreen();
});

it("reports the current level to assistive technology and steps on its actions", () => {
  render(<Host showValueAtRest />);
  const bar = screen.getByTestId(TEMPO_BAR_TEST_ID);
  expect(bar.props.accessibilityValue).toEqual({ text: "1 times normal speed" });

  fireEvent(bar, "accessibilityAction", { nativeEvent: { actionName: "increment" } });
  expect(rateFromLabel()).toBe("1.25×");

  fireEvent(bar, "accessibilityAction", { nativeEvent: { actionName: "decrement" } });
  fireEvent(bar, "accessibilityAction", { nativeEvent: { actionName: "decrement" } });
  expect(rateFromLabel()).toBe("0.75×");
});

it("tells the host when a drag starts and ends so it can hold its own scrolling", () => {
  const onDragChange = jest.fn();
  render(<Host onDragChange={onDragChange} />);

  drag(-10);
  expect(onDragChange.mock.calls).toEqual([[true], [false]]);
});

// The relation resolves to a handler tag, and RNGH drops one it cannot resolve without
// reporting it. Asserting the tag is the only way to catch that here: the jest helper
// drives the pan in isolation, with no scroll gesture to lose to.
it("blocks the host pager's gesture when one is supplied", async () => {
  const pagerGesture = Gesture.Native().withTestId("host-pager");
  render(<Host pagerGesture={pagerGesture} />);

  const pager = getByGestureTestId("host-pager");
  expect(pager.handlerTag).toBeGreaterThan(0);
  await waitFor(() =>
    expect(getByGestureTestId("tempo-bar-pan").config.blocksHandlers).toEqual([pager.handlerTag]),
  );
});

it("claims no relation when the host has no competing gesture", () => {
  render(<Host />);

  expect(getByGestureTestId("tempo-bar-pan").config.blocksHandlers).toBeUndefined();
});

// A horizontal pager's swipe is the axis this bar does not use, so the bar has to fail it
// rather than hold a touch that would otherwise turn the page.
it("concedes a sideways drag to a horizontal pager", () => {
  const pagerGesture = Gesture.Native().withTestId("host-pager");
  render(<Host pagerGesture={pagerGesture} pagerAxis="horizontal" />);

  const { config } = getByGestureTestId("tempo-bar-pan");
  expect(config.activeOffsetYStart).toBeLessThan(0);
  expect(config.activeOffsetYEnd).toBeGreaterThan(0);
  expect(config.failOffsetXStart).toBeLessThan(0);
  expect(config.failOffsetXEnd).toBeGreaterThan(0);
});

// A vertical pager wants the same drags the bar does. A threshold there would hand it
// swipes the bar is meant to take.
it("keeps every drag when the host pager scrolls on the bar's own axis", () => {
  const pagerGesture = Gesture.Native().withTestId("host-pager");
  render(<Host pagerGesture={pagerGesture} />);

  const { config } = getByGestureTestId("tempo-bar-pan");
  expect(config.activeOffsetYStart).toBeUndefined();
  expect(config.failOffsetXStart).toBeUndefined();
});

// The axis names a pager to argue with. With none supplied there is nothing to concede
// to, and a threshold would only cost the bar drags it should have kept.
it("takes no axis threshold from the axis alone", () => {
  render(<Host pagerAxis="horizontal" />);

  const { config } = getByGestureTestId("tempo-bar-pan");
  expect(config.activeOffsetYStart).toBeUndefined();
  expect(config.failOffsetXStart).toBeUndefined();
});

it("follows a caller's own scale", () => {
  render(<Host initialRate={1} steps={[1, 2, 3]} showValueAtRest />);

  drag(-BAR_HEIGHT / 2);
  expect(rateFromLabel()).toBe("2×");
});

// A rebuilt gesture carries a new handler tag, and the swap would land mid-drag: every
// `onUpdate` re-renders the host, so an inline scale would be a fresh array each frame.
it("keeps one gesture across renders that pass an equal but fresh scale", () => {
  render(<Host steps={[1, 2, 3]} />);
  const { handlerTag } = getByGestureTestId("tempo-bar-pan");

  screen.rerender(<Host steps={[1, 2, 3]} />);

  expect(getByGestureTestId("tempo-bar-pan").handlerTag).toBe(handlerTag);
});

it("snaps on the scale the host last passed, not the one the gesture was built with", () => {
  render(<Host initialRate={1} steps={[1, 2, 3]} showValueAtRest />);

  screen.rerender(<Host initialRate={1} steps={[1, 1.5, 2]} showValueAtRest />);
  drag(-BAR_HEIGHT / 2);

  expect(rateFromLabel()).toBe("1.5×");
});

// The bar is the only playback-speed control on either surface, so a tap on it has to
// land a level rather than wait for a drag the user may not think to make.
it("sets the level a tap lands on", () => {
  render(<Host showValueAtRest />);

  tapAt(0);
  expect(rateFromLabel()).toBe("1.5×");

  tapAt(BAR_HEIGHT);
  expect(rateFromLabel()).toBe("0.5×");

  tapAt(BAR_HEIGHT / 2);
  expect(rateFromLabel()).toBe("1×");
});

it("snaps a tap between two levels to the closer one", () => {
  render(<Host showValueAtRest />);

  // 60% of the way up the bar, short of the 62.5% that separates 1x from 1.25x.
  tapAt(BAR_HEIGHT * 0.4);
  expect(rateFromLabel()).toBe("1×");

  // 70% of the way up, past it.
  tapAt(BAR_HEIGHT * 0.3);
  expect(rateFromLabel()).toBe("1.25×");
});

it("taps on the scale the host passed", () => {
  render(<Host initialRate={1} steps={[1, 2, 3]} showValueAtRest />);

  tapAt(BAR_HEIGHT / 2);
  expect(rateFromLabel()).toBe("2×");
});

// A tap changes nothing the host has to hold its own scrolling for.
it("does not report a tap as a drag", () => {
  const onDragChange = jest.fn();
  render(<Host onDragChange={onDragChange} />);

  tapAt(BAR_HEIGHT / 2);
  expect(onDragChange).not.toHaveBeenCalled();
});
