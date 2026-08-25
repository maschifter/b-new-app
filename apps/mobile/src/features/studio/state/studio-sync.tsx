import { getStudioRoom, saveStudioRoom } from "@/lib/api/client";
import { useAuthSession } from "@/lib/auth/session-provider";
import type { DecorationSnapshot } from "@bnewapp/studio-core";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { hasStoredRoom, persistedDecorationAtom, syncedSnapshotAtom } from "./atoms";

// Cloud sync for a user's studio room. Runs entirely as a side effect: it never
// renders UI and never changes the useStudio() contract, so the screen is
// untouched. MMKV remains the instant local source; this layer pulls the server
// room on login and pushes local edits back, last-write-wins.
//
// The "synced marker" (syncedSnapshotAtom) holds the JSON of the snapshot last
// known equal on both sides. Everything keys off it:
//   dirty  -> local has edits the server has not confirmed
//   pull   -> apply the server room only when NOT dirty (else local wins)
//   push   -> debounce, PUT, then adopt the server-reconciled result
// Applying the server result on push success is what stops a reconcile loop:
// if the server drops an item, local converges to the server's version instead
// of re-sending the dropped item forever.

const PUSH_DEBOUNCE_MS = 800;
const PUSH_RETRY_MAX_DELAY_MS = 30_000;

interface PendingPush {
  snapshot: DecorationSnapshot;
  snapshotJson: string;
}

export function StudioSync({ ownerId }: { ownerId: string }) {
  useStudioSync(ownerId);
  return null;
}

export function useStudioVisitorCount(ownerId: string | undefined): number | undefined {
  const { session } = useAuthSession();
  const token = session?.access_token;
  const enabled = Boolean(ownerId && token && ownerId === session?.user.id);
  const roomQuery = useQuery({
    queryKey: ["studio-room", ownerId],
    queryFn: () => {
      if (!token) throw new Error("Not authenticated");
      return getStudioRoom(token);
    },
    enabled,
    staleTime: 0,
    retry: false,
  });
  const refetchRoom = roomQuery.refetch;
  useFocusEffect(
    useCallback(() => {
      if (enabled) void refetchRoom();
    }, [enabled, refetchRoom]),
  );
  if (roomQuery.data) return roomQuery.data.visitorCount;
  return roomQuery.isSuccess ? 0 : undefined;
}

function useStudioSync(ownerId: string) {
  const { session } = useAuthSession();
  const token = session?.access_token;
  // Only sync the signed-in user's own room — never a "local" room or, later, a
  // visited room, which fail this ownership check.
  const enabled = Boolean(token) && ownerId === session?.user.id;

  const [snapshot, setSnapshot] = useAtom(persistedDecorationAtom(ownerId));
  const [syncedJson, setSyncedJson] = useAtom(syncedSnapshotAtom(ownerId));

  const snapshotJson = JSON.stringify(snapshot);
  // Before the first sync the empty default must not read as edits, so fall back
  // to "has this device ever stored a room" instead of the JSON diff.
  const dirty = syncedJson === null ? hasStoredRoom(ownerId) : snapshotJson !== syncedJson;

  const roomQuery = useQuery({
    queryKey: ["studio-room", ownerId],
    queryFn: () => getStudioRoom(token as string),
    enabled,
    // A room can change on another device while this QueryClient stays alive
    // across logout/login, so it must be stale when Studio mounts again.
    staleTime: 0,
    retry: false,
  });

  // Latest values for callbacks/effects that must not re-run on every edit.
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const snapshotJsonRef = useRef(snapshotJson);
  snapshotJsonRef.current = snapshotJson;
  const setSnapshotRef = useRef(setSnapshot);
  setSnapshotRef.current = setSnapshot;
  const setSyncedJsonRef = useRef(setSyncedJson);
  setSyncedJsonRef.current = setSyncedJson;
  // Prevent this effect from launching duplicate mutations for the same
  // snapshot. React Query retries a failed mutation with backoff.
  const lastPushAttemptJsonRef = useRef<string | null>(null);

  // Pull: adopt the server room when it arrives and local has nothing unpushed.
  useEffect(() => {
    const room = roomQuery.data;
    if (!enabled || !room) return; // no server room yet -> a local edit will seed it
    if (dirtyRef.current) return; // local edits win; the push effect sends them up
    setSnapshotRef.current(room.snapshot);
    setSyncedJsonRef.current(JSON.stringify(room.snapshot));
  }, [enabled, roomQuery.data]);

  const pushMutation = useMutation({
    mutationFn: ({ snapshot: next }: PendingPush) => saveStudioRoom(token as string, next),
    retry: Number.POSITIVE_INFINITY,
    retryDelay: (attemptIndex) => Math.min(1_000 * 2 ** attemptIndex, PUSH_RETRY_MAX_DELAY_MS),
    onSuccess: (room, sent) => {
      // A newer local edit may have landed while this request was in flight.
      // Keep it dirty so the push effect can save it after this mutation settles.
      if (snapshotJsonRef.current !== sent.snapshotJson) return;

      const serverJson = JSON.stringify(room.snapshot);
      setSyncedJsonRef.current(serverJson);
      // Adopt the reconciled result so a server-side drop converges instead of
      // looping. No-op when the server echoed exactly what we sent.
      if (serverJson !== snapshotJsonRef.current) setSnapshotRef.current(room.snapshot);
    },
  });
  const { isPending: isPushPending, mutate: pushRoom } = pushMutation;

  // Push: debounce every dirty snapshot up to the server. Failed pushes retry
  // with backoff so an edit made offline reaches the server once it recovers.
  useEffect(() => {
    if (!enabled || !dirty || isPushPending) return;
    if (lastPushAttemptJsonRef.current === snapshotJson) return;
    const handle = setTimeout(() => {
      lastPushAttemptJsonRef.current = snapshotJson;
      pushRoom({ snapshot, snapshotJson });
    }, PUSH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [enabled, dirty, isPushPending, snapshot, snapshotJson, pushRoom]);
}
