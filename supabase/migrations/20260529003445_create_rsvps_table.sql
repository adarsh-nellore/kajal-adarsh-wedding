-- Save-the-date sign-ups (savethedate/script.js).

create table if not exists public.rsvps (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  email        text not null,
  phone        text,
  address      text,
  wants_recs   boolean not null default false,
  user_agent   text,
  created_at   timestamptz not null default now()
);

alter table public.rsvps enable row level security;

drop policy if exists "anon can insert rsvps" on public.rsvps;
create policy "anon can insert rsvps"
  on public.rsvps for insert to anon with check (true);

create index if not exists rsvps_created_at_idx on public.rsvps (created_at desc);
