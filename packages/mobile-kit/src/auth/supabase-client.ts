import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";

interface SupabaseAuthClientOptions {
  url: string | undefined;
  publishableKey: string | undefined;
}

/**
 * The React Native Supabase client both apps authenticate with: AsyncStorage-backed
 * session persistence, background token refresh and PKCE. URL detection is off
 * because neither app completes a browser redirect.
 *
 * Returns `null` when either public value is missing, so a build without Supabase
 * env still boots and the caller renders its own unavailable state. The values are
 * read by the app, not here: Expo inlines `EXPO_PUBLIC_*` per project at build time.
 */
export function createSupabaseAuthClient({
  url,
  publishableKey,
}: SupabaseAuthClientOptions): SupabaseClient | null {
  if (!url || !publishableKey) return null;
  return createClient(url, publishableKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  });
}
