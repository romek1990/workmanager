-- Applied to production 2026-09-29 via Supabase MCP (migration: shift_start_reminders_from_schedule).
alter table public.weekly_schedule add column if not exists reminder_sent_at timestamptz;
-- public.due_shift_reminders(p_lead_minutes int) — service_role only; scheduled shifts starting within the lead
-- window (Asia/Jerusalem), not yet reminded, employee active and not already clocked in.
-- pg_cron: whatsapp-shift-start-reminders '*/10 * * * *' → whatsapp-auto {"job":"shift_reminders"}
