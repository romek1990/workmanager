// Supabase (PostgREST) returns at most 1000 rows per request and silently
// drops the rest. fetchAll pages through the whole result so tables can grow
// without data disappearing from the app.
//
// Usage: const { data, error } = await fetchAll(() => supabase.from('shifts').select('*').order('date'))
// The factory must build a fresh query each call, and the query should have a
// stable order (an id tie-breaker is added automatically).
const PAGE = 1000

export async function fetchAll(makeQuery) {
  const all = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await makeQuery().order('id', { ascending: true }).range(from, from + PAGE - 1)
    if (error) return { data: from === 0 ? null : all, error }
    all.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return { data: all, error: null }
}
