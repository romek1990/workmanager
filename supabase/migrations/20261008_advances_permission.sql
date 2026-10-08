-- New "advances" permission: managers with it (or with "reports") manage advances.
alter policy advances_reports_all on public.advances
  using (is_admin() and (has_perm('reports') or has_perm('advances')))
  with check (is_admin() and (has_perm('reports') or has_perm('advances')));
-- עקיבא מישייב
update public.profiles set permissions = coalesce(permissions,'[]'::jsonb) || '["advances"]'::jsonb
 where id = 'bc5e944a-7c84-423f-98d8-8f070f02595b' and not (coalesce(permissions,'[]'::jsonb) ? 'advances');
