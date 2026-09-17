import { DevMenu } from "@/features/dev-menu/dev-menu";
import { simulatedDanceRecordingEnabledAtom } from "@bnewapp/dance-flow/dev";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Provider, createStore } from "jotai";

// The toggles read the dance flow's persisted atoms, which bind their MMKV store on
// first read — the app does this in its bootstrap module.
require("@bnewapp/dance-flow/config").configureDanceFlow({
  apiUrl: "http://localhost:3000",
  mmkvId: "edu-dance",
});

it("opens from the floating button and flips the simulated recording switch", () => {
  const store = createStore();
  render(
    <Provider store={store}>
      <DevMenu />
    </Provider>,
  );

  expect(screen.queryByLabelText("Enable simulated scan recording")).toBeNull();

  fireEvent(screen.getByLabelText("Open developer menu"), "accessibilityAction", {
    nativeEvent: { actionName: "activate" },
  });

  const toggle = screen.getByLabelText("Enable simulated scan recording");
  fireEvent(toggle, "valueChange", true);

  expect(store.get(simulatedDanceRecordingEnabledAtom)).toBe(true);
});
