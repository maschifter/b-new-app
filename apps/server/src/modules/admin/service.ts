import type { AdminUserDetail, AdminUserRow, DashboardSummary, Database } from "@bnewapp/types";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { FastifyInstance } from "fastify";
import type { UpdateUserBody } from "./schemas.js";

export interface ListUsersOptions {
  start: number;
  end: number;
  sort: string;
  order: "asc" | "desc";
  q?: string | undefined;
}

const SORTABLE_COLUMNS = new Set(["id", "username", "email", "created_at"]);
const AUTH_USERS_PAGE_SIZE = 1000;

type HttpErrors = FastifyInstance["httpErrors"];

function authRole(user: User | undefined): string | null {
  const role = user?.app_metadata.role;
  return typeof role === "string" ? role : null;
}

function itemCount(map: unknown): number {
  return map && typeof map === "object" && !Array.isArray(map) ? Object.keys(map).length : 0;
}

function countOrZero(result: { count: number | null; error: { message: string } | null }): number {
  if (result.error) throw result.error;
  return result.count ?? 0;
}

export function createAdminService(
  supabase: SupabaseClient<Database>,
  httpErrors: HttpErrors,
) {
  async function getAuthUserMap(ids: string[]): Promise<Map<string, User>> {
    if (ids.length === 0) return new Map();
    const remainingIds = new Set(ids);
    const users = new Map<string, User>();
    let page = 1;

    while (remainingIds.size > 0) {
      const { data, error } = await supabase.auth.admin.listUsers({
        page,
        perPage: AUTH_USERS_PAGE_SIZE,
      });
      if (error) throw httpErrors.internalServerError("Could not load authentication data");
      for (const user of data.users) {
        if (remainingIds.delete(user.id)) users.set(user.id, user);
      }
      if (data.users.length < AUTH_USERS_PAGE_SIZE) break;
      page += 1;
    }
    return users;
  }

  return {
    async listUsers(options: ListUsersOptions): Promise<{ rows: AdminUserRow[]; total: number }> {
      const sortColumn = SORTABLE_COLUMNS.has(options.sort) ? options.sort : "created_at";
      let query = supabase
        .from("profiles")
        .select("id, email, username, created_at", { count: "exact" })
        .order(sortColumn, { ascending: options.order === "asc" })
        .range(options.start, Math.max(options.end - 1, options.start));

      const search = options.q?.replace(/[,%]/g, "").trim();
      if (search) query = query.or(`username.ilike.%${search}%,email.ilike.%${search}%`);

      const { data, error, count } = await query;
      if (error) throw httpErrors.internalServerError("Could not load users");

      const profiles = data ?? [];
      const authUsers = await getAuthUserMap(profiles.map((profile) => profile.id));
      const rows = profiles.map((profile): AdminUserRow => {
        const authUser = authUsers.get(profile.id);
        return {
          ...profile,
          last_sign_in_at: authUser?.last_sign_in_at ?? null,
          app_metadata_role: authRole(authUser),
        };
      });
      return { rows, total: count ?? rows.length };
    },

    async getUser(id: string): Promise<AdminUserDetail> {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("id, email, username, created_at")
        .eq("id", id)
        .maybeSingle();
      if (error) throw httpErrors.internalServerError("Could not load user");
      if (!profile) throw httpErrors.notFound("User not found");

      const [{ data: authData, error: authError }, { data: room, error: roomError }] =
        await Promise.all([
          supabase.auth.admin.getUserById(id),
          supabase
            .from("studio_rooms")
            .select("template_id, map, updated_at")
            .eq("owner_id", id)
            .maybeSingle(),
        ]);
      if (authError) throw httpErrors.internalServerError("Could not load authentication data");
      if (roomError) throw httpErrors.internalServerError("Could not load studio room");

      return {
        ...profile,
        last_sign_in_at: authData.user?.last_sign_in_at ?? null,
        email_confirmed_at: authData.user?.email_confirmed_at ?? null,
        app_metadata_role: authRole(authData.user ?? undefined),
        studio_room: room
          ? {
              template_id: room.template_id,
              item_count: itemCount(room.map),
              updated_at: room.updated_at,
            }
          : null,
      };
    },

    async updateUser(id: string, updates: UpdateUserBody) {
      if (updates.username === undefined) throw httpErrors.badRequest("No editable fields supplied");
      const { data, error } = await supabase
        .from("profiles")
        .update({ username: updates.username })
        .eq("id", id)
        .select("id, email, username, created_at")
        .maybeSingle();

      if (error?.code === "23505") throw httpErrors.conflict("Username is already taken");
      if (error) throw httpErrors.internalServerError("Could not update user");
      if (!data) throw httpErrors.notFound("User not found");
      return data;
    },

    async deleteUser(id: string) {
      const { error } = await supabase.auth.admin.deleteUser(id);
      if (error) throw httpErrors.internalServerError("Could not delete user");
      return { id };
    },

    async getDashboardSummary(): Promise<DashboardSummary> {
      const now = Date.now();
      const last24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
      const last7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
      const last30d = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

      const results = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", last24h),
        supabase.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", last7d),
        supabase.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", last30d),
        supabase.from("studio_rooms").select("id", { count: "exact", head: true }),
        supabase.from("studio_rooms").select("id", { count: "exact", head: true }).gte("updated_at", last7d),
      ]);

      let counts: number[];
      try {
        counts = results.map(countOrZero);
      } catch {
        throw httpErrors.internalServerError("Could not load dashboard summary");
      }

      return {
        users: {
          total: counts[0] ?? 0,
          last24h: counts[1] ?? 0,
          last7d: counts[2] ?? 0,
          last30d: counts[3] ?? 0,
        },
        rooms: { total: counts[4] ?? 0, updatedLast7d: counts[5] ?? 0 },
      };
    },
  };
}
