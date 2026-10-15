-- Contact info per guest. Each guest's card on the RSVP has its own email and
-- phone fields, prefilled from the guest list (wedding_party_contacts), and each
-- row (one per guest) now carries that guest's own email and phone as sent.
--   email_kept / phone_kept  set by the trigger, not the site: true when the
--                            value matches the guest list's, so the couple can
--                            tell what's new
-- email is no longer required: not everyone has one. The site still asks the
-- person replying for theirs, and the copy of the reply goes there.
--
-- A sheet row's contact belongs to the first person named on it (names[1]).
--
-- contact_confirmed is from the single party-level block that briefly came
-- before; rows still sending it keep its meaning (fill whichever of email and
-- phone came empty, from the replier's contact). It can be dropped later.

alter table public.wedding_rsvps
  alter column email drop not null,
  add column if not exists email_kept        boolean not null default false,
  add column if not exists phone_kept        boolean not null default false,
  add column if not exists contact_confirmed boolean;

grant insert (contact_confirmed) on public.wedding_rsvps to anon;
revoke insert (email_kept, phone_kept) on public.wedding_rsvps from anon;

-- {"gita patel": {"email": "gita@…", "phone": "949…"}, ...} for one party.
-- The table itself stays unreadable to anon; this is the only way in.
create or replace function public.wedding_party_contacts(p_party text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(c.names[1], jsonb_build_object('email', c.email, 'phone', c.phone)), '{}'::jsonb)
  from public.wedding_contacts c
  where c.party = p_party and c.names[1] is not null and (c.email is not null or c.phone is not null);
$$;
revoke all on function public.wedding_party_contacts(text) from public;
grant execute on function public.wedding_party_contacts(text) to anon, authenticated;

drop function if exists public.wedding_contact(text, text);
drop function if exists public.wedding_mask_email(text);
drop function if exists public.wedding_mask_phone(text);

create or replace function public.wedding_rsvps_fill_contact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare c public.wedding_contacts;
begin
  new.email := nullif(trim(new.email), '');
  new.phone := nullif(trim(new.phone), '');
  if new.party is null then return new; end if;
  if new.contact_confirmed then
    c := public.wedding_contact_for(new.party, coalesce(new.submitted_by, new.name));
    new.email_kept := new.email is null and c.email is not null;
    new.phone_kept := new.phone is null and c.phone is not null;
    new.email := coalesce(new.email, c.email);
    new.phone := coalesce(new.phone, c.phone);
  else
    select * into c from public.wedding_contacts
      where party = new.party and names[1] = lower(new.name)
      order by row_no limit 1;
    new.email_kept := coalesce(lower(new.email) = lower(c.email), false);
    new.phone_kept := coalesce(regexp_replace(new.phone, '\D', '', 'g') = regexp_replace(c.phone, '\D', '', 'g'), false);
  end if;
  return new;
end;
$$;
