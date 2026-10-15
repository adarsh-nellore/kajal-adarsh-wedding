-- The guest list lives here now (it was the Google Sheet, copied into guests.json
-- and wedding_contacts by scripts/sync_guests.py, which is retired). It's edited
-- on the admin site (admin/), whose server writes with the service role.
--
-- One row per seat:
--   party        the party number (the sheet's "Group #"); the RSVP shows a party together
--   sort_order   order within the party (the admin site's drag and drop)
--   first_name, last_name
--   is_plus_one  an unnamed guest of the party; the RSVP shows "Plus one" and asks for
--                the name. first/last are ignored for them (note says who they are)
--   events       the events they're invited to; null means all of them
--   email, phone prefilled on their RSVP card for them to confirm
--   note         for the couple only
--
-- wedding_guests is private: RLS on, no grants to anon or authenticated. The site
-- reads it two ways, both security definer:
--   wedding_guest_list()            names, parties, plus ones and events, in order;
--                                   the same shape guests.json had. No contact info.
--   wedding_party_contacts(party)   one party's emails and phones, keyed by name
--                                   (unchanged signature, now read from here)
--
-- wedding_contacts (the sheet's last contact import) is no longer read; it was
-- copied into wedding_guests when this table was seeded and can be dropped.

create table if not exists public.wedding_guests (
  id           uuid primary key default gen_random_uuid(),
  party        integer not null check (party between 1 and 9999),
  sort_order   integer not null default 0,
  first_name   text not null default '' check (char_length(first_name) <= 100),
  last_name    text not null default '' check (char_length(last_name) <= 100),
  is_plus_one  boolean not null default false,
  display_name text generated always as (
                 case when is_plus_one then 'Guest' else btrim(btrim(first_name) || ' ' || btrim(last_name)) end
               ) stored,
  events       text[] check (events <@ array['welcome-party','saatak-haldi','baarat-wedding','after-party']),
  email        text check (char_length(email) <= 320),
  phone        text check (char_length(phone) <= 40),
  note         text check (char_length(note) <= 1000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists wedding_guests_party_idx on public.wedding_guests (party, sort_order);

alter table public.wedding_guests enable row level security;
revoke all on public.wedding_guests from anon, authenticated;

create or replace function public.wedding_guests_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.email := nullif(btrim(new.email), '');
  new.phone := nullif(btrim(new.phone), '');
  new.note := nullif(btrim(new.note), '');
  return new;
end;
$$;
revoke all on function public.wedding_guests_touch() from public, anon, authenticated;

drop trigger if exists wedding_guests_touch on public.wedding_guests;
create trigger wedding_guests_touch
  before insert or update on public.wedding_guests
  for each row execute function public.wedding_guests_touch();

-- {"updated": "...", "guests": [{"party": "2", "name": "Gita Patel"}, {"party": "5", "name": "Guest", "plus": true}, ...]}
-- A guest with no name yet (just added on the admin site) is left out.
create or replace function public.wedding_guest_list()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'updated', (select max(updated_at) from public.wedding_guests),
    'guests', coalesce(jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object(
        'party', g.party::text,
        'name', g.display_name,
        'plus', case when g.is_plus_one then true end,
        'events', g.events
      )) order by g.party, g.sort_order, g.created_at, g.id
    ), '[]'::jsonb)
  )
  from public.wedding_guests g
  where g.is_plus_one or g.display_name <> '';
$$;
revoke all on function public.wedding_guest_list() from public;
grant execute on function public.wedding_guest_list() to anon, authenticated;

-- {"gita patel": {"email": "gita@…", "phone": "949…"}, ...} for one party.
create or replace function public.wedding_party_contacts(p_party text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(lower(g.display_name), jsonb_build_object('email', g.email, 'phone', g.phone)), '{}'::jsonb)
  from public.wedding_guests g
  where g.party::text = p_party and not g.is_plus_one and g.display_name <> ''
    and (g.email is not null or g.phone is not null);
$$;
revoke all on function public.wedding_party_contacts(text) from public;
grant execute on function public.wedding_party_contacts(text) to anon, authenticated;

-- Moves guests into a party, in this order (the admin site's drag and drop). Service role only.
create or replace function public.wedding_guests_place(p_party integer, p_ids uuid[])
returns integer
language sql
security definer
set search_path = ''
as $$
  with o as (select id, ord from unnest(p_ids) with ordinality as t(id, ord)),
  u as (
    update public.wedding_guests g set party = p_party, sort_order = o.ord - 1
    from o where g.id = o.id
    returning 1
  )
  select count(*)::integer from u;
$$;
revoke all on function public.wedding_guests_place(integer, uuid[]) from public, anon, authenticated;
grant execute on function public.wedding_guests_place(integer, uuid[]) to service_role;

-- RSVP rows: email_kept / phone_kept compare against the guest list here now.
create or replace function public.wedding_rsvps_fill_contact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare c public.wedding_guests;
begin
  new.email := nullif(trim(new.email), '');
  new.phone := nullif(trim(new.phone), '');
  if new.party is null then return new; end if;
  if new.contact_confirmed then
    select * into c from public.wedding_guests g
      where g.party::text = new.party and not g.is_plus_one and (g.email is not null or g.phone is not null)
      order by (lower(g.display_name) = lower(coalesce(new.submitted_by, new.name))) desc, g.sort_order
      limit 1;
    new.email_kept := new.email is null and c.email is not null;
    new.phone_kept := new.phone is null and c.phone is not null;
    new.email := coalesce(new.email, c.email);
    new.phone := coalesce(new.phone, c.phone);
  else
    select * into c from public.wedding_guests g
      where g.party::text = new.party and not g.is_plus_one and lower(g.display_name) = lower(new.name)
      order by g.sort_order limit 1;
    new.email_kept := coalesce(lower(new.email) = lower(c.email), false);
    new.phone_kept := coalesce(regexp_replace(new.phone, '\D', '', 'g') = regexp_replace(c.phone, '\D', '', 'g'), false);
  end if;
  return new;
end;
$$;

drop function if exists public.wedding_contact_for(text, text);
drop function if exists public.wedding_contacts_load(jsonb);
