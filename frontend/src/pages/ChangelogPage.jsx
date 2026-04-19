import MarketingLayout from '../components/layout/MarketingLayout'

const RELEASES = [
  {
    version: 'v1.4.0', date: 'April 2026', tag: 'New',
    items: ['Approval workflows: editors submit, approvers review before anything goes live', 'Multi-brand dashboard with instant brand switching', 'Bulk download: export entire month as ZIP in one click'],
  },
  {
    version: 'v1.3.0', date: 'March 2026', tag: 'New',
    items: ['Live trend engine: industry trends updated every 24 hours', 'One-click post generation from any trending topic', 'Nigerian English and Pidgin caption tone options'],
  },
  {
    version: 'v1.2.0', date: 'February 2026', tag: 'Improvement',
    items: ['Faster generation: month of content now generates in under 30 seconds', 'Brand kit v2: set fonts, colour palette, and logo placement rules', 'Calendar drag-and-drop reordering'],
  },
  {
    version: 'v1.1.0', date: 'January 2026', tag: 'Improvement',
    items: ['Team roles: Admin, Editor, Approver, and Viewer permissions', 'Invite team members by email', 'Activity log for all workspace actions'],
  },
  {
    version: 'v1.0.0', date: 'December 2025', tag: 'Launch',
    items: ['ContentCard launches publicly', 'AI content generation for Instagram, Facebook, and Twitter', 'Brand kit, content calendar, and one-click download'],
  },
]

const TAG_COLORS = { New: 'bg-teal/15 text-teal border-teal/25', Improvement: 'bg-brand-500/15 text-brand-400 border-brand-500/25', Launch: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25' }

export default function ChangelogPage() {
  return (
    <MarketingLayout>
      <section className="py-16 px-6 border-b border-white/5 text-center">
        <div className="max-w-2xl mx-auto">
          <div className="text-brand-400 text-xs font-bold uppercase tracking-widest mb-4">Changelog</div>
          <h1 className="text-4xl font-bold mb-4" style={{ letterSpacing: '-0.03em' }}>What's new in ContentCard</h1>
          <p className="text-white/45">Every update, improvement, and launch: in one place.</p>
        </div>
      </section>
      <section className="py-16 px-6">
        <div className="max-w-3xl mx-auto space-y-8">
          {RELEASES.map(({ version, date, tag, items }) => (
            <div key={version} className="relative pl-8 border-l border-white/10">
              <div className="absolute -left-1.5 top-1 w-3 h-3 rounded-full bg-brand-500 border-2 border-ink" />
              <div className="flex items-center gap-3 mb-3">
                <span className="text-white font-bold">{version}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${TAG_COLORS[tag]}`}>{tag}</span>
                <span className="text-white/30 text-sm">{date}</span>
              </div>
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 space-y-2">
                {items.map(item => (
                  <div key={item} className="flex items-start gap-2.5 text-sm text-white/60">
                    <div className="w-1 h-1 rounded-full bg-brand-500 flex-shrink-0 mt-2" />
                    {item}
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
