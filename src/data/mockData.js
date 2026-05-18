// ===== MOCK DATA =====
// In production replace with real API calls / Supabase / Firebase etc.

export const EMPLOYEES = [
  { id: 1, full_name: 'רויטל כהן', email: 'roytal@demo.com', phone: '050-1234567', address: 'תל אביב', role: 'user', employee_type: 'hourly', hourly_rate: 45, monthly_salary: 0, friday_rate_multiplier: 1.25, saturday_rate_multiplier: 1.5, night_rate_multiplier: 1.25, status: 'active' },
  { id: 2, full_name: 'אמיר לוי', email: 'amir@demo.com', phone: '052-7654321', address: 'ירושלים', role: 'user', employee_type: 'hourly', hourly_rate: 55, monthly_salary: 0, friday_rate_multiplier: 1.25, saturday_rate_multiplier: 1.5, night_rate_multiplier: 1.25, status: 'active' },
  { id: 3, full_name: 'מיכל ברק', email: 'michal@demo.com', phone: '054-9876543', address: 'חיפה', role: 'user', employee_type: 'global', hourly_rate: 0, monthly_salary: 9000, friday_rate_multiplier: 1.25, saturday_rate_multiplier: 1.5, night_rate_multiplier: 1.25, status: 'active' },
  { id: 4, full_name: 'יוסי גולן', email: 'yossi@demo.com', phone: '058-1112233', address: 'באר שבע', role: 'user', employee_type: 'hourly', hourly_rate: 42, monthly_salary: 0, friday_rate_multiplier: 1.25, saturday_rate_multiplier: 1.5, night_rate_multiplier: 1.25, status: 'inactive' },
]

export const SHIFTS_SEED = [
  { id: 1, employee_email: 'roytal@demo.com', employee_name: 'רויטל כהן', date: '2026-05-15', start_time: '08:00', end_time: '16:00', total_hours: 8, shift_type: 'regular', status: 'approved', notes: '', is_manual: false },
  { id: 2, employee_email: 'roytal@demo.com', employee_name: 'רויטל כהן', date: '2026-05-16', start_time: '08:00', end_time: '15:00', total_hours: 7, shift_type: 'friday', status: 'pending', notes: '', is_manual: false },
  { id: 3, employee_email: 'amir@demo.com', employee_name: 'אמיר לוי', date: '2026-05-14', start_time: '14:00', end_time: '22:00', total_hours: 8, shift_type: 'regular', status: 'pending', notes: 'מחלקת מחסן', is_manual: false },
  { id: 4, employee_email: 'michal@demo.com', employee_name: 'מיכל ברק', date: '2026-05-13', start_time: '08:00', end_time: '17:00', total_hours: 9, shift_type: 'regular', status: 'approved', notes: '', is_manual: false },
  { id: 5, employee_email: 'amir@demo.com', employee_name: 'אמיר לוי', date: '2026-05-17', start_time: '22:00', end_time: '06:00', total_hours: 8, shift_type: 'night', status: 'pending', notes: '', is_manual: true },
  { id: 6, employee_email: 'roytal@demo.com', employee_name: 'רויטל כהן', date: '2026-05-10', start_time: '09:00', end_time: '17:00', total_hours: 8, shift_type: 'regular', status: 'approved', notes: '', is_manual: false },
  { id: 7, employee_email: 'michal@demo.com', employee_name: 'מיכל ברק', date: '2026-05-17', start_time: '08:00', end_time: '13:00', total_hours: 5, shift_type: 'saturday', status: 'pending', notes: '', is_manual: false },
]

export const BONUSES_SEED = [
  { id: 1, employee_email: 'roytal@demo.com', employee_name: 'רויטל כהן', amount: 500, date: '2026-05-01', month: '2026-05', description: 'ביצועים מצוינים' },
  { id: 2, employee_email: 'amir@demo.com', employee_name: 'אמיר לוי', amount: 300, date: '2026-05-05', month: '2026-05', description: 'עבודת צוות' },
]

// ===== LABELS =====
export const SHIFT_TYPE_LABELS = { regular: 'רגילה', friday: 'שישי', saturday: 'שבת', night: 'לילה', holiday: 'חג' }
export const STATUS_LABELS = { active: 'פעיל', inactive: 'לא פעיל', pending: 'ממתין', approved: 'מאושר', rejected: 'נדחה' }
export const EMP_TYPE_LABELS = { hourly: 'שעתי', global: 'גלובלי' }
export const MONTH_NAMES = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
