import AdminLayout from '../components/layout/AdminLayout'
import { DollarSign, TrendingUp, TrendingDown, CreditCard } from 'lucide-react'

const STATS = [
  { label: 'Monthly Revenue',    value: '$61,720', delta: '-2% vs last mo', up: false },
  { label: 'Active Paid Plans',  value: '1,234',   delta: '+38 this week',  up: true  },
  { label: 'Trial Conversions',  value: '68%',     delta: '+4% vs last mo', up: true  },
  { label: 'Churn Rate',         value: '2.1%',    delta: '-0.3% vs last mo',up: true },
]

const TRANSACTIONS = [
  { id: 'TXN001', user: 'Emeka Adeyemi',   plan: 'Enterprise', amount: '$299', status: 'paid',   date: 'Apr 15, 2026' },
  { id: 'TXN002', user: 'Seun Okonkwo',    plan: 'Enterprise', amount: '$299', status: 'paid',   date: 'Apr 14, 2026' },
  { id: 'TXN003', user: 'Adaeze Okonkwo',  plan: 'Business',   amount: '$79',  status: 'paid',   date: 'Apr 12, 2026' },
  { id: 'TXN004', user: 'Tunde Fashola',   plan: 'Business',   amount: '$79',  status: 'paid',   date: 'Apr 10, 2026' },
  { id: 'TXN005', user: 'Ngozi Obi',       plan: 'Business',   amount: '$79',  status: 'failed', date: 'Apr 8, 2026'  },
  { id: 'TXN006', user: 'Yemi Alade',      plan: 'Starter',    amount: '$25',  status: 'paid',   date: 'Apr 5, 2026'  },
  { id: 'TXN007', user: 'Fatima Bello',    plan: 'Starter',    amount: '$25',  status: 'refund', date: 'Apr 3, 2026'  },
  { id: 'TXN008', user: 'Chisom Achebe',   plan: 'Starter',    amount: '$25',  status: 'paid',   date: 'Apr 1, 2026'  },
]

const STATUS_STYLE = {
  paid:   'bg-teal/10 text-teal border border-teal/20',
  failed: 'bg-red-500/10 text-red-400 border border-red-500/20',
  refund: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
}

export default function AdminBillingPage() {
  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Billing</h1>
        <p className="text-white/35 text-sm mt-0.5">Revenue and subscription overview</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {STATS.map(({ label, value, delta, up }) => (
          <div key={label} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
            <div className="text-2xl font-bold text-white mb-1" style={{ letterSpacing: '-0.02em' }}>{value}</div>
            <div className="text-white/40 text-xs mb-2">{label}</div>
            <div className={`flex items-center gap-1 text-xs font-semibold ${up ? 'text-teal' : 'text-red-400'}`}>
              {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{delta}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5">
          <div className="text-white font-semibold text-sm">Recent transactions</div>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              {['ID', 'User', 'Plan', 'Amount', 'Status', 'Date'].map(h => (
                <th key={h} className="text-left text-white/30 text-xs font-bold uppercase tracking-widest px-5 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TRANSACTIONS.map(t => (
              <tr key={t.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                <td className="px-5 py-3 text-white/30 text-xs font-mono">{t.id}</td>
                <td className="px-5 py-3 text-white text-sm font-medium">{t.user}</td>
                <td className="px-5 py-3 text-white/55 text-sm">{t.plan}</td>
                <td className="px-5 py-3 text-white font-semibold text-sm">{t.amount}</td>
                <td className="px-5 py-3">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[t.status]}`}>{t.status}</span>
                </td>
                <td className="px-5 py-3 text-white/35 text-xs">{t.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  )
}
