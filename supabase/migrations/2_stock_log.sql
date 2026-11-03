-- Already ran schema.sql before? Run ONLY this file to add delivery (restock) syncing.
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
