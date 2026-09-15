import { queryAuthAtom } from "@/lib/auth/query-auth-atom";
import { createTestQueryClient, createTestStore } from "@/test-utils/render-with-providers";
import type { StudioCatalog } from "@bnewapp/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Provider } from "jotai";
import { queryClientAtom } from "jotai-tanstack-query";
import { MMKV } from "react-native-mmkv";
import { getCatalog } from "../../../catalog/api";
import { getInventory } from "../../../shop/api";
import { StudioProvider, useStudio } from "../../state/studio-provider";
import { ItemPicker } from "../item-picker";
import { StudioScreen } from "../studio-screen";
import { StudioStage } from "../studio-stage";

jest.mock("../../../catalog/api", () => ({ getCatalog: jest.fn() }));
jest.mock("../../../shop/api", () => ({
  getInventory: jest.fn(),
  getWallet: jest.fn(),
  purchaseItem: jest.fn(),
}));

const mockedGetCatalog = jest.mocked(getCatalog);
const mockedGetInventory = jest.mocked(getInventory);

function testStore(queryClient = createTestQueryClient()) {
  return createTestStore({ queryClient }).store;
}

// Wire the real stage + picker to provider state without the route chrome
// (SafeAreaView / expo-router) so the test exercises only the interaction path.
function Harness({ onOpenShop }: { onOpenShop?: () => void }) {
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
      <ItemPicker onOpenShop={onOpenShop} />
    </>
  );
}

function renderStudio(catalog?: StudioCatalog, userId = "studio-user", onOpenShop?: () => void) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY, retry: false } },
  });
  const store = testStore(queryClient);
  store.set(queryAuthAtom, { userId, accessToken: "token" });
  if (catalog) {
    new MMKV({ id: "catalog" }).set(`catalog:v1:${userId}`, JSON.stringify(catalog));
  } else if (catalog) {
    queryClient.setQueryData(["studio-catalog", null], catalog);
  }
  render(
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>
        <StudioProvider>
          <Harness onOpenShop={onOpenShop} />
        </StudioProvider>
      </Provider>
    </QueryClientProvider>,
  );
  // The stage only renders spots once it has measured a non-zero size.
  fireEvent(screen.getByTestId("studio-stage"), "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 844 } },
  });
}

const UPLOADED_CATALOG: StudioCatalog = {
  version: 1,
  items: [
    {
      id: "plant",
      tags: { type: "decor", size: "S" },
      name: "Plant",
      status: "published",
      access: "free",
      art: { url: "https://example.com/plant.webp" },
    },
    {
      id: "skateboard",
      tags: { type: "decor", size: "S" },
      name: "Skateboard",
      status: "published",
      access: "free",
      art: { url: "https://example.com/skateboard.webp" },
    },
  ],
};

