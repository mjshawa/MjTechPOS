-- Already ran schema.sql before? Run ONLY this file to add expense syncing.
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
