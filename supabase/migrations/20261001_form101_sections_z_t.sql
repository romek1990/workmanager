-- Applied to production 2026-10-01 via Supabase MCP (migration: form101_sections_z_t).
alter table public.form_101
  add column if not exists tax_coord_reasons jsonb not null default '[]'::jsonb,
  add column if not exists tax_coord_employers jsonb not null default '[]'::jsonb,
  add column if not exists year_changes jsonb not null default '[]'::jsonb;
update public.form_101 set tax_coord_reasons = '[3]'::jsonb where tax_coordination = true and tax_coord_reasons = '[]'::jsonb;