describe("studio flow", () => {
  beforeEach(() => {
    mockedGetCatalog.mockReset().mockReturnValue(new Promise(() => {}));
    mockedGetInventory.mockReset().mockResolvedValue({
      items: [
        { itemId: "plant", acquiredAt: "2026-08-24T08:00:00.000Z" },
        { itemId: "skateboard", acquiredAt: "2026-08-24T08:00:00.000Z" },
        { itemId: "remote-plant", acquiredAt: "2026-08-24T08:00:00.000Z" },
      ],
    });
  });

  it("renders the stage immediately (MMKV is synchronous, no hydrate gate)", () => {
    render(
      <Provider store={testStore()}>
        <StudioScreen />
      </Provider>,
    );
    expect(screen.getByTestId("studio-stage")).toBeTruthy();
    expect(screen.queryByText("Visitors: 0")).not.toBeOnTheScreen();
  });

  it("shows the owner's total room visitors", () => {
    render(
      <Provider store={testStore()}>
        <StudioScreen visitorCount={24} />
      </Provider>,
    );

    expect(screen.getByText("Visitors: 24")).toBeOnTheScreen();
    expect(screen.getByLabelText("24 room visitors")).toBeOnTheScreen();
  });

  it("tap spot -> pick a compatible item -> block appears in the spot", async () => {
    renderStudio(UPLOADED_CATALOG);

    // decor-1 starts empty.
    expect(screen.getByTestId("spot-empty-decor-1")).toBeTruthy();

    // Tap the spot to open the picker.
    fireEvent.press(screen.getByLabelText("Spot decor-1"));

    // Pick a compatible item (decor-1 accepts type=decor,size=S -> "Plant").
    fireEvent.press(await screen.findByText("Plant"));

    // The spot now renders the filled sprite; the empty outline is gone.
    expect(screen.queryByTestId("spot-empty-decor-1")).toBeNull();
    expect(screen.getByTestId("spot-content-decor-1")).toBeTruthy();
  });

  it("clearing a filled spot empties it again", async () => {
    renderStudio(UPLOADED_CATALOG);

    fireEvent.press(screen.getByLabelText("Spot decor-2"));
    fireEvent.press(await screen.findByText("Skateboard"));
    expect(screen.getByTestId("spot-content-decor-2")).toBeTruthy();

    // Reopen and remove.
    fireEvent.press(screen.getByLabelText("Spot decor-2"));
    fireEvent.press(screen.getByLabelText("Remove item"));
    expect(screen.getByTestId("spot-empty-decor-2")).toBeTruthy();
  });

  it("renders an admin-managed display name and places the dynamic item", async () => {
    renderStudio({
      version: 4,
      items: [
        {
          id: "remote-plant",
          tags: { type: "decor", size: "S" },
          name: "Admin Plant",
          status: "published",
          access: "free",
          art: { url: "https://example.com/remote-plant.webp" },
        },
      ],
    });

    fireEvent.press(screen.getByLabelText("Spot decor-1"));
    fireEvent.press(await screen.findByRole("button", { name: "Admin Plant" }));

    expect(screen.getByTestId("spot-content-decor-1")).toBeTruthy();
  });

  it("shows an empty picker when catalog items do not have uploaded art", async () => {
    renderStudio();

    fireEvent.press(screen.getByLabelText("Spot decor-1"));

    expect(screen.queryByRole("button", { name: "Plant" })).toBeNull();
    expect(
      await screen.findByText("You don't own a compatible item for this spot yet."),
    ).toBeTruthy();
  });

  it("keeps cached picker items usable when a background catalog refresh fails", async () => {
    mockedGetCatalog.mockRejectedValue(new Error("offline"));
    renderStudio(UPLOADED_CATALOG, "catalog-error-user");

    fireEvent.press(screen.getByLabelText("Spot decor-1"));

    expect(
      await screen.findByText("Couldn't refresh items. Showing your saved catalog."),
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Retry refreshing catalog" })).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Plant" }));
    expect(screen.getByTestId("spot-content-decor-1")).toBeOnTheScreen();
  });

  it("hides compatible catalog items the user does not own", async () => {
    mockedGetInventory.mockResolvedValue({
      items: [{ itemId: "plant", acquiredAt: "2026-08-24T08:00:00.000Z" }],
    });
    renderStudio(UPLOADED_CATALOG, "owned-filter-user");

    fireEvent.press(screen.getByLabelText("Spot decor-1"));

    expect(await screen.findByRole("button", { name: "Plant" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Skateboard" })).not.toBeOnTheScreen();
  });

  it("shows inventory loading instead of the Shop hint while ownership is pending", () => {
    mockedGetInventory.mockReturnValue(new Promise(() => {}));
    renderStudio(UPLOADED_CATALOG, "pending-inventory-user", jest.fn());

    fireEvent.press(screen.getByLabelText("Spot decor-1"));

    expect(screen.getByRole("progressbar", { name: "Loading owned items" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Buy more in the Shop" })).not.toBeOnTheScreen();
  });

  it("opens the Shop after ownership loads with no compatible item", async () => {
    const onOpenShop = jest.fn();
    mockedGetInventory.mockResolvedValue({ items: [] });
    renderStudio(UPLOADED_CATALOG, "empty-inventory-user", onOpenShop);

    fireEvent.press(screen.getByLabelText("Spot decor-1"));
    fireEvent.press(await screen.findByRole("button", { name: "Buy more in the Shop" }));

    expect(onOpenShop).toHaveBeenCalledTimes(1);
  });
});
