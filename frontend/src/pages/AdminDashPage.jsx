import { Users, CreditCard, Zap, DollarSign, TrendingUp, TrendingDown } from 'lucide-react'
import AdminLayout from '../components/layout/AdminLayout'

const STATS = [
  { label: 'Total Users',            value: '2,847', delta: '+124 this week', up: true,  icon: Users,      color: 'text-brand-400', bg: 'bg-brand-500/10' },
  { label: 'Active Subscriptions',   value: '1,234', delta: '+38 this week',  up: true,  icon: CreditCard, color: 'text-teal',      bg: 'bg-teal/10'      },
  { label: 'Posts Generated Today',  value: '4,521', delta: '+12% vs avg',    up: true,  icon: Zap,        color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  { label: 'Monthly Revenue',        value: '$61.7k', delta: '-2% vs last mo', up: false, icon: DollarSign, color: 'text-coral',     bg: 'bg-coral/10'     },
]

const SIGNUPS = [18, 24, 31, 19, 42, 38, 55]
const GENERATIONS = [320, 450, 380, 520, 610, 490, 710]
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function BarChart({ data, color }) {
  const max = Math.max(...data)
  return (
    <div className="flex items-end gap-1.5 h-20">
      {data.map((v, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full rounded-t-sm transition-all" style={{ height: `${(v / max) * 72}px`, background: color, opacity: 0.7 + (v / max) * 0.3 }} />
          <span className="text-white/20 text-[9px]">{DAYS[i]}</span>
        </div>
      ))}
    </div>
  )
}

const RECENT_USERS = [
  { name: 'Adaeze Okonkwo', email: 'adaeze@blaze.ng',     plan: 'Business',   status: 'active', joined: '2h ago' },
  { name: 'Emeka Adeyemi',  email: 'emeka@zenithbank.com', plan: 'Enterprise', status: 'active', joined: '5h ago' },
  { name: 'Fatima Bello',   email: 'fatima@interswitch.com', plan: 'Starter', status: 'trial',  joined: '8h ago' },
  { name: 'Tunde Fashola',  email: 'tunde@konga.com',     plan: 'Business',   status: 'active', joined: '1d ago' },
  { name: 'Chisom Achebe',  email: 'chisom@piggy.ng',     plan: 'Starter',    status: 'trial',  joined: '1d ago' },
]

const STATUS_STYLE = {
  active:  'bg-teal/10 text-teal border border-teal/20',
  trial:   'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
  churned: 'bg-red-500/10 text-red-400 border border-red-500/20',
}

export default function AdminDashPage() {
  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Overview</h1>
        <p className="text-white/35 text-sm mt-0.5">ContentCard platform at a glance</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {STATS.map(({ label, value, delta, up, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
            <div className={`w-9 h-9 ${bg} rounded-xl flex items-center justify-center mb-4`}>
              <Icon size={16} className={color} />
            </div>
            <div className="text-2xl font-bold text-white mb-1" style={{ letterSpacing: '-0.02em' }}>{value}</div>
            <div className="text-white/40 text-xs mb-2">{label}</div>
            <div className={`flex items-center gap-1 text-xs font-semibold ${up ? 'text-teal' : 'text-red-400'}`}>
              {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{delta}
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-white font-semibold text-sm">New signups</div>
              <div className="text-white/30 text-xs mt-0.5">Last 7 days</div>
            </div>
            <div className="text-2xl font-bold text-brand-400">227</div>
          </div>
          <BarChart data={SIGNUPS} color="#6C63FF" />
        </div>
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-white font-semibold text-sm">Content generated</div>
              <div className="text-white/30 text-xs mt-0.5">Last 7 days</div>
            </div>
            <div className="text-2xl font-bold text-teal">3,480</div>
          </div>
          <BarChart data={GENERATIONS} color="#43B89C" />
        </div>
      </div>

      {/* Recent users */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div className="text-white font-semibold text-sm">Recent signups</div>
          <a href="/admindash/users" className="text-brand-400 text-xs font-semibold hover:text-brand-300 transition-colors">View all →</a>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              {['User', 'Plan', 'Status', 'Joined'].map(h => (
                <th key={h} className="text-left text-white/30 text-xs font-bold uppercase tracking-widest px-5 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {RECENT_USERS.map(u => (
              <tr key={u.email} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                <td className="px-5 py-3">
                  <div className="text-white text-sm font-medium">{u.name}</div>
                  <div className="text-white/35 text-xs">{u.email}</div>
                </td>
                <td className="px-5 py-3 text-white/60 text-sm">{u.plan}</td>
                <td className="px-5 py-3">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[u.status]}`}>{u.status}</span>
                </td>
                <td className="px-5 py-3 text-white/35 text-xs">{u.joined}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  )
}
