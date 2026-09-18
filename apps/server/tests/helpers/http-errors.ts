export function httpError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}

export const httpErrors = {
  badRequest: (message: string) => httpError(400, message),
  forbidden: (message: string) => httpError(403, message),
  notFound: (message: string) => httpError(404, message),
  conflict: (message: string) => httpError(409, message),
  tooManyRequests: (message: string) => httpError(429, message),
  internalServerError: (message: string) => httpError(500, message),
  serviceUnavailable: (message: string) => httpError(503, message),
} as const;
