-- Already ran schema.sql before? Run ONLY this file. Stock now syncs as MOVEMENTS (+/- changes), so two devices selling the
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
