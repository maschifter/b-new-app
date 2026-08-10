import type { DecorationSnapshot } from "../domain/types";
import type { DecorationRepository } from "./repository";

// In-memory fake for tests (design §9.8) — same interface as the device impl,
// so the provider and any consumer can be exercised without AsyncStorage.
export function createMemoryRepository(
  seed: Record<string, DecorationSnapshot> = {},
): DecorationRepository {
  const store = new Map<string, DecorationSnapshot>(Object.entries(seed));
  return {
    async load(ownerId) {
      return store.get(ownerId) ?? null;
    },
    async save(ownerId, snapshot) {
      store.set(ownerId, snapshot);
    },
  };
}
