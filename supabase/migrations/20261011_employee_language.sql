-- Employee UI language (he / ru / en). NULL = not chosen yet (the app uses Hebrew).
alter table public.profiles add column if not exists language text;
alter table public.profiles drop constraint if exists profiles_language_check;
alter table public.profiles add constraint profiles_language_check check (language is null or language in ('he', 'ru', 'en'));

-- An employee changes only their own language (they have no UPDATE right on profiles).
create or replace function public.set_my_language(p_lang text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_lang not in ('he', 'ru', 'en') then raise exception 'bad language'; end if;
  update profiles set language = p_lang where id = auth.uid();
end $$;
revoke all on function public.set_my_language(text) from public, anon;
grant execute on function public.set_my_language(text) to authenticated;

-- ── schedule notifications in each employee's language ──

drop function if exists public._sched_day_label(date, int);
create or replace function public._sched_day_label(p_week date, p_dow int, p_lang text default 'he')
returns text language sql immutable as $$
  select (case p_lang
            when 'ru' then array['Вс','Пн','Вт','Ср','Чт','Пт','Сб']
            when 'en' then array['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
            else array['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'] end)[p_dow + 1]
         || ' ' || to_char(p_week + p_dow, 'FMDD.FMMM')
$$;

create or replace function public._sched_week_msg(p_week date, p_lang text)
returns text language sql immutable as $$
  select case p_lang
    when 'ru' then 'График работы на неделю ' || to_char(p_week, 'FMDD.FMMM') || '–' || to_char(p_week + 6, 'FMDD.FMMM') || ' обновлён. Нажмите, чтобы посмотреть'
    when 'en' then 'The work schedule for ' || to_char(p_week, 'FMDD.FMMM') || '–' || to_char(p_week + 6, 'FMDD.FMMM') || ' was updated. Tap to view'
    else 'סידור העבודה לשבוע ' || to_char(p_week, 'FMDD.FMMM') || '–' || to_char(p_week + 6, 'FMDD.FMMM') || ' עודכן. לחץ לצפייה' end
$$;

create or replace function public._sched_title(p_kind text, p_lang text)
returns text language sql immutable as $$
  select case p_kind
    when 'week' then case p_lang when 'ru' then '📅 График работы обновлён' when 'en' then '📅 Work schedule updated' else '📅 עדכון בסידור העבודה' end
    when 'added' then case p_lang when 'ru' then '🆕 Вам добавлена смена' when 'en' then '🆕 A shift was added for you' else '🆕 נוספה לך משמרת' end
    when 'cancelled' then case p_lang when 'ru' then '❌ Смена отменена' when 'en' then '❌ Shift cancelled' else '❌ משמרת בוטלה' end
    else case p_lang when 'ru' then '✏️ Ваша смена изменена' when 'en' then '✏️ Your shift was changed' else '✏️ המשמרת שלך עודכנה' end
  end
$$;

-- one unread "schedule updated" notice per user per week — repeated changes refresh it instead of piling up
create or replace function public._notify_schedule_week(p_week date, p_skip uuid[] default '{}')
returns void language plpgsql security definer set search_path = public
as $$
declare v_ref text := p_week::text;
begin
  update notifications n
     set created_at = now(), message = _sched_week_msg(p_week, coalesce(p.language, 'he'))
    from profiles p
   where p.id = n.user_id and p.role = 'user' and p.status = 'active'
     and n.kind = 'schedule_week' and n.ref = v_ref and not n.read
     and not (n.user_id = any(p_skip));

  insert into notifications (user_id, title, message, type, kind, ref)
  select p.id, _sched_title('week', coalesce(p.language, 'he')), _sched_week_msg(p_week, coalesce(p.language, 'he')),
         'info', 'schedule_week', v_ref
    from profiles p
   where p.role = 'user' and p.status = 'active'
     and not (p.id = any(p_skip))
     and not exists (select 1 from notifications n
                      where n.user_id = p.id and n.kind = 'schedule_week' and n.ref = v_ref and not n.read);
end $$;

-- p_kind: added | cancelled | updated. Shift text is built in the recipient's language.
drop function if exists public._notify_schedule_personal(uuid, text, text, date);
create or replace function public._notify_schedule_personal(
  p_user uuid, p_kind text,
  p_week date, p_dow int, p_start time, p_end time,
  p_old_week date default null, p_old_dow int default null, p_old_start time default null, p_old_end time default null,
  p_notes text default null)
returns void language plpgsql security definer set search_path = public
as $$
declare l text; t_new text; t_old text; msg text;
begin
  if p_user is null then return; end if;
  select coalesce(language, 'he') into l from profiles where id = p_user and status = 'active';
  if not found then return; end if;
  t_new := _sched_day_label(p_week, p_dow, l) || ' · ' || to_char(p_start, 'HH24:MI') || '–' || to_char(p_end, 'HH24:MI');
  if p_kind = 'updated' and p_old_week is not null then
    t_old := _sched_day_label(p_old_week, p_old_dow, l) || ' · ' || to_char(p_old_start, 'HH24:MI') || '–' || to_char(p_old_end, 'HH24:MI');
    msg := case when t_old = t_new then t_new || coalesce(' — ' || nullif(p_notes, ''), '')
                else t_old || case when l = 'he' then ' ← ' else ' → ' end || t_new end;
  else
    msg := t_new;
  end if;
  insert into notifications (user_id, title, message, type, kind, ref)
  values (p_user, _sched_title(p_kind, l), msg, 'info', 'schedule_shift', p_week::text);
end $$;

create or replace function public.trg_schedule_changed()
returns trigger language plpgsql security definer set search_path = public
as $$
declare skip uuid[] := '{}';
begin
  if tg_op = 'UPDATE' then
    -- internal bookkeeping (e.g. WhatsApp reminder sent) is not a schedule change
    if (new.employee_id, new.week_start, new.day_of_week, new.start_time, new.end_time, coalesce(new.notes, ''))
       is not distinct from
       (old.employee_id, old.week_start, old.day_of_week, old.start_time, old.end_time, coalesce(old.notes, '')) then
      return new;
    end if;
  end if;

  if tg_op = 'INSERT' then
    perform _notify_schedule_personal(new.employee_id, 'added', new.week_start, new.day_of_week, new.start_time, new.end_time);
    skip := array[new.employee_id];
    perform _notify_schedule_week(new.week_start, skip);
  elsif tg_op = 'DELETE' then
    perform _notify_schedule_personal(old.employee_id, 'cancelled', old.week_start, old.day_of_week, old.start_time, old.end_time);
    skip := array[old.employee_id];
    perform _notify_schedule_week(old.week_start, skip);
  else
    if new.employee_id is distinct from old.employee_id then
      perform _notify_schedule_personal(old.employee_id, 'cancelled', old.week_start, old.day_of_week, old.start_time, old.end_time);
      perform _notify_schedule_personal(new.employee_id, 'added', new.week_start, new.day_of_week, new.start_time, new.end_time);
    else
      perform _notify_schedule_personal(new.employee_id, 'updated', new.week_start, new.day_of_week, new.start_time, new.end_time,
                                        old.week_start, old.day_of_week, old.start_time, old.end_time, new.notes);
    end if;
    skip := array[old.employee_id, new.employee_id];
    perform _notify_schedule_week(new.week_start, skip);
    if old.week_start <> new.week_start then perform _notify_schedule_week(old.week_start, skip); end if;
  end if;
  return coalesce(new, old);
end $$;

revoke all on function public._notify_schedule_week(date, uuid[]) from public, anon, authenticated;
revoke all on function public._notify_schedule_personal(uuid, text, date, int, time, time, date, int, time, time, text) from public, anon, authenticated;
