-- Already ran schema.sql before? Run ONLY this file to add refund syncing.
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
