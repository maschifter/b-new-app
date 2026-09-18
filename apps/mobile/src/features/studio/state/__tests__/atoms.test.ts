import { type TestStore, createTestStore } from "@bnewapp/mobile-kit/testing";
import { CATALOG } from "@bnewapp/studio-core";
import type { StudioCatalog } from "@bnewapp/types";
import { queryClientAtom } from "jotai-tanstack-query";
import { decorationAtom } from "../atoms";

function testStore(): TestStore {
  return createTestStore().store;
}

function withCatalog(catalog: StudioCatalog): TestStore {
  const store = testStore();
  store.get(queryClientAtom).setQueryData(["studio-catalog", null], catalog);
  return store;
}

// atomWithStorage only syncs with MMKV while the atom is mounted (its onMount
// reads storage; its writes flush to storage). Components mount atoms via
// useAtom, so this mirrors real usage: subscribe, run, unsubscribe.
function withRoom<T>(store: TestStore, ownerId: string, run: () => T): T {
  const unsub = store.sub(decorationAtom(ownerId), () => {});
  try {
    return run();
  } finally {
    unsub();
  }
}

// coerceSnapshot's own unit tests moved with it into @bnewapp/studio-core; the
// cases below exercise how the store composes coerce -> migrate -> reconcile.

// The rendered decoration is the raw persisted snapshot reconciled against the
// current template + catalog on every read (design §6, rule 8).
describe("decorationAtom reconcile-on-load", () => {
  it("drops an entry whose item no longer fits its spot", () => {
    const store = testStore();
    // poster is a wall item; floor-main only accepts floor items -> dropped.
    store.set(decorationAtom("user-1"), {
      version: 1,
      templateId: "studio-room-1",
      map: { "floor-main": { source: "catalog", id: "poster" } },
    });
    expect(store.get(decorationAtom("user-1")).map).toEqual({});
  });

  it("keeps a compatible entry", () => {
    const store = testStore();
    store.set(decorationAtom("user-1"), {
      version: 1,
      templateId: "studio-room-1",
      map: { "decor-1": { source: "catalog", id: "plant" } },
    });
    expect(store.get(decorationAtom("user-1")).map).toEqual({
      "decor-1": { source: "catalog", id: "plant" },
    });
  });

  it("keeps an admin-added placement when the dynamic catalog contains it", () => {
    const store = withCatalog({
      version: 2,
      items: [
        {
          id: "remote-plant",
          tags: { type: "decor", size: "S" },
          name: "Remote Plant",
          status: "published",
          access: "free",
        },
      ],
    });
    store.set(decorationAtom("user-dynamic"), {
      version: 1,
      templateId: "studio-room-1",
      map: { "decor-1": { source: "catalog", id: "remote-plant" } },
    });

    expect(store.get(decorationAtom("user-dynamic")).map).toEqual({
      "decor-1": { source: "catalog", id: "remote-plant" },
    });
  });

  it("removes a placement hidden from the latest dynamic catalog", () => {
    const store = withCatalog({
      version: 3,
      items: CATALOG.filter((item) => item.id !== "plant").map((item) => ({
        ...item,
        name: item.id,
        status: "published",
        access: "free",
      })),
    });
    store.set(decorationAtom("user-hidden"), {
      version: 1,
      templateId: "studio-room-1",
      map: { "decor-1": { source: "catalog", id: "plant" } },
    });

    expect(store.get(decorationAtom("user-hidden")).map).toEqual({});
  });
});

describe("decorationAtom persistence", () => {
  it("persists a write so a fresh store restores it for the same owner", () => {
    const writer = testStore();
    withRoom(writer, "user-1", () =>
      writer.set(decorationAtom("user-1"), {
        version: 1,
        templateId: "studio-room-1",
        map: { "decor-1": { source: "catalog", id: "plant" } },
      }),
    );
    // A new store (same underlying MMKV) reads the persisted room back.
    const reader = testStore();
    const restored = withRoom(reader, "user-1", () => reader.get(decorationAtom("user-1")).map);
    expect(restored).toEqual({ "decor-1": { source: "catalog", id: "plant" } });
  });

  it("keeps rooms isolated by owner", () => {
    const writer = testStore();
    withRoom(writer, "user-1", () =>
      writer.set(decorationAtom("user-1"), {
        version: 1,
        templateId: "studio-room-1",
        map: { "decor-1": { source: "catalog", id: "plant" } },
      }),
    );
    const reader = testStore();
    const other = withRoom(reader, "user-2", () => reader.get(decorationAtom("user-2")).map);
    // user-2 has nothing persisted, so it reads back the first-run empty default,
    // not user-1's room — proving the two owners stay isolated.
    expect(other).toEqual({});
  });
});
