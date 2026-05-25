import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { useNavigate } from 'react-router-dom'

const ACTION_COLORS = {
  'התחברות': 'bg-green-100 text-green-700',
  'יציאה': 'bg-gray-100 text-gray-600',
  'הוספת עובד': 'bg-blue-100 text-blue-700',
  'עריכת עובד': 'bg-blue-50 text-blue-600',
  'הוספת משמרת': 'bg-purple-100 text-purple-700',
  'אישר משמרת': 'bg-emerald-100 text-emerald-700',
  'דחה משמרת': 'bg-red-100 text-red-700',
  'הוספת בונוס': 'bg-yellow-100 text-yellow-700',
  'עריכת בונוס': 'bg-yellow-50 text-yellow-600',
  'הוספת משמרת לסידור': 'bg-indigo-100 text-indigo-700',
  'מחיקת משמרת מסידור': 'bg-red-50 text-red-600',
  'עריכת משמרת בסידור': 'bg-indigo-50 text-indigo-600',
  'הערת יום': 'bg-amber-100 text-amber-700',
}

export default function ActivityLogs() {
  const { currentUser } = useApp()
  const navigate = useNavigate()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [filterUser, setFilterUser] = useState('')

  useEffect(() => {
    if (currentUser?.email !== 'romanyam50@gmail.com') {
      navigate('/')
      return
    }
    loadLogs()
  }, [currentUser])

  async function loadLogs() {
    setLoading(true)
    const { data } = await supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)
    if (data) setLogs(data)
    setLoading(false)
  }

  const uniqueActions = [...new Set(logs.map(l => l.action))]
  const uniqueUsers = [...new Set(logs.map(l => l.user_name).filter(Boolean))]

  const filtered = logs.filter(l => {
    const matchSearch = !search || l.details?.includes(search) || l.user_name?.includes(search)
    const matchAction = !filterAction || l.action === filterAction
    const matchUser = !filterUser || l.user_name === filterUser
    return matchSearch && matchAction && matchUser
  })

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleString('he-IL', {
      day: 'numeric', month: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  }

  if (loading) return (
    <div className="p-6 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-medium">לוג פעילות מערכת</h1>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>{filtered.length} רשומות</span>
          <button onClick={loadLogs} className="btn text-xs">רענן</button>
        </div>
      </div>

      {/* פילטרים */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-5 flex flex-wrap gap-3">
        <input
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white flex-1 min-w-[150px]"
          placeholder="חיפוש חופשי..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
          value={filterAction}
          onChange={e => setFilterAction(e.target.value)}
        >
          <option value="">כל הפעולות</option>
          {uniqueActions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
          value={filterUser}
          onChange={e => setFilterUser(e.target.value)}
        >
          <option value="">כל המשתמשים</option>
          {uniqueUsers.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        {(search || filterAction || filterUser) && (
          <button
            onClick={() => { setSearch(''); setFilterAction(''); setFilterUser('') }}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            נקה פילטרים
          </button>
        )}
      </div>

      {/* טבלת לוגים */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-3 text-right font-medium text-gray-500 text-xs">תאריך ושעה</th>
              <th className="px-4 py-3 text-right font-medium text-gray-500 text-xs">משתמש</th>
              <th className="px-4 py-3 text-right font-medium text-gray-500 text-xs">פעולה</th>
              <th className="px-4 py-3 text-right font-medium text-gray-500 text-xs">פרטים</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400 text-sm">אין רשומות</td>
              </tr>
            ) : (
              filtered.map(log => (
                <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{formatDate(log.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="text-xs font-medium text-gray-700">{log.user_name || '—'}</div>
                    <div className="text-xs text-gray-400">{log.user_email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-600'}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-xs">{log.details}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
