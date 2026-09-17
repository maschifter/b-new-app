import type {
  ApiSuccess,
  CreateDancePostResult,
  DanceGenre,
  DanceMove,
  DanceMovesPage,
  DancePost,
  DancePostDetail,
  DancePostsPage,
  ScanStatus,
} from "@bnewapp/types";
import type { FastifyInstance } from "fastify";
import {
  CreateDancePostRequest,
  DanceMoveIdParams,
  DanceMovesQuery,
  DancePostIdParams,
  DancePostsQuery,
  decodeDanceMovesCursor,
  decodeDancePostsCursor,
} from "./schemas.js";
import type { DanceMovesCursor, DancePostsCursor } from "./schemas.js";
import { createDanceService } from "./service.js";

interface DanceRouteOptions {
  danceVideoBucket?: string;
}

export async function danceRoutes(app: FastifyInstance, options: DanceRouteOptions = {}) {
  const dance = createDanceService(app.supabase, app.httpErrors, options.danceVideoBucket, app.log);

  app.get(
    "/genres",
    { preHandler: app.authenticate },
    async (): Promise<ApiSuccess<DanceGenre[]>> => ({
      data: await dance.listGenres(),
    }),
  );

  app.get(
    "/moves",
    { preHandler: app.authenticate },
    async (request): Promise<ApiSuccess<DanceMovesPage>> => {
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
        ...(query.data.level === undefined ? {} : { level: query.data.level }),
        ...(cursor === undefined ? {} : { cursor }),
      });
      return { data: page };
    },
  );

  app.get(
    "/moves/:id",
    { preHandler: app.authenticate },
    async (request): Promise<ApiSuccess<DanceMove>> => {
      const params = DanceMoveIdParams.safeParse(request.params);
      if (!params.success) throw app.httpErrors.badRequest("Invalid dance move id");
      return { data: await dance.getMove(params.data.id) };
    },
  );

  app.get(
    "/posts",
    { preHandler: app.authenticate },
    async (request): Promise<ApiSuccess<DancePostsPage>> => {
      const query = DancePostsQuery.safeParse(request.query);
      if (!query.success) throw app.httpErrors.badRequest("Invalid dance posts query");
      let cursor: DancePostsCursor | undefined;
      if (query.data.cursor) {
        const decodedCursor = decodeDancePostsCursor(query.data.cursor);
        if (decodedCursor === null) throw app.httpErrors.badRequest("Invalid dance posts cursor");
        cursor = decodedCursor;
      }
      return {
        data: await dance.listPosts(request.user.sub, {
          limit: query.data.limit,
          ...(cursor === undefined ? {} : { cursor }),
        }),
      };
    },
  );

  app.post(
    "/posts",
    { preHandler: app.authenticate },
    async (request): Promise<ApiSuccess<CreateDancePostResult>> => {
      const body = CreateDancePostRequest.safeParse(request.body);
      if (!body.success) throw app.httpErrors.badRequest("Invalid dance post");
      return { data: await dance.createPost(request.user.sub, body.data) };
    },
  );

  app.get(
    "/posts/:id",
    { preHandler: app.authenticate },
    async (request): Promise<ApiSuccess<DancePostDetail>> => {
      const params = DancePostIdParams.safeParse(request.params);
      if (!params.success) throw app.httpErrors.badRequest("Invalid dance post id");
      return { data: await dance.getPost(request.user.sub, params.data.id) };
    },
  );

  app.post(
    "/posts/:id/uploaded",
    { preHandler: app.authenticate },
    async (request): Promise<ApiSuccess<DancePost>> => {
      const params = DancePostIdParams.safeParse(request.params);
      if (!params.success) throw app.httpErrors.badRequest("Invalid dance post id");
      return { data: await dance.markUploaded(request.user.sub, params.data.id) };
    },
  );

  app.delete(
    "/posts/:id",
    { preHandler: app.authenticate },
    async (request): Promise<ApiSuccess<null>> => {
      const params = DancePostIdParams.safeParse(request.params);
      if (!params.success) throw app.httpErrors.badRequest("Invalid dance post id");
      await dance.deleteRecordedPost(request.user.sub, params.data.id);
      return { data: null };
    },
  );

  // The upload, not the post: this rolls back a recording whose transfer never finished,
  // and refuses to touch a post the user already owns a finished recording for.
  app.delete(
    "/posts/:id/upload",
    { preHandler: app.authenticate },
    async (request): Promise<ApiSuccess<null>> => {
      const params = DancePostIdParams.safeParse(request.params);
      if (!params.success) throw app.httpErrors.badRequest("Invalid dance post id");
      await dance.discardUploadingPost(request.user.sub, params.data.id);
      return { data: null };
    },
  );

  app.get(
    "/posts/:id/score",
    { preHandler: app.authenticate },
    async (request): Promise<ApiSuccess<ScanStatus>> => {
      const params = DancePostIdParams.safeParse(request.params);
      if (!params.success) throw app.httpErrors.badRequest("Invalid dance post id");
      return { data: await dance.getScoreStatus(request.user.sub, params.data.id) };
    },
  );
}
