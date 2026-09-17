import { writeGenresCacheAtom } from "@/lib/catalog";
import { type LearnedMoveSnapshot, recordFirstScanAtom } from "@/lib/collection";
import { getDanceGenres } from "@bnewapp/dance-flow/api";
import { type TestStore, createTestStore, renderWithProviders } from "@bnewapp/mobile-kit/testing";
import type { DanceGenre } from "@bnewapp/types";
import { fireEventAsync, screen } from "@testing-library/react-native";
import { ProfileStyleScreen } from "../profile-style-screen";

jest.mock("@bnewapp/dance-flow/api", () => ({ getDanceGenres: jest.fn() }));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (href: string) => mockPush(href) } }));

const mockedGetGenres = getDanceGenres as jest.Mock;

const HIP_HOP: DanceGenre = { id: "hip-hop", name: "Hip Hop", sortOrder: 1 };
const onBack = jest.fn();

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

function learn(store: TestStore, moveId: string, overrides: Partial<LearnedMoveSnapshot> = {}) {
  store.set(recordFirstScanAtom, {
    moveId,
    score: 70,
    isExternalScore: true,
    snapshot: snapshot(overrides),
  });
}

async function mount(store: TestStore, styleId = HIP_HOP.id) {
  await renderWithProviders(<ProfileStyleScreen styleId={styleId} onBack={onBack} />, { store });
}

beforeEach(() => {
  mockPush.mockReset();
  onBack.mockReset();
  mockedGetGenres.mockReset();
  mockedGetGenres.mockResolvedValue([HIP_HOP]);
});

it("lists every learned move in the style, titled by the style's name", async () => {
  const { store } = createTestStore({ auth: { userId: "dancer", accessToken: "token" } });
  store.set(writeGenresCacheAtom, [HIP_HOP]);
  learn(store, "a", { title: "Two Step" });
  learn(store, "b", { title: "Slide" });
  learn(store, "c", { title: "Ballet Jump", genreIds: ["ballet"] });

  await mount(store);

  expect(screen.getByText("Hip Hop")).toBeOnTheScreen();
  expect(screen.getByTestId("style-moves-grid").props.data).toHaveLength(2);
  expect(screen.queryByLabelText(/Ballet Jump/)).toBeNull();

  await fireEventAsync.press(screen.getByLabelText("Slide, Hip Hop, level 2, score 70"));
  expect(mockPush).toHaveBeenCalledWith("/profile/b");
});

it("says so when nothing is learned in the style yet", async () => {
  const { store } = createTestStore({ auth: { userId: "dancer", accessToken: "token" } });
  store.set(writeGenresCacheAtom, [HIP_HOP]);

  await mount(store);

  expect(screen.getByText("You haven't learned a move in this style yet.")).toBeOnTheScreen();
});
