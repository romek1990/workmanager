// Retired 2026-09-29: shift-start reminders now run from the weekly schedule via
// whatsapp-auto (job "shift_reminders", pg_cron every 10 minutes). Intentionally does nothing.
Deno.serve(() => new Response(JSON.stringify({ retired: true, use: "whatsapp-auto" }), { status: 410, headers: { "Content-Type": "application/json" } }));
