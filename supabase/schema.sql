-- Run once in Supabase: SQL Editor > New query > paste > Run.
-- Then create your staff login: Authentication > Users > Add user (email + password).

create table if not exists public.sales (
  id          text primary key,              -- client UUID = idempotency key (retries can't duplicate)
  store_id    text not null,
  payload     jsonb not null,
  created_at  timestamptz not null,          -- when the sale happened (device clock)
  received_at timestamptz not null default now()
);
create index if not exists sales_store_time on public.sales (store_id, created_at desc);

create table if not exists public.closed_shifts (
  id          text primary key,
  store_id    text not null,
  payload     jsonb not null,
  closed_at   timestamptz not null,
  received_at timestamptz not null default now()
);

create table if not exists public.products (
  store_id    text not null,
  id          text not null,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),   -- set by the SERVER (see trigger), so device clocks can't skew sync
  primary key (store_id, id)
);
create index if not exists products_store_updated on public.products (store_id, updated_at);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists products_touch on public.products;
create trigger products_touch before insert or update on public.products
for each row execute function public.touch_updated_at();

-- Row Level Security: only signed-in staff can read/write. Sales/shifts are append-only (no update/delete).
alter table public.sales         enable row level security;
alter table public.closed_shifts enable row level security;
alter table public.products      enable row level security;

create policy "staff read sales"    on public.sales         for select to authenticated using (true);
create policy "staff insert sales"  on public.sales         for insert to authenticated with check (true);
create policy "staff read shifts"   on public.closed_shifts for select to authenticated using (true);
create policy "staff insert shifts" on public.closed_shifts for insert to authenticated with check (true);
create policy "staff all products"  on public.products      for all    to authenticated using (true) with check (true);

-- ───────────── Deliveries (restock log) ─────────────
create table if not exists public.stock_log (
  id          text primary key,
  store_id    text not null,
  payload     jsonb not null,            -- { productId, name, qty, cost, by, ts, ... }
  created_at  timestamptz not null,
  received_at timestamptz not null default now()
);
create index if not exists stock_log_store_time on public.stock_log (store_id, created_at desc);
alter table public.stock_log enable row level security;
create policy "staff read stock_log"   on public.stock_log for select to authenticated using (true);
create policy "staff insert stock_log" on public.stock_log for insert to authenticated with check (true);

-- ───────────── Staff accounts & roles ─────────────
-- Every Supabase Auth user gets a profile. The FIRST person to ever sign up becomes the owner; everyone after is staff.
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  name       text,
  role       text not null default 'staff' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, role)
  values (new.id, new.email, split_part(new.email, '@', 1),
          case when exists (select 1 from public.profiles) then 'staff' else 'owner' end);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
create policy "signed-in users read profiles" on public.profiles for select to authenticated using (true);
create policy "owner edits profiles" on public.profiles for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));

-- Append-only ledger: a mistake is recorded as a 'void' row that points at the original, nothing is edited or deleted.
create table if not exists public.expenses (
  id          text primary key,
  store_id    text not null,
  payload     jsonb not null,            -- { kind: 'expense'|'void', shiftKey, category, amount, paidFrom, payee, note, by, ts, afterClose, voidOf? }
  created_at  timestamptz not null,
  received_at timestamptz not null default now()
);
create index if not exists expenses_store_time on public.expenses (store_id, created_at desc);
alter table public.expenses enable row level security;
create policy "staff read expenses"   on public.expenses for select to authenticated using (true);
create policy "staff insert expenses" on public.expenses for insert to authenticated with check (true);

-- Append-only: a refund is a new row pointing at the original sale (payload.saleId). Sales are never edited or deleted.
create table if not exists public.refunds (
  id          text primary key,
  store_id    text not null,
  payload     jsonb not null,            -- { saleId, txId, lines[], amount, method, reason, by, ts, shiftKey, ... }
  created_at  timestamptz not null,
  received_at timestamptz not null default now()
);
create index if not exists refunds_store_time on public.refunds (store_id, created_at desc);
alter table public.refunds enable row level security;
create policy "staff read refunds"   on public.refunds for select to authenticated using (true);
create policy "staff insert refunds" on public.refunds for insert to authenticated with check (true);

