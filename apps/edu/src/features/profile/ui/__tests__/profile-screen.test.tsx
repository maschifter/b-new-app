import { writeGenresCacheAtom } from "@/lib/catalog";
import { type LearnedMoveSnapshot, recordFirstScanAtom } from "@/lib/collection";
import { getDanceGenres } from "@bnewapp/dance-flow/api";
import { type TestStore, createTestStore, renderWithProviders } from "@bnewapp/mobile-kit/testing";
import type { DanceGenre } from "@bnewapp/types";
import { act, fireEventAsync, screen } from "@testing-library/react-native";
import { ProfileScreen } from "../profile-screen";

jest.mock("@bnewapp/dance-flow/api", () => ({ getDanceGenres: jest.fn() }));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (href: string) => mockPush(href) } }));

const mockedGetGenres = getDanceGenres as jest.Mock;

const AUTH = { userId: "dancer", accessToken: "token" };
const HIP_HOP: DanceGenre = { id: "hip-hop", name: "Hip Hop", sortOrder: 1 };
const AFRO: DanceGenre = { id: "afro", name: "Afro", sortOrder: 2 };
const onBack = jest.fn();
/** The skeleton and the empty slots are hidden from assistive tech, so queries opt in. */
const HIDDEN = { includeHiddenElements: true } as const;

function snapshot(overrides: Partial<LearnedMoveSnapshot> = {}): LearnedMoveSnapshot {
  return {
    title: "Two Step",
    thumbnailUrl: null,
    genreIds: ["hip-hop"],
    level: 2,
    videoUrl: "https://cdn.example.test/two-step.mp4",
    ...overrides,
  };
}

function learn(
  store: TestStore,
  moveId: string,
  score: number,
  overrides: Partial<LearnedMoveSnapshot> = {},
) {
  store.set(recordFirstScanAtom, {
    moveId,
    score,
    isExternalScore: true,
    snapshot: snapshot(overrides),
  });
}

function storeWithCachedGenres(genres: DanceGenre[] = [HIP_HOP, AFRO]): TestStore {
  const { store } = createTestStore({ auth: AUTH });
  store.set(writeGenresCacheAtom, genres);
  return store;
}

async function mount(store: TestStore) {
  await renderWithProviders(<ProfileScreen onBack={onBack} />, { store });
}

beforeEach(() => {
  mockPush.mockReset();
  onBack.mockReset();
  mockedGetGenres.mockReset();
  mockedGetGenres.mockResolvedValue([HIP_HOP, AFRO]);
});

describe("the summary", () => {
  it("shows the mean of the saved scores and the learned count", async () => {
    const store = storeWithCachedGenres();
    learn(store, "a", 20);
    learn(store, "b", 100);

    await mount(store);

    expect(screen.getByLabelText("Average Score, 60 percent")).toBeOnTheScreen();
    expect(screen.getByLabelText("2 moves learned")).toBeOnTheScreen();
  });

  it("shows -- rather than 0% with nothing learned, and the singular at one move", async () => {
    const store = storeWithCachedGenres();

    await mount(store);
    expect(screen.getByLabelText("Average Score, no scores yet")).toBeOnTheScreen();
    expect(screen.getByText("--")).toBeOnTheScreen();

    await act(async () => learn(store, "a", 70));
    expect(screen.getByLabelText("1 move learned")).toBeOnTheScreen();
  });
});

