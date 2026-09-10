import { queryAuthAtom } from "@/lib/auth/query-auth-atom";
import type { StudioCatalog } from "@bnewapp/types";
import { QueryClient } from "@tanstack/react-query";
import { waitFor } from "@testing-library/react-native";
import { Image } from "expo-image";
import { createStore } from "jotai";
import { queryClientAtom } from "jotai-tanstack-query";
import { MMKV } from "react-native-mmkv";
import { getCatalog } from "../../api";
import { catalogAtom, catalogItemByIdAtom } from "../queries";

jest.mock("../../api", () => ({ getCatalog: jest.fn() }));

const mockedGetCatalog = jest.mocked(getCatalog);

const REMOTE_CATALOG: StudioCatalog = {
  version: 7,
  items: [
    {
      id: "remote-plant",
      tags: { type: "decor", size: "S" },
      name: "Remote Plant",
      status: "published",
      access: "free",
      art: { url: "https://example.com/remote-plant.webp" },
    },
  ],
};

function catalogStore(userId: string | null) {
  const store = createStore();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY, retry: false } },
  });
  store.set(queryClientAtom, queryClient);
  if (userId) store.set(queryAuthAtom, { userId, accessToken: "token" });
  return store;
}

beforeEach(() => {
  mockedGetCatalog.mockReset();
});

describe("catalogAtom synchronous initial data", () => {
  it("uses the bundled catalog on a first-ever cold start without suspending", () => {
    const store = catalogStore(null);

    const query = store.get(catalogAtom);

    expect(query.status).toBe("success");
    expect(query.data.items).toHaveLength(39);
    expect(store.get(catalogItemByIdAtom).get("plant")?.name).toBe("Plant");
    expect(mockedGetCatalog).not.toHaveBeenCalled();
  });

  it("reads a user-scoped MMKV catalog synchronously before refreshing", () => {
    new MMKV({ id: "catalog" }).set("catalog:v1:user-1", JSON.stringify(REMOTE_CATALOG));
    mockedGetCatalog.mockReturnValue(new Promise(() => {}));
    const store = catalogStore("user-1");
    const unsubscribe = store.sub(catalogAtom, () => {});

    expect(store.get(catalogAtom).data).toEqual(REMOTE_CATALOG);
    expect(store.get(catalogItemByIdAtom).get("remote-plant")?.name).toBe("Remote Plant");
    unsubscribe();
  });

  it("keeps an intentionally empty cached catalog instead of restoring bundled items", () => {
    const emptyCatalog: StudioCatalog = { version: 8, items: [] };
    new MMKV({ id: "catalog" }).set("catalog:v1:user-empty", JSON.stringify(emptyCatalog));
    mockedGetCatalog.mockReturnValue(new Promise(() => {}));
    const store = catalogStore("user-empty");
    const unsubscribe = store.sub(catalogAtom, () => {});

    expect(store.get(catalogAtom).data).toEqual(emptyCatalog);
    expect(store.get(catalogItemByIdAtom).size).toBe(0);
    unsubscribe();
  });

  it("persists a successful refresh and prefetches immutable remote art", async () => {
    mockedGetCatalog.mockResolvedValue(REMOTE_CATALOG);
    const prefetch = jest.spyOn(Image, "prefetch").mockResolvedValue(true);
    const store = catalogStore("user-2");
    const unsubscribe = store.sub(catalogAtom, () => {});

    await waitFor(() => {
      expect(store.get(catalogAtom).data).toEqual(REMOTE_CATALOG);
    });

    expect(new MMKV({ id: "catalog" }).getString("catalog:v1:user-2")).toBe(
      JSON.stringify(REMOTE_CATALOG),
    );
    expect(prefetch).toHaveBeenCalledWith(["https://example.com/remote-plant.webp"], "memory-disk");
    unsubscribe();
    prefetch.mockRestore();
  });
});
