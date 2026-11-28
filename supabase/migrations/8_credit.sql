-- Customer credit (sell now, pay later). Run ONLY this file in Supabase > SQL Editor. It only ADDS a table.
-- Credit SALES need nothing new: they are normal rows in "sales" with method = 'credit'.
-- Credit customers and their limits sync through the existing "settings" table (ids 'cc:<id>' and 'credit-rules').
-- This table holds the money received later from credit customers. Append-only: a mistake is cancelled by a new 'void' row.
create table if not exists public.credit_payments (
  id          text primary key,
  store_id    text not null,
  payload     jsonb not null,            -- { kind: 'creditpay' | 'void', customerId, customerName, amount, method, note, by, byId, deviceId, shiftKey, voidOf, ts }
  created_at  timestamptz not null,
  received_at timestamptz not null default now()
);
create index if not exists credit_payments_store_time on public.credit_payments (store_id, created_at desc);
alter table public.credit_payments enable row level security;
drop policy if exists "staff read credit_payments"   on public.credit_payments;
drop policy if exists "staff insert credit_payments" on public.credit_payments;
create policy "staff read credit_payments"   on public.credit_payments for select to authenticated using (true);
create policy "staff insert credit_payments" on public.credit_payments for insert to authenticated with check (true);
