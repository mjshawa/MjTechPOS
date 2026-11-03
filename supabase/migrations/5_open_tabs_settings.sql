-- Already ran schema.sql before? Run ONLY this file to add syncing of OPEN BAR TABS and BUSINESS DETAILS.
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
