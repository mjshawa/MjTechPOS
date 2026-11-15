-- Already ran schema.sql before? Run ONLY this file to add staff cash drawers.
-- Append-only: one row each time a staff member (or the owner, for them) counts and closes a drawer. Nothing is edited or deleted.
create table if not exists public.drawers (
  id          text primary key,
  store_id    text not null,
  payload     jsonb not null,            -- { staffId, staffName, openedAt, closedAt, float, cashSales, cashRefunds, tillExpenses, expected, counted, variance, salesCount, salesTotal, closedBy, deviceId, ts }
  created_at  timestamptz not null,
  received_at timestamptz not null default now()
);
create index if not exists drawers_store_time on public.drawers (store_id, created_at desc);
alter table public.drawers enable row level security;
create policy "staff read drawers"   on public.drawers for select to authenticated using (true);
create policy "staff insert drawers" on public.drawers for insert to authenticated with check (true);
