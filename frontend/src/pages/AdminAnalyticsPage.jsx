import AdminLayout from '../components/layout/AdminLayout'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const SIGNUPS    = [18, 24, 31, 19, 42, 38, 55]
const CONTENT    = [320, 450, 380, 520, 610, 490, 710]
const REVENUE    = [1200, 1800, 1500, 2100, 2400, 1900, 2800]

function BarChart({ data, color }) {
  const max = Math.max(...data)
  return (
    <div className="flex items-end gap-1.5 h-24">
      {data.map((v, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full rounded-t-sm" style={{ height: `${(v / max) * 88}px`, background: color, opacity: 0.6 + (v / max) * 0.4 }} />
          <span className="text-white/20 text-[9px]">{DAYS[i]}</span>
        </div>
      ))}
    </div>
  )
}

const TOP_BRANDS = [
  { name: 'Stridepay Nigeria',  posts: 623, workspace: 'Stridepay Digital Hub' },
  { name: 'Axle Fintech',       posts: 502, workspace: 'Axle Marketing' },
  { name: 'Axle Bank',          posts: 389, workspace: 'Axle Marketing' },
  { name: 'Shopriva',           posts: 314, workspace: 'Shopriva Creative' },
  { name: 'Verdant Invest',     posts: 77,  workspace: 'Verdant Content'  },
]

export default function AdminAnalyticsPage() {
  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Analytics</h1>
        <p className="text-white/35 text-sm mt-0.5">Platform usage and growth metrics</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-white font-semibold text-sm">New signups</div>
              <div className="text-white/30 text-xs mt-0.5">Last 7 days</div>
            </div>
            <div className="text-2xl font-bold text-brand-400">227</div>
          </div>
          <BarChart data={SIGNUPS} color="#10A37F" />
        </div>
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-white font-semibold text-sm">Content generated</div>
              <div className="text-white/30 text-xs mt-0.5">Last 7 days</div>
            </div>
            <div className="text-2xl font-bold text-teal">3,480</div>
          </div>
          <BarChart data={CONTENT} color="#43B89C" />
        </div>
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-white font-semibold text-sm">Revenue</div>
              <div className="text-white/30 text-xs mt-0.5">Last 7 days</div>
            </div>
            <div className="text-2xl font-bold text-yellow-400">$13.7k</div>
          </div>
          <BarChart data={REVENUE} color="#EAB308" />
        </div>
      </div>

      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl">
        <div className="px-5 py-4 border-b border-white/5">
          <div className="text-white font-semibold text-sm">Top brands by content volume</div>
        </div>
        <div className="p-5 space-y-3">
          {TOP_BRANDS.map((b, i) => {
            const max = TOP_BRANDS[0].posts
            return (
              <div key={b.name} className="flex items-center gap-4">
                <span className="text-white/25 text-xs font-bold w-4">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-white text-sm font-medium truncate">{b.name}</span>
                    <span className="text-white/50 text-xs ml-3 flex-shrink-0">{b.posts} posts</span>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-500 rounded-full" style={{ width: `${(b.posts / max) * 100}%` }} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </AdminLayout>
  )
}
