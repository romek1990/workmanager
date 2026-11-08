-- When a manager changes an employee's email in the profile, the login email changes with it
-- (otherwise login / password reset keep using the old address).
create or replace function public.sync_profile_email_to_auth() returns trigger
language plpgsql security definer set search_path = public, auth as $$
declare e text := lower(trim(new.email));
begin
  if e is null or e = '' then return new; end if;
  if exists (select 1 from auth.users u where u.id = new.id and lower(u.email) = e) then
    new.email := e; return new;
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = e and u.id <> new.id) then
    raise exception 'האימייל % כבר בשימוש אצל משתמש אחר במערכת', e;
  end if;
  update auth.users set email = e, email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now() where id = new.id;
  update auth.identities set identity_data = identity_data || jsonb_build_object('email', e), updated_at = now()
   where user_id = new.id and provider = 'email';
  new.email := e;
  return new;
end $$;

create or replace trigger profiles_sync_email before update of email on public.profiles
  for each row when (new.email is distinct from old.email) execute function public.sync_profile_email_to_auth();
