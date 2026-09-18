/**
 * The published-build URL rules, in plain CommonJS. Expo's config loader transpiles only
 * the `app.config.ts` entry and requires everything it imports as-is, so
 * `expo/app-config.js` cannot reach a TypeScript sibling; `src/api/api-url.ts` re-exports
 * these so the build-time guard and the runtime resolver share one implementation.
 */

/**
 * @param {string | undefined} configuredUrl
 * @returns {string | undefined}
 */
function configuredApiUrl(configuredUrl) {
  const url = configuredUrl?.trim();
  return url || undefined;
}

/**
 * @param {string | undefined} configuredUrl
 * @returns {string}
 */
function requirePublishedApiUrl(configuredUrl) {
  const apiUrl = configuredApiUrl(configuredUrl);
  if (!apiUrl) {
    throw new Error(
      "EXPO_PUBLIC_API_URL must be set to an HTTPS URL for staging and production builds.",
    );
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(apiUrl);
  } catch {
    throw new Error("EXPO_PUBLIC_API_URL must be a valid HTTPS URL.");
  }

  if (parsedUrl.protocol !== "https:") {
    throw new Error("EXPO_PUBLIC_API_URL must use HTTPS for staging and production builds.");
  }

  return apiUrl;
}

/**
 * @param {string | undefined} buildProfile
 * @param {string | undefined} configuredUrl
 * @returns {void}
 */
function validatePublishedBuildApiUrl(buildProfile, configuredUrl) {
  if (buildProfile === "staging" || buildProfile === "production") {
    requirePublishedApiUrl(configuredUrl);
  }
}

module.exports = { configuredApiUrl, requirePublishedApiUrl, validatePublishedBuildApiUrl };
