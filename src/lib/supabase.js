import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://nwetajywazzpxkdknqsf.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_5a-3ZAXHrNto4disNZxIUQ_VMX4Vj7w'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
