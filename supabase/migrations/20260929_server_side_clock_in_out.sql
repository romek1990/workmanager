-- Applied to production 2026-09-29 via Supabase MCP (migration: server_side_clock_in_out).
-- Open shifts are saved at clock-in and closed at clock-out; times come from the server clock.
alter table public.shifts alter column end_time drop not null;
alter table public.shifts add column if not exists clock_in_at timestamptz;
alter table public.shifts add column if not exists clock_out_at timestamptz;
create unique index if not exists shifts_one_active_per_employee on public.shifts (employee_id) where status = 'active';
-- functions: public.clock_in(), public.clock_out(), public.admin_close_shift(uuid, timestamptz)
-- (security definer; see Supabase dashboard → Database → Functions for the full bodies)
