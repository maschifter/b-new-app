import { fireEvent, render, screen } from "@testing-library/react-native";
import { DevMenu, type DevMenuToggle } from "../dev-menu";

function toggle(overrides: Partial<DevMenuToggle> = {}): DevMenuToggle {
  return {
    key: "simulated-recording",
    label: "Simulated capture",
    description: "Return a cached MP4 instead of filming.",
    accessibilityLabel: "Enable simulated capture",
    value: false,
    onValueChange: jest.fn(),
    ...overrides,
  };
}

function openMenu() {
  fireEvent(screen.getByLabelText("Open developer menu"), "accessibilityAction", {
    nativeEvent: { actionName: "activate" },
  });
}

it("keeps the sheet closed until the button is activated", () => {
  render(
    <DevMenu position={{ right: 12, bottom: 108 }} onPositionChange={() => {}} toggles={[]} />,
  );

  expect(screen.queryByText("Dev menu")).toBeNull();

  openMenu();

  expect(screen.getByText("Dev menu")).toBeTruthy();
});

it("renders every toggle the host app passes and reports a flip", () => {
  const onValueChange = jest.fn();
  render(
    <DevMenu
      position={{ right: 12, bottom: 108 }}
      onPositionChange={() => {}}
      toggles={[
        toggle({ onValueChange }),
        toggle({
          key: "back-camera",
          label: "Use the back camera",
          accessibilityLabel: "Enable the back camera",
        }),
      ]}
    />,
  );
  openMenu();

  expect(screen.getByText("Use the back camera")).toBeTruthy();
  fireEvent(screen.getByLabelText("Enable simulated capture"), "valueChange", true);

  expect(onValueChange).toHaveBeenCalledWith(true);
});

it("places the button where the host app says", () => {
  render(
    <DevMenu position={{ right: 20, bottom: 260 }} onPositionChange={() => {}} toggles={[]} />,
  );

  expect(screen.getByLabelText("Open developer menu")).toHaveStyle({ right: 20, bottom: 260 });
});
