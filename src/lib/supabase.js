import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://nwetajywazzpxkdknqsf.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53ZXRhanl3YXp6cHhrZGtucXNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwODQyNzAsImV4cCI6MjA5NDY2MDI3MH0.msA0e1suCIxm1IDb3ZwbyRCYA5FDoUg-EQOWkzeCcVk'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
