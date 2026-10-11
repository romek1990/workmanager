-- Employees: read-only view of the full work schedule + bell notifications on schedule changes

-- 1. notifications get a kind (for routing in the UI) and a ref (to merge repeated updates)
alter table public.notifications add column if not exists kind text;
alter table public.notifications add column if not exists ref text;
create index if not exists notifications_user_kind_ref_idx on public.notifications (user_id, kind, ref) where not read;

-- 2. full schedule of one week, for any signed-in active user (employees only see their own rows via RLS)
create or replace function public.get_week_schedule(p_week_start date)
returns table (
  id uuid, employee_id uuid, week_start date, day_of_week int,
  start_time time, end_time time, notes text, full_name text, color text
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from profiles p where p.id = auth.uid() and (p.status = 'active' or p.is_super_admin)) then
    raise exception 'user blocked';
  end if;
  if not system_open() then raise exception 'system locked'; end if;
  return query
    select w.id, w.employee_id, w.week_start, w.day_of_week, w.start_time, w.end_time, w.notes,
           p.full_name, p.color
    from weekly_schedule w
    left join profiles p on p.id = w.employee_id
    where w.week_start = p_week_start
    order by w.day_of_week, w.start_time;
end $$;

revoke all on function public.get_week_schedule(date) from public, anon;
grant execute on function public.get_week_schedule(date) to authenticated;

-- 3. helpers
create or replace function public._sched_day_label(p_week date, p_dow int)
returns text language sql immutable as $$
  select (array['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'])[p_dow + 1]
         || ' ' || to_char(p_week + p_dow, 'FMDD.FMMM')
$$;

-- one unread "schedule updated" notice per user per week — repeated changes refresh it instead of piling up
create or replace function public._notify_schedule_week(p_week date, p_skip uuid[] default '{}')
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_ref text := p_week::text;
  v_msg text := 'סידור העבודה לשבוע ' || to_char(p_week, 'FMDD.FMMM') || '–' || to_char(p_week + 6, 'FMDD.FMMM') || ' עודכן. לחץ לצפייה';
begin
  update notifications n
     set created_at = now(), message = v_msg
   where n.kind = 'schedule_week' and n.ref = v_ref and not n.read
     and n.user_id in (select id from profiles where role = 'user' and status = 'active')
     and not (n.user_id = any(p_skip));

  insert into notifications (user_id, title, message, type, kind, ref)
  select p.id, '📅 עדכון בסידור העבודה', v_msg, 'info', 'schedule_week', v_ref
    from profiles p
   where p.role = 'user' and p.status = 'active'
     and not (p.id = any(p_skip))
     and not exists (select 1 from notifications n
                      where n.user_id = p.id and n.kind = 'schedule_week' and n.ref = v_ref and not n.read);
end $$;

create or replace function public._notify_schedule_personal(p_user uuid, p_title text, p_msg text, p_week date)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if p_user is null then return; end if;
  if not exists (select 1 from profiles where id = p_user and status = 'active') then return; end if;
  insert into notifications (user_id, title, message, type, kind, ref)
  values (p_user, p_title, p_msg, 'info', 'schedule_shift', p_week::text);
end $$;

-- 4. trigger: weekly_schedule changes
create or replace function public.trg_schedule_changed()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  t_new text; t_old text; skip uuid[] := '{}';
begin
  if tg_op = 'UPDATE' then
    -- internal bookkeeping (e.g. WhatsApp reminder sent) is not a schedule change
    if (new.employee_id, new.week_start, new.day_of_week, new.start_time, new.end_time, coalesce(new.notes, ''))
       is not distinct from
       (old.employee_id, old.week_start, old.day_of_week, old.start_time, old.end_time, coalesce(old.notes, '')) then
      return new;
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    t_new := _sched_day_label(new.week_start, new.day_of_week) || ' · ' || to_char(new.start_time, 'HH24:MI') || '–' || to_char(new.end_time, 'HH24:MI');
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    t_old := _sched_day_label(old.week_start, old.day_of_week) || ' · ' || to_char(old.start_time, 'HH24:MI') || '–' || to_char(old.end_time, 'HH24:MI');
  end if;

  if tg_op = 'INSERT' then
    perform _notify_schedule_personal(new.employee_id, '🆕 נוספה לך משמרת', t_new, new.week_start);
    skip := array[new.employee_id];
    perform _notify_schedule_week(new.week_start, skip);
  elsif tg_op = 'DELETE' then
    perform _notify_schedule_personal(old.employee_id, '❌ משמרת בוטלה', t_old, old.week_start);
    skip := array[old.employee_id];
    perform _notify_schedule_week(old.week_start, skip);
  else
    if new.employee_id is distinct from old.employee_id then
      perform _notify_schedule_personal(old.employee_id, '❌ משמרת בוטלה', t_old, old.week_start);
      perform _notify_schedule_personal(new.employee_id, '🆕 נוספה לך משמרת', t_new, new.week_start);
    else
      perform _notify_schedule_personal(new.employee_id, '✏️ המשמרת שלך עודכנה',
        case when t_old = t_new then t_new || coalesce(' — ' || nullif(new.notes, ''), '') else t_old || ' ← ' || t_new end,
        new.week_start);
    end if;
    skip := array[old.employee_id, new.employee_id];
    perform _notify_schedule_week(new.week_start, skip);
    if old.week_start <> new.week_start then perform _notify_schedule_week(old.week_start, skip); end if;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists schedule_changed_notify on public.weekly_schedule;
create trigger schedule_changed_notify
  after insert or update or delete on public.weekly_schedule
  for each row execute function public.trg_schedule_changed();

-- 5. trigger: day notes (e.g. "חג", "סגור") also count as a schedule update
create or replace function public.trg_day_note_changed()
returns trigger language plpgsql security definer set search_path = public
as $$
declare d date := coalesce(new.date, old.date);
begin
  if tg_op = 'UPDATE' and new.note is not distinct from old.note and new.date = old.date then return new; end if;
  perform _notify_schedule_week(d - extract(dow from d)::int);
  return coalesce(new, old);
end $$;

drop trigger if exists day_note_changed_notify on public.day_notes;
create trigger day_note_changed_notify
  after insert or update or delete on public.day_notes
  for each row execute function public.trg_day_note_changed();

revoke all on function public._notify_schedule_week(date, uuid[]) from public, anon, authenticated;
revoke all on function public._notify_schedule_personal(uuid, text, text, date) from public, anon, authenticated;
