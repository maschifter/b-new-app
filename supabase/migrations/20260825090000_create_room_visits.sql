-- Append-only audit log for visits to another user's studio room.
-- The redundant owner id makes the self-visit invariant enforceable while the
-- composite foreign key guarantees it always belongs to the referenced room.
alter table public.studio_rooms
  add constraint studio_rooms_id_owner_unique unique (id, owner_id);

create table public.room_visits (
  id bigint generated always as identity primary key,
  room_id uuid not null,
  room_owner_id uuid not null,
  visitor_id uuid not null references auth.users on delete cascade,
  visited_at timestamptz not null default timezone('utc', now()),
  constraint room_visits_room_fk
    foreign key (room_id, room_owner_id)
    references public.studio_rooms (id, owner_id)
    on delete cascade,
  constraint room_visits_other_user_check
    check (room_owner_id <> visitor_id)
);

create index room_visits_room_visited_at_idx
  on public.room_visits (room_id, visited_at desc);

create index room_visits_visitor_visited_at_idx
  on public.room_visits (visitor_id, visited_at desc);

-- Visits are written and aggregated only by the server's service-role client.
-- No direct client policy is intentional because this log exposes user activity.
alter table public.room_visits enable row level security;
