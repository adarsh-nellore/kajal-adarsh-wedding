-- Wedding RSVPs. Lives in the save-the-date project (zfhhknasebbhaifabszd)
-- beside its `rsvps` table, which holds the save-the-date replies.
--
-- Append-only: each submission (including "Change your reply") is a new row.
-- Review the latest row per email.
--
-- Households, later: a `parties` table (id, name) and a `guests` table
-- (id, party_id -> parties, full_name, email, ...) get loaded from the guest
-- list. The lookup UI then fills party_id/guest_id on each row it writes, one
-- row per guest in the party, and the foreign keys below get added with
--   alter table public.wedding_rsvps
--     add constraint wedding_rsvps_party_fk foreign key (party_id) references public.parties(id),
--     add constraint wedding_rsvps_guest_fk foreign key (guest_id) references public.guests(id);
-- Existing rows keep null party/guest ids, so nothing needs migrating.

create table if not exists public.wedding_rsvps (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null check (char_length(name) between 1 and 300),
  email       text not null check (char_length(email) between 3 and 320),
  attending   boolean not null,
  guests      smallint check (guests between 0 and 10),
  events      text[] not null default '{}'
              check (events <@ array['welcome-party','saatak-haldi','baarat-wedding','after-party']),
  dietary     text check (char_length(dietary) <= 1000),
  note        text check (char_length(note) <= 4000),
  send_copy   boolean not null default false,
  user_agent  text check (char_length(user_agent) <= 1000),
  party_id    uuid,
  guest_id    uuid,
  notified_at timestamptz
);

create index if not exists wedding_rsvps_email_idx on public.wedding_rsvps (lower(email), created_at desc);
create index if not exists wedding_rsvps_party_idx on public.wedding_rsvps (party_id) where party_id is not null;

alter table public.wedding_rsvps enable row level security;

revoke all on public.wedding_rsvps from anon, authenticated;
grant insert (id, name, email, attending, guests, events, dietary, note, send_copy, user_agent)
  on public.wedding_rsvps to anon;

drop policy if exists "anon can insert wedding rsvps" on public.wedding_rsvps;
create policy "anon can insert wedding rsvps"
  on public.wedding_rsvps for insert to anon
  with check (true);
