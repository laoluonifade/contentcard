import { SoftCard } from './MarketingPrimitives'

function MacHeader({ label }) {
  return (
    <div className="h-8 border-b border-fog bg-mist px-3 flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full bg-red-300" />
      <span className="w-2 h-2 rounded-full bg-amber-300" />
      <span className="w-2 h-2 rounded-full bg-green-300" />
      <span className="ml-2 text-[11px] text-ink/45 font-medium truncate">{label}</span>
    </div>
  )
}

export function StripeUberHeroMockup({ className = '' }) {
  return (
    <SoftCard className={`overflow-hidden ${className}`.trim()}>
      <MacHeader label="ContentCard dashboard: Stripe x Uber operators" />
      <div className="p-4 sm:p-5 bg-gradient-to-br from-slate-50 via-white to-emerald-50">
        <div className="grid grid-cols-3 gap-3 mb-3">
          {[
            ['MRR', '$24,820', '+12.4%'],
            ['Content ROI', '3.4x', '+0.6x'],
            ['Delivered posts', '186', '95% on-time'],
          ].map(([k, v, d]) => (
            <div key={k} className="rounded-xl border border-fog bg-surface p-3">
              <p className="text-[10px] uppercase tracking-widest text-ink/45 font-semibold">{k}</p>
              <p className="text-lg sm:text-xl font-bold text-ink mt-1">{v}</p>
              <p className="text-[10px] text-emerald-600 font-medium mt-1">{d}</p>
            </div>
          ))}
        </div>
        <div className="grid sm:grid-cols-[1.25fr_0.75fr] gap-3">
          <div className="rounded-xl border border-fog bg-surface p-3">
            <p className="text-xs font-semibold text-ink mb-2">Campaign Mix (Uber + Stripe style)</p>
            <div className="space-y-2">
              {[
                ['Launch offers', '42%'],
                ['Trust + proof', '28%'],
                ['Education', '19%'],
                ['Community', '11%'],
              ].map(([name, pct]) => (
                <div key={name}>
                  <div className="flex items-center justify-between text-[11px] text-ink/60 mb-1">
                    <span>{name}</span>
                    <span>{pct}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-mist">
                    <div className="h-1.5 rounded-full bg-brand-500" style={{ width: pct }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-fog bg-surface p-3">
            <p className="text-xs font-semibold text-ink mb-2">Live queue</p>
            <div className="space-y-2">
              {[
                ['Uber Eats Abuja', 'Approved'],
                ['Stripe Atlas NG', 'In review'],
                ['Uber for Business', 'Scheduled'],
              ].map(([name, state]) => (
                <div key={name} className="flex items-center justify-between rounded-lg border border-fog px-2.5 py-2">
                  <p className="text-[11px] text-ink/70">{name}</p>
                  <span className="text-[10px] rounded-full px-2 py-0.5 bg-brand-50 text-brand-700 font-semibold">{state}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </SoftCard>
  )
}

export function DashboardShotGrid() {
  const shots = [
    ['Revenue snapshot', 'Stripe-like reporting + social KPI trendlines in one board.'],
    ['Driver-style operations', 'Uber-like queue visibility for teams, approvals, and schedule states.'],
    ['Creative command center', 'Post cards, trend picks, and one-click exports in a single workspace.'],
  ]
  return (
    <div className="grid md:grid-cols-3 gap-4">
      {shots.map(([title, caption], idx) => (
        <SoftCard key={title} className="overflow-hidden">
          <MacHeader label={`Screenshot ${idx + 1}`} />
          <div className="p-3 bg-gradient-to-br from-white to-mist">
            <div className="rounded-lg border border-fog bg-surface p-3">
              <div className="h-20 rounded bg-gradient-to-r from-brand-100 via-emerald-100 to-cyan-100 mb-3" />
              <p className="text-xs font-semibold text-ink">{title}</p>
              <p className="text-[11px] text-ink/55 mt-1 leading-relaxed">{caption}</p>
            </div>
          </div>
        </SoftCard>
      ))}
    </div>
  )
}
