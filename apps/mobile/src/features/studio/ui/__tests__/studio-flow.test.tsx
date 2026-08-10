import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { Provider, createStore } from "jotai";
import { StudioProvider, useStudio } from "../../state/studio-provider";
import { ItemPicker } from "../item-picker";
import { StudioScreen } from "../studio-screen";
import { StudioStage } from "../studio-stage";

// Wire the real stage + picker to provider state without the route chrome
// (SafeAreaView / expo-router) so the test exercises only the interaction path.
function Harness() {
  const { state, template, selectSpot } = useStudio();
  return (
    <>
      <StudioStage
        template={template}
        map={state.map}
        mode={state.mode}
        selectedSpotId={state.selectedSpotId}
        onSelectSpot={selectSpot}
      />
      <ItemPicker />
    </>
  );
}

function renderStudio() {
  render(
    <Provider store={createStore()}>
      <StudioProvider>
        <Harness />
      </StudioProvider>
    </Provider>,
  );
  // The stage only renders spots once it has measured a non-zero size.
  fireEvent(screen.getByTestId("studio-stage"), "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 844 } },
  });
}

describe("studio flow", () => {
  it("renders the stage immediately (MMKV is synchronous, no hydrate gate)", () => {
    render(
      <Provider store={createStore()}>
        <StudioScreen />
      </Provider>,
    );
    expect(screen.getByTestId("studio-stage")).toBeTruthy();
  });

  it("tap spot -> pick a compatible item -> block appears in the spot", () => {
    renderStudio();

    // decor-1 starts empty.
    expect(screen.getByTestId("spot-empty-decor-1")).toBeTruthy();

    // Tap the spot to open the picker.
    fireEvent.press(screen.getByLabelText("Spot decor-1"));

    // Pick a compatible item (decor-1 accepts type=decor,size=S -> "Plant").
    fireEvent.press(screen.getByText("Plant"));

    // The spot now renders a filled block labelled "Plant"; empty outline gone.
    expect(screen.queryByTestId("spot-empty-decor-1")).toBeNull();
    const block = screen.getByTestId("spot-content-decor-1");
    expect(within(block).getByText("Plant")).toBeTruthy();
  });

  it("clearing a filled spot empties it again", () => {
    renderStudio();

    fireEvent.press(screen.getByLabelText("Spot decor-2"));
    fireEvent.press(screen.getByText("Trophy"));
    expect(screen.getByTestId("spot-content-decor-2")).toBeTruthy();

    // Reopen and remove.
    fireEvent.press(screen.getByLabelText("Spot decor-2"));
    fireEvent.press(screen.getByText("Remove item"));
    expect(screen.getByTestId("spot-empty-decor-2")).toBeTruthy();
  });
});
