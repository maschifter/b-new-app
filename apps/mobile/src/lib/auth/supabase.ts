import { createSupabaseAuthClient } from "@bnewapp/mobile-kit/auth/supabase-client";

export const supabase = createSupabaseAuthClient({
  url: process.env.EXPO_PUBLIC_SUPABASE_URL,
  publishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});
