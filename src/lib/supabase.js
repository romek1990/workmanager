import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://nwetajywazzpxkdknqsf.supabase.co'
// Publishable key — safe to ship in client code by design (unlike the
// legacy service_role key that used to be here for other calls).
const SUPABASE_ANON_KEY = 'sb_publishable_5a-3ZAXHrNto4disNZxIUQ_VWX4Vj7w'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
