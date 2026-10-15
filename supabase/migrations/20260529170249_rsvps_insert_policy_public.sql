-- Save-the-date sign-ups (savethedate/script.js).

drop policy if exists "public can insert rsvps" on public.rsvps;
drop policy if exists "anon can insert rsvps" on public.rsvps;
create policy "anyone can insert rsvps"
  on public.rsvps
  for insert
  to public
  with check (true);
grant insert on public.rsvps to anon, authenticated, public;
