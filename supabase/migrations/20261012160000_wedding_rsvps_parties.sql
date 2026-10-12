-- Party RSVPs. The site looks guests up in guests.json (built from the guest
-- list sheet by scripts/sync_guests.py) and writes one row per guest in the
-- party, all sharing a submission_id:
--   name          the guest's name
--   party         the party number from the sheet's "Group #" column
--   submitted_by  who filled in the form (email is theirs too)
--   attending     whether this guest is coming; events are this guest's events
-- Rows written before parties existed keep these columns null.
-- Latest reply per guest:
--   select distinct on (party, lower(name)) * from public.wedding_rsvps
--   where party is not null order by party, lower(name), created_at desc;

alter table public.wedding_rsvps
  add column if not exists party         text check (char_length(party) <= 40),
  add column if not exists submission_id uuid,
  add column if not exists submitted_by  text check (char_length(submitted_by) <= 300);

create index if not exists wedding_rsvps_submission_idx on public.wedding_rsvps (submission_id) where submission_id is not null;
create index if not exists wedding_rsvps_party_name_idx on public.wedding_rsvps (party, lower(name), created_at desc) where party is not null;

grant insert (party, submission_id, submitted_by) on public.wedding_rsvps to anon;
