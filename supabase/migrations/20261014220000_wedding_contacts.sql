-- Contact info from the guest list sheet, so the RSVP can ask guests to confirm it.
--
-- wedding_contacts is private: RLS on, no grants to anon or authenticated. It's
-- filled by scripts/sync_guests.py through wedding_contacts_load (service role
-- only); one row per sheet row that has an email or phone. `names` are that
-- row's names as guests.json spells them, lowercased, so a reply can be matched
-- to its own row.
--
-- The site only ever sees masked values, through wedding_contact(party, name):
--   {"email": "ad••••@gmail.com", "phone": "••• ••• 1100"}
-- for the person replying, or else the first person in their party with any.
--
-- On the RSVP, contact_confirmed says what the guest did with it:
--   true   "This is still right": a trigger copies the sheet's email and phone
--          onto the rows (the browser never had them)
--   false  they typed a new email and phone
--   null   nothing was on file, or the reply predates this

create table if not exists public.wedding_contacts (
  party      text not null check (char_length(party) <= 40),
  row_no     integer not null,
  names      text[] not null default '{}',
  email      text check (char_length(email) <= 320),
  phone      text check (char_length(phone) <= 40),
  updated_at timestamptz not null default now(),
  primary key (party, row_no)
);

alter table public.wedding_contacts enable row level security;
revoke all on public.wedding_contacts from anon, authenticated;

create or replace function public.wedding_contacts_load(rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  delete from public.wedding_contacts where true;
  insert into public.wedding_contacts (party, row_no, names, email, phone)
  select party, row_no, coalesce(names, '{}'), nullif(email, ''), nullif(phone, '')
  from jsonb_to_recordset(rows) as r(party text, row_no integer, names text[], email text, phone text);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.wedding_contacts_load(jsonb) from public, anon, authenticated;
grant execute on function public.wedding_contacts_load(jsonb) to service_role;

create or replace function public.wedding_contact_for(p_party text, p_name text)
returns public.wedding_contacts
language sql
stable
security definer
set search_path = ''
as $$
  select c.* from public.wedding_contacts c
  where c.party = p_party and (c.email is not null or c.phone is not null)
  order by (lower(p_name) = any (c.names)) desc, c.row_no
  limit 1;
$$;
revoke all on function public.wedding_contact_for(text, text) from public, anon, authenticated;

create or replace function public.wedding_contact(p_party text, p_name text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.wedding_contacts;
  local text;
  digits text;
begin
  c := public.wedding_contact_for(p_party, p_name);
  if c.party is null then return null; end if;
  if c.email is not null then
    local := split_part(c.email, '@', 1);
  end if;
  digits := regexp_replace(coalesce(c.phone, ''), '\D', '', 'g');
  return jsonb_build_object(
    'email', case when c.email is null then null
      else left(local, case when char_length(local) > 3 then 2 else 1 end) || '••••@' || split_part(c.email, '@', 2) end,
    'phone', case when char_length(digits) < 7 then null
      else '••• ••• ' || right(digits, 4) end
  );
end;
$$;
revoke all on function public.wedding_contact(text, text) from public;
grant execute on function public.wedding_contact(text, text) to anon, authenticated;

alter table public.wedding_rsvps
  add column if not exists phone             text check (char_length(phone) <= 40),
  add column if not exists contact_confirmed boolean;

grant insert (phone, contact_confirmed) on public.wedding_rsvps to anon;

create or replace function public.wedding_rsvps_fill_contact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare c public.wedding_contacts;
begin
  if new.contact_confirmed and new.party is not null then
    c := public.wedding_contact_for(new.party, coalesce(new.submitted_by, new.name));
    new.email := coalesce(nullif(new.email, ''), c.email);
    new.phone := coalesce(nullif(new.phone, ''), c.phone);
  end if;
  return new;
end;
$$;
revoke all on function public.wedding_rsvps_fill_contact() from public, anon, authenticated;

drop trigger if exists wedding_rsvps_fill_contact on public.wedding_rsvps;
create trigger wedding_rsvps_fill_contact
  before insert on public.wedding_rsvps
  for each row execute function public.wedding_rsvps_fill_contact();
