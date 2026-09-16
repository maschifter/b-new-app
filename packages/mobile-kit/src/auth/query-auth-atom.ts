import { atom } from "jotai";

/**
 * The query-layer projection of the Supabase session. `AuthSessionProvider` owns
 * this atom and keeps it in sync with the session; feature query atoms read it to
 * scope their cache by `userId` and to authorize requests with `accessToken`.
 * `null` while signed out or mid-transition, which disables authenticated queries.
 * This is a projection of the React auth context, not a second auth source — no
 * atom or component should write it except the provider.
 */
export interface QueryAuth {
  userId: string;
  accessToken: string;
}

export const queryAuthAtom = atom<QueryAuth | null>(null);
