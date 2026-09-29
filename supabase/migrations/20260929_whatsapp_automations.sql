-- Applied to production 2026-09-29 via Supabase MCP (migration: whatsapp_automations).
alter table public.whatsapp_messages add column if not exists kind text not null default 'manual';
alter table public.shifts add column if not exists open_alert_sent_at timestamptz;
-- Vault secret 'whatsapp_auto_cron_secret' + public.check_cron_secret(text) (service_role only)
-- pg_cron jobs calling the whatsapp-auto Edge Function with header x-cron-secret:
--   whatsapp-open-shift-alerts  '*/30 * * * *'  {"job":"open_shifts"}
--   whatsapp-form101-weekly     '0 7 * * 0'     {"job":"form101"}   (Sunday 10:00 IDT / 09:00 IST)
