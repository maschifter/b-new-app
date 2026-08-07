import fp from "fastify-plugin";

export const errorHandlerPlugin = fp(async (app) => {
  app.setErrorHandler((error, _request, reply) => {
    const appError = error as { code?: string; message: string; statusCode?: number };
    const statusCode = appError.statusCode ?? 500;
    reply.status(statusCode).send({
      code: appError.code ?? "INTERNAL_ERROR",
      message: statusCode >= 500 ? "An unexpected error occurred" : appError.message,
    });
  });
});
