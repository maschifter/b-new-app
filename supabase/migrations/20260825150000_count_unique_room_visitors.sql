create index room_visits_room_visitor_idx
  on public.room_visits (room_id, visitor_id);

create function public.count_room_visitors(p_room_id uuid)
returns bigint
language sql
stable
set search_path = ''
as $$
  select count(distinct visit.visitor_id)
  from public.room_visits as visit
  where visit.room_id = p_room_id;
$$;

revoke execute on function public.count_room_visitors(uuid) from public, anon, authenticated;
grant execute on function public.count_room_visitors(uuid) to service_role;
