import { queryAuthAtom } from "@/lib/auth/query-auth-atom";
import type { StudioCatalog } from "@bnewapp/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEventAsync, renderAsync, screen } from "@testing-library/react-native";
import { Provider, createStore } from "jotai";
import { queryClientAtom } from "jotai-tanstack-query";
import { getCatalog } from "../../../catalog/api";
import { getInventory, getWallet, purchaseItem } from "../../api";
import { InventoryScreen } from "../inventory-screen";
import { ShopScreen } from "../shop-screen";

jest.mock("../../../catalog/api", () => ({ getCatalog: jest.fn() }));
jest.mock("../../api", () => ({
  getWallet: jest.fn(),
  getInventory: jest.fn(),
  purchaseItem: jest.fn(),
}));

const mockedGetCatalog = jest.mocked(getCatalog);
const mockedGetWallet = jest.mocked(getWallet);
const mockedGetInventory = jest.mocked(getInventory);
const mockedPurchaseItem = jest.mocked(purchaseItem);

const CATALOG: StudioCatalog = {
  version: 2,
  items: [
    {
      id: "plant",
      name: "Plant",
      tags: { type: "decor", size: "S" },
      status: "published",
      access: "free",
      art: { url: "https://example.com/plant.webp" },
    },
    {
      id: "neon-lamp",
      name: "Neon Lamp",
      tags: { type: "wall", size: "M" },
      status: "published",
      access: "premium",
      price: 250,
      art: { url: "https://example.com/neon-lamp.webp" },
    },
    {
      id: "premium-speaker",
      name: "Premium Speaker",
      tags: { type: "low", size: "M" },
      status: "published",
      access: "premium",
      price: 500,
      art: { url: "https://example.com/premium-speaker.webp" },
    },
    {
      id: "hidden-seed",
      name: "Hidden Seed",
      tags: { type: "ceiling" },
      status: "published",
      access: "free",
    },
    {
      id: "misconfigured-premium",
      name: "Misconfigured Premium",
      tags: { type: "decor", size: "S" },
      status: "published",
      access: "premium",
      art: { url: "https://example.com/misconfigured.webp" },
    },
  ],
};

let userSequence = 0;

async function mount(screenElement: React.ReactElement) {
  userSequence += 1;
  const store = createStore();
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { gcTime: Number.POSITIVE_INFINITY },
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
  store.set(queryClientAtom, queryClient);
  store.set(queryAuthAtom, { userId: `shop-user-${userSequence}`, accessToken: "token" });
  await renderAsync(
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>{screenElement}</Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockedGetCatalog.mockReset().mockResolvedValue(CATALOG);
  mockedGetWallet.mockReset().mockResolvedValue({ glow: 999_999 });
  mockedGetInventory.mockReset().mockResolvedValue({
    items: [
      { itemId: "plant", acquiredAt: "2026-08-24T08:00:00.000Z" },
      { itemId: "hidden-seed", acquiredAt: "2026-08-24T07:59:00.000Z" },
    ],
  });
  mockedPurchaseItem.mockReset();
});

it("renders category filters and Buy/Owned states", async () => {
  await mount(<ShopScreen />);

  expect(await screen.findByRole("button", { name: "Owned Plant" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Buy Neon Lamp" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Buy Misconfigured Premium" })).toBeDisabled();
  expect(screen.getByText("Price unavailable")).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Filter by All" })).toBeSelected();
  expect(screen.getByRole("button", { name: "Filter by decor" })).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Filter by wall" })).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Filter by ceiling" })).not.toBeOnTheScreen();
  expect(screen.queryByText("Hidden Seed")).not.toBeOnTheScreen();

  await fireEventAsync.press(screen.getByRole("button", { name: "Filter by wall" }));
  expect(screen.queryByText("Plant")).not.toBeOnTheScreen();
  expect(screen.getByText("Neon Lamp")).toBeOnTheScreen();
});

