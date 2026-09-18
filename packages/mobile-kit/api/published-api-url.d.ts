/** Mirrors `published-api-url.js`, the URL rules a published build must satisfy. */
export declare function configuredApiUrl(configuredUrl: string | undefined): string | undefined;
export declare function requirePublishedApiUrl(configuredUrl: string | undefined): string;
export declare function validatePublishedBuildApiUrl(
  buildProfile: string | undefined,
  configuredUrl: string | undefined,
): void;
