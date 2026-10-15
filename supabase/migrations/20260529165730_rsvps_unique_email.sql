-- Save-the-date sign-ups (savethedate/script.js).

create unique index if not exists rsvps_email_unique on public.rsvps (email);
