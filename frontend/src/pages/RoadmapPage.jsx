import MarketingLayout from '../components/layout/MarketingLayout'

const COLUMNS = [
  {
    label: 'In progress', color: 'text-yellow-400', dot: 'bg-yellow-400',
    items: [
      { title: 'Direct scheduling to Instagram & Facebook', desc: 'Post directly from ContentCard without downloading.' },
      { title: 'AI image generation', desc: 'Generate graphics entirely with AI — no templates.' },
      { title: 'Analytics dashboard', desc: 'Track engagement and reach for every post.' },
    ],
  },
  {
    label: 'Planned', color: 'text-brand-400', dot: 'bg-brand-500',
    items: [
      { title: 'LinkedIn support', desc: 'Generate and schedule LinkedIn posts and articles.' },
      { title: 'TikTok captions & hooks', desc: 'Short-form video script and caption generation.' },
      { title: 'Client reporting', desc: 'Auto-generated monthly reports for agency clients.' },
      { title: 'Zapier & Make integration', desc: 'Connect ContentCard to your existing workflows.' },
    ],
  },
  {
    label: 'Under consideration', color: 'text-white/40', dot: 'bg-white/30',
    items: [
      { title: 'WhatsApp broadcast content', desc: 'Generate content tailored for WhatsApp channels.' },
      { title: 'Video thumbnail generation', desc: 'YouTube and TikTok thumbnail creation.' },
      { title: 'Content performance AI', desc: 'AI recommendations based on what\'s performing.' },
    ],
  },
]

export default function RoadmapPage() {
  return (
    <MarketingLayout>
      <section className="py-16 px-6 border-b border-white/5 text-center">
        <div className="max-w-2xl mx-auto">
          <div className="text-brand-400 text-xs font-bold uppercase tracking-widest mb-4">Roadmap</div>
          <h1 className="text-4xl font-bold mb-4" style={{ letterSpacing: '-0.03em' }}>Where ContentCard is going</h1>
          <p className="text-white/45">Our public roadmap — what we're building now, what's coming next, and what we're thinking about.</p>
        </div>
      </section>
      <section className="py-16 px-6">
        <div className="max-w-7xl mx-auto grid md:grid-cols-3 gap-6">
          {COLUMNS.map(({ label, color, dot, items }) => (
            <div key={label}>
              <div className={`flex items-center gap-2 mb-5 font-bold text-sm ${color}`}>
                <div className={`w-2 h-2 rounded-full ${dot}`} />{label}
              </div>
              <div className="space-y-3">
                {items.map(({ title, desc }) => (
                  <div key={title} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
                    <div className="font-semibold text-white text-sm mb-1">{title}</div>
                    <p className="text-white/35 text-xs leading-relaxed">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </MarketingLayout>
  )
}
