import type { AuthProvider } from "react-admin";
import { supabase } from "./supabase-client";

export const authProvider: AuthProvider = {
  async login({ username, password }: { username: string; password: string }) {
    const { error } = await supabase.auth.signInWithPassword({ email: username, password });
    if (error) throw new Error(error.message);
  },

  async logout() {
    await supabase.auth.signOut();
  },

  async checkAuth() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error("Not authenticated");
  },

  async checkError(error: { status?: number }) {
    if (error.status === 401) {
      await supabase.auth.signOut();
      throw new Error("Session expired");
    }
    if (error.status === 403) {
      throw Object.assign(new Error("Access denied — your account is not an admin"), {
        logoutUser: false,
      });
    }
  },

  async getIdentity() {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw new Error("Not authenticated");
    return { id: data.user.id, fullName: data.user.email ?? data.user.id };
  },

  async getPermissions() {
    return undefined;
  },
};
