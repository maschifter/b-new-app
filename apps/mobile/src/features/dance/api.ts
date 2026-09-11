import { apiUrl, authHeaders, unwrapApiSuccess } from "@/lib/api/client";
import type { DanceGenre, DanceMove, DanceMovesCursor, DanceMovesPage } from "@bnewapp/types";

interface GetDanceMovesParams {
  genreId?: string | null;
  cursor?: DanceMovesCursor | null;
  limit?: number;
}

export async function getDanceGenres(accessToken: string): Promise<DanceGenre[]> {
  const response = await fetch(`${apiUrl}/api/dance/genres`, {
    headers: authHeaders(accessToken),
  });
  return unwrapApiSuccess<DanceGenre[]>(response, "Unable to load dance genres");
}

export async function getDanceMoves(
  accessToken: string,
  { genreId, cursor, limit = 20 }: GetDanceMovesParams = {},
): Promise<DanceMovesPage> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (genreId) params.set("genre_id", genreId);
  if (cursor) params.set("cursor", JSON.stringify(cursor));
  const response = await fetch(`${apiUrl}/api/dance/moves?${params.toString()}`, {
    headers: authHeaders(accessToken),
  });
  return unwrapApiSuccess<DanceMovesPage>(response, "Unable to load dance moves");
}

export async function getDanceMove(accessToken: string, moveId: string): Promise<DanceMove> {
  const response = await fetch(`${apiUrl}/api/dance/moves/${moveId}`, {
    headers: authHeaders(accessToken),
  });
  return unwrapApiSuccess<DanceMove>(response, "Unable to load this dance move");
}