it("invalidates wallet and inventory after a purchase", async () => {
  mockedGetWallet.mockResolvedValueOnce({ glow: 999_999 }).mockResolvedValue({ glow: 999_749 });
  mockedGetInventory
    .mockResolvedValueOnce({
      items: [{ itemId: "plant", acquiredAt: "2026-08-24T08:00:00.000Z" }],
    })
    .mockResolvedValue({
      items: [
        { itemId: "neon-lamp", acquiredAt: "2026-08-24T08:01:00.000Z" },
        { itemId: "plant", acquiredAt: "2026-08-24T08:00:00.000Z" },
      ],
    });
  mockedPurchaseItem.mockResolvedValue({
    wallet: { glow: 999_749 },
    item: { itemId: "neon-lamp", acquiredAt: "2026-08-24T08:01:00.000Z" },
  });
  await mount(<ShopScreen />);

  await fireEventAsync.press(await screen.findByRole("button", { name: "Buy Neon Lamp" }));

  expect(await screen.findByRole("button", { name: "Owned Neon Lamp" })).toBeDisabled();
  expect(mockedPurchaseItem).toHaveBeenCalledWith("token", { itemId: "neon-lamp" });
  expect(screen.getByLabelText("999,749 Glow")).toBeOnTheScreen();
});

it("shows Buying only on the item being purchased", async () => {
  let resolvePurchase: ((result: Awaited<ReturnType<typeof purchaseItem>>) => void) | undefined;
  mockedPurchaseItem.mockReturnValue(
    new Promise((resolve) => {
      resolvePurchase = resolve;
    }),
  );
  await mount(<ShopScreen />);

  await fireEventAsync.press(await screen.findByRole("button", { name: "Buy Neon Lamp" }));

  expect(await screen.findByRole("button", { name: "Buying… Neon Lamp" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Buy Premium Speaker" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Buying… Premium Speaker" })).not.toBeOnTheScreen();

  resolvePurchase?.({
    wallet: { glow: 999_749 },
    item: { itemId: "neon-lamp", acquiredAt: "2026-08-24T08:01:00.000Z" },
  });
  expect(await screen.findByRole("button", { name: "Buy Neon Lamp" })).toBeEnabled();
});

it("lists owned catalog items in Inventory", async () => {
  const onOpenShop = jest.fn();
  await mount(<InventoryScreen onOpenShop={onOpenShop} />);

  expect(await screen.findByText("Plant")).toBeOnTheScreen();
  expect(screen.queryByText("Neon Lamp")).not.toBeOnTheScreen();
  expect(screen.queryByText("Hidden Seed")).not.toBeOnTheScreen();
  await fireEventAsync.press(screen.getByRole("button", { name: "Shop" }));
  expect(onOpenShop).toHaveBeenCalledTimes(1);
});

it("shows a layout skeleton while the economy is loading", async () => {
  let resolveWallet: ((wallet: { glow: number }) => void) | undefined;
  mockedGetWallet.mockReturnValue(
    new Promise((resolve) => {
      resolveWallet = resolve;
    }),
  );
  await mount(<ShopScreen />);

  expect(screen.getByTestId("shop-skeleton", { includeHiddenElements: true })).toBeOnTheScreen();
  resolveWallet?.({ glow: 999_999 });
  expect(await screen.findByRole("button", { name: "Owned Plant" })).toBeOnTheScreen();
});

it("does not render cached catalog prices before the initial refresh finishes", async () => {
  let resolveCatalog: ((catalog: StudioCatalog) => void) | undefined;
  mockedGetCatalog.mockReturnValue(
    new Promise((resolve) => {
      resolveCatalog = resolve;
    }),
  );
  await mount(<ShopScreen />);

  expect(screen.getByTestId("shop-skeleton", { includeHiddenElements: true })).toBeOnTheScreen();
  expect(screen.queryByText("Free")).not.toBeOnTheScreen();
  resolveCatalog?.(CATALOG);
  expect(await screen.findByRole("button", { name: "Owned Plant" })).toBeOnTheScreen();
});

it("recovers from an initial query error through the screen retry", async () => {
  const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    mockedGetWallet
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ glow: 999_999 });
    await mount(<ShopScreen />);

    expect(await screen.findByText("Couldn't load the Shop")).toBeOnTheScreen();
    await fireEventAsync.press(screen.getByRole("button", { name: "Retry loading the Shop" }));
    expect(await screen.findByRole("button", { name: "Owned Plant" })).toBeOnTheScreen();
  } finally {
    consoleError.mockRestore();
  }
});
