async function submitForm101(payload) {
  const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53ZXRhanl3YXp6cHhrZGtucXNmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTA4NDI3MCwiZXhwIjoyMDk0NjYwMjcwfQ.nXv9_VDNViQcT9s1xfg1UzROz-wJuo9uM0v4KGie3OQ'
  
  const { id, ...rest } = payload
  
  const url = id
    ? `https://nwetajywazzpxkdknqsf.supabase.co/rest/v1/form_101?id=eq.${id}`
    : `https://nwetajywazzpxkdknqsf.supabase.co/rest/v1/form_101`

  const res = await fetch(url, {
    method: id ? 'PATCH' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(id ? rest : payload)
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.message || err[0]?.message || 'שגיאה בשמירת הטופס')
  }

  return await res.json()
}
