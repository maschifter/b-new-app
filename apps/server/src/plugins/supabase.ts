import type { Database } from "@bnewapp/types";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";

interface SupabasePluginOptions {
  secretKey: string;
  url: string;
}

declare module "fastify" {
  interface FastifyInstance {
    supabase: SupabaseClient<Database>;
  }
}

export const supabasePlugin = fp(async (app: FastifyInstance, options: SupabasePluginOptions) => {
  const client = createClient<Database>(options.url, options.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  app.decorate("supabase", client);
});
