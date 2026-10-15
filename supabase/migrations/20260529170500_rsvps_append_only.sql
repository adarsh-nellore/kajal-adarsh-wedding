-- Save-the-date sign-ups (savethedate/script.js).

drop index if exists public.rsvps_email_unique;
delete from public.rsvps where email like 'smoke+%@example.com' or email like 'plain+%@example.com';