describe("the style sections", () => {
  it("renders from the persisted list when the genre query fails", async () => {
    mockedGetGenres.mockRejectedValue(new Error("offline"));
    const store = storeWithCachedGenres();
    learn(store, "a", 70);

    await mount(store);

    expect(await screen.findByText("Hip Hop")).toBeOnTheScreen();
    expect(screen.getByText("Afro")).toBeOnTheScreen();
    expect(screen.queryByTestId("dance-skeleton", HIDDEN)).toBeNull();
  });

  it("renders from the persisted list while the query never resolves", async () => {
    mockedGetGenres.mockReturnValue(new Promise<DanceGenre[]>(() => {}));
    const store = storeWithCachedGenres();

    await mount(store);

    expect(screen.getByText("Hip Hop")).toBeOnTheScreen();
    expect(screen.queryByTestId("dance-skeleton", HIDDEN)).toBeNull();
  });

  it("shows the skeleton rather than zero sections while the list is unknown", async () => {
    mockedGetGenres.mockReturnValue(new Promise<DanceGenre[]>(() => {}));
    const { store } = createTestStore({ auth: AUTH });

    await mount(store);

    expect(screen.getByTestId("dance-skeleton", HIDDEN)).toBeOnTheScreen();
    expect(screen.queryByTestId("profile-sections")).toBeNull();
    expect(screen.queryAllByTestId("profile-empty-slot", HIDDEN)).toHaveLength(0);
  });

  // The sections are the only door into the collection, so a permanent "no styles" would
  // lock a user with learned moves out of their own moves.
  it("offers a retry rather than an empty when the fetch fails with nothing cached", async () => {
    mockedGetGenres.mockRejectedValue(new Error("offline"));
    const { store } = createTestStore({ auth: AUTH });
    learn(store, "a", 70);

    await mount(store);

    expect(await screen.findByLabelText("Retry loading your styles")).toBeOnTheScreen();
    expect(screen.queryByText("No styles to show yet.")).toBeNull();
    expect(screen.queryByTestId("profile-sections")).toBeNull();

    mockedGetGenres.mockResolvedValue([HIP_HOP]);
    await fireEventAsync.press(screen.getByLabelText("Retry loading your styles"));

    expect(await screen.findByText("Hip Hop")).toBeOnTheScreen();
    expect(screen.queryByLabelText("Retry loading your styles")).toBeNull();
  });

  it("pads an unlearned style with non-interactive empty slots and disables its See More", async () => {
    const store = storeWithCachedGenres([AFRO]);

    await mount(store);

    // The slots are hidden from the accessibility tree on purpose, so the queries opt in.
    expect(screen.getAllByTestId("profile-empty-slot", HIDDEN)).toHaveLength(4);
    expect(screen.queryAllByTestId("profile-empty-slot")).toHaveLength(0);
    const seeMore = screen.getByLabelText("See more Afro moves");
    expect(seeMore).toBeDisabled();
    await fireEventAsync.press(seeMore);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("opens See More and a card, and counts the section off its own list", async () => {
    const store = storeWithCachedGenres();
    learn(store, "a", 70);

    await mount(store);

    expect(screen.getByText("1 move learned")).toBeOnTheScreen();
    expect(screen.getByText("0 moves learned")).toBeOnTheScreen();

    await fireEventAsync.press(screen.getByLabelText("See more Hip Hop moves"));
    expect(mockPush).toHaveBeenCalledWith("/profile/style/hip-hop");

    await fireEventAsync.press(screen.getByLabelText("Two Step, Hip Hop, level 2, score 70"));
    expect(mockPush).toHaveBeenCalledWith("/profile/a");
  });

  it("names a card by its move, style, level and saved score", async () => {
    const store = storeWithCachedGenres();
    learn(store, "a", 82, { title: "Slide", level: 3 });

    await mount(store);

    expect(screen.getByLabelText("Slide, Hip Hop, level 3, score 82")).toBeOnTheScreen();
  });

  it("puts a move with two genres in both sections, and counts it once in the summary", async () => {
    const store = storeWithCachedGenres();
    learn(store, "a", 70, { genreIds: ["hip-hop", "afro"] });

    await mount(store);

    expect(screen.getByLabelText("Two Step, Hip Hop, level 2, score 70")).toBeOnTheScreen();
    expect(screen.getByLabelText("Two Step, Afro, level 2, score 70")).toBeOnTheScreen();
    // The section counts sum to more than the learned count, and neither is wrong.
    expect(screen.getAllByText("1 move learned")).toHaveLength(2);
    expect(screen.getByLabelText("1 move learned")).toBeOnTheScreen();
  });

  it("keeps a move whose genres match no section in the summary, under no section", async () => {
    const store = storeWithCachedGenres();
    learn(store, "a", 70, { genreIds: ["ballet"] });

    await mount(store);

    expect(screen.queryByLabelText(/Two Step/)).toBeNull();
    expect(screen.getByLabelText("1 move learned")).toBeOnTheScreen();
    expect(screen.getAllByText("0 moves learned")).toHaveLength(2);
  });

  it("renders a learned move whose catalog row was unpublished, from its snapshot", async () => {
    const store = storeWithCachedGenres();
    learn(store, "a", 55, { title: "Retired Move" });
    mockedGetGenres.mockRejectedValue(new Error("offline"));

    await mount(store);

    expect(screen.getByLabelText("Retired Move, Hip Hop, level 2, score 55")).toBeOnTheScreen();
    expect(mockedGetGenres).toHaveBeenCalledTimes(1);
  });
});
