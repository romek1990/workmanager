alter table public.profiles add column if not exists night_rate numeric;
-- רוני פנחסוב: ₪42 for night hours
update public.profiles set night_rate = 42 where id = '02283664-9351-412c-85cd-9b9ddcea18e7';
