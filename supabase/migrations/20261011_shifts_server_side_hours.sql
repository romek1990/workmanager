-- Server-side shift hours: total_hours is never trusted from the client.
-- Clocked shifts (QR/geo, not manually edited) → from clock timestamps (minute precision).
-- Everything else → from start_time/end_time (overnight wraps +24h).
-- Non-admins can't save a manual shift longer than 20 hours (same cap as employee_update_shift).
create or replace function public.shifts_calc_hours()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare mins int; s text; e text;
begin
  if new.end_time is null or new.end_time = '' or new.start_time is null or new.start_time = '' then
    new.total_hours := 0;
    return new;
  end if;

  if new.clock_in_at is not null and new.clock_out_at is not null and not coalesce(new.is_manual, false) then
    mins := greatest(0, floor(extract(epoch from (date_trunc('minute', new.clock_out_at) - date_trunc('minute', new.clock_in_at))) / 60)::int);
  else
    s := left(new.start_time, 5);
    e := left(new.end_time, 5);
    if s !~ '^\d{2}:\d{2}$' or e !~ '^\d{2}:\d{2}$' then raise exception 'bad time'; end if;
    mins := (split_part(e, ':', 1)::int * 60 + split_part(e, ':', 2)::int)
          - (split_part(s, ':', 1)::int * 60 + split_part(s, ':', 2)::int);
    if mins <= 0 then mins := mins + 24 * 60; end if;
    if mins > 20 * 60 and auth.uid() is not null and not public.is_admin() then
      raise exception 'too long';
    end if;
  end if;

  new.total_hours := round(mins / 60.0, 4);
  return new;
end $$;

revoke execute on function public.shifts_calc_hours() from public, anon, authenticated;

drop trigger if exists shifts_calc_hours on public.shifts;
create trigger shifts_calc_hours
  before insert or update on public.shifts
  for each row execute function public.shifts_calc_hours();
