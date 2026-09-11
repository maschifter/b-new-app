import { apiUrl } from "@/lib/api/client";
import type {
  ApiSuccess,
  DanceGenre,
  DanceMove,
  DanceMovesCursor,
  DanceMovesPage,
} from "@bnewapp/types";

interface GetDanceMovesParams {
  genreId?: string | null;
  cursor?: DanceMovesCursor | null;
  limit?: number;
}

function authorization(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

export async function getDanceGenres(accessToken: string): Promise<DanceGenre[]> {
  const response = await fetch(`${apiUrl}/api/dance/genres`, { headers: authorization(accessToken) });
  if (!response.ok) throw new Error("Unable to load dance genres");
  return ((await response.json()) as ApiSuccess<DanceGenre[]>).data;
}

export async function getDanceMoves(
  accessToken: string,
  { genreId, cursor, limit = 20 }: GetDanceMovesParams = {},
): Promise<DanceMovesPage> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (genreId) params.set("genre_id", genreId);
  if (cursor) params.set("cursor", JSON.stringify(cursor));
  const response = await fetch(`${apiUrl}/api/dance/moves?${params.toString()}`, {
    headers: authorization(accessToken),
  });
  if (!response.ok) throw new Error("Unable to load dance moves");
  return ((await response.json()) as ApiSuccess<DanceMovesPage>).data;
}

export async function getDanceMove(accessToken: string, moveId: string): Promise<DanceMove> {
  const response = await fetch(`${apiUrl}/api/dance/moves/${moveId}`, {
    headers: authorization(accessToken),
  });
  if (!response.ok) throw new Error("Unable to load this dance move");
  return ((await response.json()) as ApiSuccess<DanceMove>).data;
}
