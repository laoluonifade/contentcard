import { useState, useEffect } from 'react'
import { Users, Layers, Zap, TrendingUp, TrendingDown, Building2, DollarSign } from 'lucide-react'
import AdminLayout from '../components/layout/AdminLayout'
import { adminApi } from '../api'

const DAYS = ['7d ago','6d','5d','4d','3d','2d','Yesterday']

function BarChart({ data, color }) {
  const max = Math.max(...data, 1)
  return (
    <div className="flex items-end gap-1.5 h-20">
      {data.map((v, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full rounded-t-sm transition-all" style={{ height: `${(v / max) * 72}px`, background: color, opacity: 0.5 + (v / max) * 0.5, minHeight: v > 0 ? '3px' : '0' }} />
          <span className="text-white/20 text-[8px] hidden sm:block">{DAYS[i]}</span>
        </div>
      ))}
    </div>
  )
}

const STATUS_STYLE = {
  active:  'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  trial:   'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
  churned: 'bg-red-500/10 text-red-400 border border-red-500/20',
}

function Stat({ label, value, delta, up, icon: Icon, color, bg }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
      <div className={`w-9 h-9 ${bg} rounded-xl flex items-center justify-center mb-4`}>
        <Icon size={16} className={color} />
      </div>
      <div className="text-2xl font-bold text-white mb-1" style={{ letterSpacing: '-0.02em' }}>{value}</div>
      <div className="text-white/40 text-xs mb-2">{label}</div>
      {delta !== null && (
        <div className={`flex items-center gap-1 text-xs font-semibold ${up ? 'text-emerald-400' : 'text-red-400'}`}>
          {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{delta}
        </div>
      )}
    </div>
  )
}

export default function AdminDashPage() {
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      adminApi.stats(),
      adminApi.users({ limit: 10 }),
    ]).then(([s, u]) => {
      setStats(s)
      setUsers(u.users || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
        </div>
      </AdminLayout>
    )
  }

  const s = stats || {}

  const statCards = [
    {
      label: 'Total Users',
      value: s.total_users?.toLocaleString() || '0',
      delta: s.user_delta != null ? `${s.user_delta >= 0 ? '+' : ''}${s.user_delta} this week` : null,
      up: (s.user_delta || 0) >= 0,
      icon: Users,
      color: 'text-brand-400',
      bg: 'bg-brand-500/10',
    },
    {
      label: 'Workspaces',
      value: s.total_workspaces?.toLocaleString() || '0',
      delta: null,
      up: true,
      icon: Building2,
      color: 'text-teal-400',
      bg: 'bg-teal-500/10',
    },
    {
      label: 'Posts Generated',
      value: s.total_content?.toLocaleString() || '0',
      delta: s.content_this_week != null ? `${s.content_this_week} this week` : null,
      up: (s.content_delta_pct || 0) >= 0,
      icon: Zap,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
    },
    {
      label: 'Brands',
      value: s.total_brands?.toLocaleString() || '0',
      delta: null,
      up: true,
      icon: Layers,
      color: 'text-pink-400',
      bg: 'bg-pink-500/10',
    },
    {
      label: 'Avg Spend / Company',
      value: s.avg_spend_per_workspace != null ? `$${s.avg_spend_per_workspace.toFixed(3)}` : '—',
      delta: s.total_estimated_spend != null ? `$${s.total_estimated_spend.toFixed(3)} total` : null,
      up: true,
      icon: DollarSign,
      color: 'text-orange-400',
      bg: 'bg-orange-500/10',
    },
  ]

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Overview</h1>
        <p className="text-white/35 text-sm mt-0.5">ContentCard platform at a glance</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {statCards.map(card => <Stat key={card.label} {...card} />)}
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-white font-semibold text-sm">New signups</div>
              <div className="text-white/30 text-xs mt-0.5">Last 7 days</div>
            </div>
            <div className="text-2xl font-bold text-brand-400">
              {(s.daily_signups || []).reduce((a, b) => a + b, 0)}
            </div>
          </div>
          <BarChart data={s.daily_signups || [0,0,0,0,0,0,0]} color="#7c3aed" />
        </div>
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-white font-semibold text-sm">Content generated</div>
              <div className="text-white/30 text-xs mt-0.5">Last 7 days</div>
            </div>
            <div className="text-2xl font-bold text-teal-400">
              {(s.daily_content || []).reduce((a, b) => a + b, 0)}
            </div>
          </div>
          <BarChart data={s.daily_content || [0,0,0,0,0,0,0]} color="#14b8a6" />
        </div>
      </div>

      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div className="text-white font-semibold text-sm">Recent signups</div>
          <a href="/admindash/users" className="text-brand-400 text-xs font-semibold hover:text-brand-300 transition-colors">View all →</a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                {['User','Country','Active','Joined'].map(h => (
                  <th key={h} className="text-left text-white/30 text-xs font-bold uppercase tracking-widest px-5 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-white/30 text-sm">No users yet</td>
                </tr>
              ) : users.map(u => (
                <tr key={u.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-3">
                    <div className="text-white text-sm font-medium">{u.full_name}</div>
                    <div className="text-white/35 text-xs">{u.email}</div>
                  </td>
                  <td className="px-5 py-3 text-white/50 text-sm">{u.country_code || 'Not set'}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${u.is_active ? STATUS_STYLE.active : STATUS_STYLE.churned}`}>
                      {u.is_active ? 'active' : 'inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-white/35 text-xs whitespace-nowrap">
                    {new Date(u.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  )
}
