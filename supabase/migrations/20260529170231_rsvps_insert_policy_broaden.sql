-- Save-the-date sign-ups (savethedate/script.js).

drop policy if exists "anon can insert rsvps" on public.rsvps;
create policy "public can insert rsvps"
  on public.rsvps
  for insert
  to anon, authenticated
  with check (true);
