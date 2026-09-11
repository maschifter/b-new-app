import type { ApiSuccess, DanceGenre, DanceMove, DanceMovesPage } from "@bnewapp/types";
import type { FastifyInstance } from "fastify";
import {
  DanceMoveIdParams,
  DanceMovesQuery,
  decodeDanceMovesCursor,
} from "./schemas.js";
import type { DanceMovesCursor } from "./schemas.js";
import { createDanceService } from "./service.js";

export async function danceRoutes(app: FastifyInstance) {
  const dance = createDanceService(app.supabase, app.httpErrors);

  app.get("/genres", { preHandler: app.authenticate }, async (): Promise<ApiSuccess<DanceGenre[]>> => ({
    data: await dance.listGenres(),
  }));

  app.get("/moves", { preHandler: app.authenticate }, async (request): Promise<ApiSuccess<DanceMovesPage>> => {
    const query = DanceMovesQuery.safeParse(request.query);
    if (!query.success) throw app.httpErrors.badRequest("Invalid dance moves query");
    let cursor: DanceMovesCursor | undefined;
    if (query.data.cursor) {
      const decodedCursor = decodeDanceMovesCursor(query.data.cursor);
      if (decodedCursor === null) throw app.httpErrors.badRequest("Invalid dance moves cursor");
      cursor = decodedCursor;
    }

    const page = await dance.listMoves({
      limit: query.data.limit,
      ...(query.data.genre_id === undefined ? {} : { genreId: query.data.genre_id }),
      ...(cursor === undefined ? {} : { cursor }),
    });
    return { data: page };
  });

  app.get("/moves/:id", { preHandler: app.authenticate }, async (request): Promise<ApiSuccess<DanceMove>> => {
    const params = DanceMoveIdParams.safeParse(request.params);
    if (!params.success) throw app.httpErrors.badRequest("Invalid dance move id");
    return { data: await dance.getMove(params.data.id) };
  });
}