-- ───────────── Open bar tabs & business details ─────────────
-- Small records that change over time. The server stamps updated_at, so device clocks cannot skew sync.
-- A closed/paid tab is kept as a row with deleted = true (so the other devices remove it too).
create table if not exists public.open_tabs (
  store_id    text not null,
  id          text not null,
  data        jsonb not null,
  deleted     boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (store_id, id)
);
create index if not exists open_tabs_store_updated on public.open_tabs (store_id, updated_at);

create table if not exists public.settings (      -- id 'business' = the receipt / business details typed by the owner
  store_id    text not null,
  id          text not null,
  data        jsonb not null,
  deleted     boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (store_id, id)
);
create index if not exists settings_store_updated on public.settings (store_id, updated_at);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists open_tabs_touch on public.open_tabs;
create trigger open_tabs_touch before insert or update on public.open_tabs
for each row execute function public.touch_updated_at();
drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before insert or update on public.settings
for each row execute function public.touch_updated_at();

alter table public.open_tabs enable row level security;
alter table public.settings  enable row level security;
drop policy if exists "staff all open_tabs" on public.open_tabs;
drop policy if exists "staff all settings"  on public.settings;
create policy "staff all open_tabs" on public.open_tabs for all to authenticated using (true) with check (true);
create policy "staff all settings"  on public.settings  for all to authenticated using (true) with check (true);

-- ───────────── Stock as movements (two devices can never overwrite each other's stock) ─────────────
-- same item at the same time can no longer overwrite each other's stock count.
-- A device uploads a move (client UUID = idempotency key, a retry can never apply it twice); a trigger adds it to the product.
-- The server also keeps its own stock numbers when a product is re-uploaded, so only moves change stock.
create table if not exists public.stock_moves (
  id          text primary key,
  store_id    text not null,
  product_id  text not null,
  d_stock     numeric not null default 0,   -- change in current stock
  d_sold      numeric not null default 0,   -- change in units sold this shift
  d_start     numeric not null default 0,   -- change in starting stock
  created_at  timestamptz not null,
  received_at timestamptz not null default now()
);
create index if not exists stock_moves_store_time on public.stock_moves (store_id, received_at);
alter table public.stock_moves enable row level security;
drop policy if exists "staff read stock_moves"   on public.stock_moves;
drop policy if exists "staff insert stock_moves" on public.stock_moves;
create policy "staff read stock_moves"   on public.stock_moves for select to authenticated using (true);
create policy "staff insert stock_moves" on public.stock_moves for insert to authenticated with check (true);

-- A move is added to the product in one atomic step (the row is locked while it updates).
create or replace function public.apply_stock_move() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.stock_move', '1', true);   -- tells keep_server_stock() below to let this change through
  update public.products p
     set data = p.data || jsonb_strip_nulls(jsonb_build_object(
           'stock',         case when new.d_stock <> 0 then coalesce((p.data->>'stock')::numeric, 0)         + new.d_stock end,
           'unitsSold',     case when new.d_sold  <> 0 then coalesce((p.data->>'unitsSold')::numeric, 0)     + new.d_sold  end,
           'startingStock', case when new.d_start <> 0 then coalesce((p.data->>'startingStock')::numeric, 0) + new.d_start end))
   where p.store_id = new.store_id and p.id = new.product_id;
  perform set_config('app.stock_move', '', true);
  return new;
end $$;

drop trigger if exists stock_moves_apply on public.stock_moves;
create trigger stock_moves_apply after insert on public.stock_moves
for each row execute function public.apply_stock_move();

-- A normal product upload keeps the SERVER's stock numbers (only moves change them). A brand new product is inserted as sent.
create or replace function public.keep_server_stock() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('app.stock_move', true), '') = '1' then return new; end if;
  new.data = (new.data - 'stock' - 'unitsSold' - 'startingStock')
             || jsonb_strip_nulls(jsonb_build_object('stock', old.data->'stock', 'unitsSold', old.data->'unitsSold', 'startingStock', old.data->'startingStock'));
  return new;
end $$;

drop trigger if exists products_keep_stock on public.products;
create trigger products_keep_stock before update on public.products
for each row execute function public.keep_server_stock();
