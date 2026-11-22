-- Time of the after-office "did you go in today?" check-in email.
alter table public.notification_preferences
  add column if not exists checkin_time time not null default '16:00';
