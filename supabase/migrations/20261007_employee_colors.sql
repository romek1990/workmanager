-- Each active employee (and hourly manager) gets a unique colour for the weekly schedule.
-- Inactive employees release their colour; the next new/reactivated employee takes the first free one.
alter table public.profiles add column if not exists color text;

create or replace function public.employee_palette() returns text[] language sql immutable as $$
  select array['#e11d48','#2563eb','#ea580c','#9333ea','#0891b2','#db2777','#92400e','#475569','#c026d3','#b91c1c','#1e3a8a','#a16207']
$$;

create or replace function public.profiles_assign_color() returns trigger language plpgsql security definer set search_path = public as $$
declare
  eligible boolean := new.status = 'active' and coalesce(new.is_super_admin,false) = false
                      and (new.role is distinct from 'admin' or coalesce(new.tracks_hours,false));
  pick text;
begin
  if not eligible then new.color := null; return new; end if;
  if new.color is not null and not exists (
       select 1 from profiles p where p.id <> new.id and p.color = new.color and p.status = 'active') then
    return new;
  end if;
  select t.c into pick from unnest(employee_palette()) with ordinality as t(c, i)
   where not exists (select 1 from profiles p where p.id <> new.id and p.status = 'active' and p.color = t.c)
   order by t.i limit 1;
  if pick is null then -- more employees than colours: reuse the least used one
    select t.c into pick from unnest(employee_palette()) with ordinality as t(c, i)
     left join profiles p on p.color = t.c and p.status = 'active' and p.id <> new.id
     group by t.c, t.i order by count(p.id), t.i limit 1;
  end if;
  new.color := pick;
  return new;
end $$;

create or replace trigger profiles_assign_color before insert or update of status, role, tracks_hours, is_super_admin, color
  on public.profiles for each row execute function public.profiles_assign_color();

do $$ declare r record; begin
  for r in select id from profiles order by created_at loop
    update profiles set status = status where id = r.id;
  end loop;
end $$;
