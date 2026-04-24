import { SoftCard } from './MarketingPrimitives'
import { ArrowUpRight } from 'lucide-react'

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
      <MacHeader label="ContentCard dashboard: Uber ops view" />
      <div className="p-4 sm:p-5 bg-[#0b1220]">
        <div className="grid grid-cols-3 gap-3 mb-3">
          {[
            ['Trips influenced', '84.2k', '+18.3%'],
            ['CAC efficiency', '2.9x', '+0.5x'],
            ['Campaigns live', '62', '96% on-time'],
          ].map(([k, v, d]) => (
            <div key={k} className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <p className="text-[10px] uppercase tracking-widest text-white/55 font-semibold">{k}</p>
              <p className="text-lg sm:text-xl font-bold text-white mt-1">{v}</p>
              <p className="text-[10px] text-emerald-300 font-medium mt-1">{d}</p>
            </div>
          ))}
        </div>
        <div className="grid sm:grid-cols-[1.25fr_0.75fr] gap-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <p className="text-xs font-semibold text-white mb-2">City performance mix</p>
            <div className="space-y-2">
              {[
                ['Airport trips', '44%'],
                ['UberX demand', '26%'],
                ['Eats promos', '18%'],
                ['Business rides', '12%'],
              ].map(([name, pct]) => (
                <div key={name}>
                  <div className="flex items-center justify-between text-[11px] text-white/70 mb-1">
                    <span>{name}</span>
                    <span>{pct}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10">
                    <div className="h-1.5 rounded-full bg-brand-400" style={{ width: pct }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 h-20 rounded-lg border border-white/10 bg-gradient-to-r from-emerald-300/15 to-cyan-300/15 p-2 flex items-end gap-1">
              {[12, 20, 18, 26, 34, 30, 42, 36, 28, 32, 40, 44].map((h, i) => (
                <span key={i} className="flex-1 rounded-t bg-brand-300/80" style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <p className="text-xs font-semibold text-white mb-2">Ops queue</p>
            <div className="space-y-2">
              {[
                ['Lagos airport push', 'Approved'],
                ['Abuja commute burst', 'In review'],
                ['Port Harcourt Eats', 'Scheduled'],
                ['Surge education', 'Rendering'],
              ].map(([name, state]) => (
                <div key={name} className="flex items-center justify-between rounded-lg border border-white/10 px-2.5 py-2">
                  <p className="text-[11px] text-white/80">{name}</p>
                  <span className="text-[10px] rounded-full px-2 py-0.5 bg-brand-500/20 text-brand-200 font-semibold">{state}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
              <p className="text-[10px] text-white/55 uppercase tracking-widest">Dispatch note</p>
              <p className="text-[11px] text-white/75 mt-1">Night commute creatives outperform baseline by 21% CTR.</p>
            </div>
          </div>
        </div>
      </div>
    </SoftCard>
  )
}

export function DashboardShotGrid() {
  const shots = [
    ['City demand heatmap', 'See where rider demand spikes and align campaign creative by region.'],
    ['Operations queue', 'Track approvals, rendering, and scheduled rollouts in one glance.'],
    ['Campaign performance', 'Compare CTR, conversion, and spend efficiency across active markets.'],
  ]
  return (
    <div className="grid md:grid-cols-3 gap-4">
      {shots.map(([title, caption], idx) => (
        <SoftCard key={title} className="overflow-hidden">
          <MacHeader label={`Screenshot ${idx + 1}`} />
          <div className="p-3 bg-[#0b1220]">
            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
              <div className="h-20 rounded bg-gradient-to-r from-brand-500/35 via-cyan-400/30 to-emerald-300/30 mb-3 p-2 flex items-end gap-1">
                {[28, 42, 36, 50, 46, 58, 54, 62, 56, 48].map((h, i) => (
                  <span key={i} className="flex-1 rounded-t bg-white/70" style={{ height: `${h}%` }} />
                ))}
              </div>
              <p className="text-xs font-semibold text-white">{title}</p>
              <p className="text-[11px] text-white/65 mt-1 leading-relaxed">{caption}</p>
            </div>
          </div>
        </SoftCard>
      ))}
    </div>
  )
}

export function WhyTeamsSwitchShowcase() {
  const cards = [
    {
      title: 'Run always-on city campaigns with zero content bottlenecks',
      desc: 'Plan and launch high-volume social campaigns with queue visibility, approvals, and delivery confidence in one workspace.',
      tone: 'from-[#b8f2db] via-[#c6e9ff] to-[#f4d9ff]',
      visual: (
        <div className="rounded-2xl border border-fog bg-surface p-3">
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-[10px] uppercase tracking-widest text-ink/45 font-semibold">ContentCard post preview</p>
            <span className="text-[10px] rounded-full px-2 py-0.5 bg-emerald-50 text-emerald-700 font-semibold">
              Ready to post
            </span>
          </div>
          <div className="rounded-xl overflow-hidden border border-fog mb-2.5">
            <div className="h-28 bg-gradient-to-br from-[#0a1221] via-[#183250] to-[#2e6f8c] p-3 flex flex-col justify-end">
              <div className="inline-flex items-center gap-1.5 w-fit rounded-full bg-white/15 text-white text-[10px] px-2 py-0.5 font-semibold mb-2">
                Uber Lagos
              </div>
              <p className="text-white text-sm font-semibold leading-tight max-w-[18ch]">
                Move smarter through evening traffic in Lagos.
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-fog bg-mist/50 p-2.5">
            <p className="text-[10px] uppercase tracking-widest text-ink/45 font-semibold mb-1">Caption</p>
            <p className="text-[11px] text-ink/75 leading-relaxed">
              Lagos evenings move fast. Book your ride in two taps, track your driver in real time, and get to your destination with confidence. Tap to ride now. #UberLagos #MoveBetter
            </p>
          </div>
        </div>
      ),
    },
    {
      title: 'Keep performance and creative strategy in the same operating view',
      desc: 'Track growth metrics and campaign mix side-by-side so your social team ships what actually drives conversions.',
      tone: 'from-[#ffd8f2] via-[#ffd8cc] to-[#f7f0ff]',
      visual: (
        <div className="rounded-2xl border border-fog bg-surface p-4">
          <div className="h-28 rounded-xl bg-gradient-to-br from-[#ffa0df] via-[#caa8ff] to-[#ffd39f] mb-3" />
          <div className="grid grid-cols-3 gap-2">
            {[
              ['CTR', '4.8%'],
              ['CVR', '2.1%'],
              ['CAC', '₦1,980'],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-fog bg-mist/50 p-2">
                <p className="text-[10px] text-ink/45 uppercase tracking-widest">{k}</p>
                <p className="text-xs font-semibold text-ink mt-0.5">{v}</p>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      title: 'Scale multi-market growth with cleaner reporting and faster decisions',
      desc: 'Get a single, elegant dashboard for operational status, market demand signals, and next-best campaign actions.',
      tone: 'from-[#d8e3ff] via-[#ece8ff] to-[#ffdff5]',
      visual: (
        <div className="rounded-2xl border border-fog bg-surface p-4">
          <div className="h-36 rounded-xl border border-fog bg-gradient-to-br from-[#f3f7ff] to-[#fff8fb] p-3 flex items-end gap-1">
            {[16, 20, 24, 31, 28, 35, 39, 34, 30, 36, 42, 46].map((h, i) => (
              <span key={i} className="flex-1 rounded-t bg-brand-300/80" style={{ height: `${h}%` }} />
            ))}
          </div>
          <p className="text-[11px] text-ink/55 mt-2">Demand trend across active markets</p>
        </div>
      ),
    },
  ]

  return (
    <div className="grid lg:grid-cols-3 gap-5">
      {cards.map((card) => (
        <SoftCard key={card.title} className="overflow-hidden border-fog/90">
          <div className={`h-1.5 bg-gradient-to-r ${card.tone}`} />
          <div className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3 mb-4">
              <h3 className="text-[1.65rem] leading-[1.15] font-semibold tracking-tight text-ink max-w-[20ch]">
                {card.title}
              </h3>
              <span className="w-7 h-7 rounded-lg border border-fog bg-mist flex items-center justify-center text-ink/45 flex-shrink-0">
                <ArrowUpRight size={14} />
              </span>
            </div>
            <p className="text-sm text-ink/65 leading-relaxed mb-5">{card.desc}</p>
            <div className={`rounded-2xl p-3 bg-gradient-to-br ${card.tone}`}>
              {card.visual}
            </div>
          </div>
        </SoftCard>
      ))}
    </div>
  )
}
