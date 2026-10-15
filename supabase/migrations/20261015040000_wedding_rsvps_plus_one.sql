-- Plus ones: the guest list has unnamed plus ones ("Guest" in guests.json); on
-- the RSVP their card asks for a name, which is stored as that row's `name`
-- (or "Guest of <replier>" if left blank on a decline). plus_one marks those
-- rows so the emails can say "Plus one: <name>".

alter table public.wedding_rsvps
  add column if not exists plus_one boolean not null default false;

grant insert (plus_one) on public.wedding_rsvps to anon;
