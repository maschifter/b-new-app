import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DecorationSnapshot } from "../../domain/types";
import { asyncStorageRepository } from "../async-storage-repository";
import { createMemoryRepository } from "../memory-repository";

const snapshot: DecorationSnapshot = {
  version: 1,
  templateId: "studio-room-1",
  map: { "floor-main": { source: "catalog", id: "rug" } },
};

describe("memory repository", () => {
  it("round-trips a saved snapshot", async () => {
    const repo = createMemoryRepository();
    await repo.save("user-1", snapshot);
    expect(await repo.load("user-1")).toEqual(snapshot);
  });

  it("returns null for an unknown owner", async () => {
    const repo = createMemoryRepository();
    expect(await repo.load("nobody")).toBeNull();
  });

  it("overwrites on re-save (last write wins per owner)", async () => {
    const repo = createMemoryRepository();
    await repo.save("user-1", snapshot);
    const next: DecorationSnapshot = { ...snapshot, map: {} };
    await repo.save("user-1", next);
    expect(await repo.load("user-1")).toEqual(next);
  });
});

describe("async-storage repository", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("round-trips a saved snapshot", async () => {
    await asyncStorageRepository.save("user-1", snapshot);
    expect(await asyncStorageRepository.load("user-1")).toEqual(snapshot);
  });

  it("returns null for an unknown owner", async () => {
    expect(await asyncStorageRepository.load("nobody")).toBeNull();
  });

  it("keeps owners isolated by key", async () => {
    await asyncStorageRepository.save("user-1", snapshot);
    expect(await asyncStorageRepository.load("user-2")).toBeNull();
  });

  it("reads corrupt data as no room rather than crashing", async () => {
    await AsyncStorage.setItem("studio:v1:user-1", "{ not valid json");
    expect(await asyncStorageRepository.load("user-1")).toBeNull();
  });

  it("rejects structurally invalid snapshots", async () => {
    await AsyncStorage.setItem("studio:v1:user-1", JSON.stringify({ hello: "world" }));
    expect(await asyncStorageRepository.load("user-1")).toBeNull();
  });

  it("rejects malformed map entries before reconciliation", async () => {
    await AsyncStorage.setItem(
      "studio:v1:user-1",
      JSON.stringify({ version: 1, templateId: "studio-room-1", map: { "decor-1": null } }),
    );
    expect(await asyncStorageRepository.load("user-1")).toBeNull();
  });
});
