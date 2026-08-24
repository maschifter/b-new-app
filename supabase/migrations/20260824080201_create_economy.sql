update public.catalog_items
set access = 'premium'
where access = 'free' and coalesce(price, 0) > 0;

update public.catalog_items
set access = 'free'
where access = 'premium' and coalesce(price, 0) = 0;

alter table public.catalog_items
  add constraint catalog_items_access_price_check
  check (
    (access = 'free' and coalesce(price, 0) = 0)
    or (access = 'premium' and price > 0)
  );

create table public.user_wallets (
  owner_id uuid primary key references auth.users on delete cascade,
  glow bigint not null default 999999,
  starter_granted boolean not null default false,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_wallets_glow_nonneg check (glow >= 0)
);

alter table public.user_wallets enable row level security;

create trigger user_wallets_set_updated_at
  before update on public.user_wallets
  for each row execute procedure public.set_updated_at();

create table public.user_items (
  owner_id uuid references auth.users on delete cascade,
  item_id text references public.catalog_items(id) on delete cascade,
  acquired_at timestamptz not null default timezone('utc', now()),
  source text not null default 'purchase',
  primary key (owner_id, item_id),
  constraint user_items_source_check check (source in ('purchase', 'starter', 'backfill'))
);

alter table public.user_items enable row level security;

create function public.purchase_item(p_owner uuid, p_item text)
returns table (out_status text, out_glow bigint, out_acquired_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_price bigint;
  v_glow bigint;
  v_acquired timestamptz;
begin
  select coalesce(ci.price, 0)
  into v_price
  from public.catalog_items ci
  where ci.id = p_item and ci.status = 'published';

  if not found then
    return query select 'not_found'::text, null::bigint, null::timestamptz;
    return;
  end if;

  insert into public.user_wallets (owner_id)
  values (p_owner)
  on conflict (owner_id) do nothing;

  select w.glow
  into v_glow
  from public.user_wallets w
  where w.owner_id = p_owner
  for update;

  select ui.acquired_at
  into v_acquired
  from public.user_items ui
  where ui.owner_id = p_owner and ui.item_id = p_item;

  if found then
    return query select 'already_owned'::text, v_glow, v_acquired;
    return;
  end if;

  if v_glow < v_price then
    return query select 'insufficient_glow'::text, v_glow, null::timestamptz;
    return;
  end if;

  update public.user_wallets w
  set glow = w.glow - v_price
  where w.owner_id = p_owner
  returning w.glow into v_glow;

  insert into public.user_items (owner_id, item_id, source)
  values (p_owner, p_item, 'purchase')
  returning public.user_items.acquired_at into v_acquired;

  return query select 'ok'::text, v_glow, v_acquired;
end;
$$;

revoke execute on function public.purchase_item(uuid, text) from public, anon, authenticated;
grant execute on function public.purchase_item(uuid, text) to service_role;
