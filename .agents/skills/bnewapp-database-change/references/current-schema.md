# Current Schema Map

Read the migrations themselves before changing the schema. This map is only a navigation aid.

## Profiles

Source: `supabase/migrations/20260807000000_create_profiles.sql`

- `public.profiles.id` is the `auth.users.id` UUID and cascades on user deletion.
- A trigger inserts a profile after auth-user creation.
- Authenticated users can select only their own profile.
- The trigger function is `security definer` with an empty search path.

## Studio Rooms

Source: `supabase/migrations/20260810113543_create_studio_rooms.sql`

- `public.studio_rooms` owns a versioned JSONB decoration snapshot.
- `owner_id` references `auth.users`; the current unique constraint permits one room per owner.
- RLS limits select, insert, and update to the owner. Delete is not currently granted.
- A trigger refreshes `updated_at` on update.
- The server maps rows to `StudioRoom` and reconciles stored snapshots through `@bnewapp/studio-core`.

## Type and Consumer Paths

- Generated schema types: `packages/types/src/database.generated.ts`
- Shared wire models: `packages/types/src/index.ts`
- Server access: `apps/server/src/modules/user/routes.ts`, `apps/server/src/modules/studio/routes.ts`
- Mobile access: `apps/mobile/src/lib/api/client.ts`, `apps/mobile/src/features/studio/state/studio-sync.tsx`

Trace these paths when changing ownership, identifiers, snapshot fields, nullability, or cardinality.
