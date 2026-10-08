-- Applied to production 2026-10-08 via Supabase MCP (migration: storage_usage_check).
create or replace function public.storage_usage()
returns table(db_bytes bigint, files_bytes bigint)
language sql security definer set search_path = public, storage
as $$
  select pg_database_size(current_database())::bigint,
         coalesce((select sum((metadata->>'size')::bigint) from storage.objects), 0)::bigint;
$$;
revoke all on function public.storage_usage() from public, anon, authenticated;
grant execute on function public.storage_usage() to service_role;
-- pg_cron: storage-capacity-check '7 6 * * *' (09:07 IDT / 08:07 IST) → whatsapp-auto {"job":"storage_check"}
--   ≥80% of Free-plan quota (500MB DB / 1GB files) → WhatsApp 0547506466, repeated weekly until below 80%.
