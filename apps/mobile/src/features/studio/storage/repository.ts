import type { DecorationSnapshot } from "../domain/types";

// The single storage gateway (design §6, §9.5): the only thing that touches
// storage. Today it writes to the device; later its internals swap to Supabase
// without touching business logic. Keyed by ownerId from the start so visiting
// another user's room becomes `load(otherUserId)` with no interface change.
export interface DecorationRepository {
  load(ownerId: string): Promise<DecorationSnapshot | null>;
  save(ownerId: string, snapshot: DecorationSnapshot): Promise<void>;
}
