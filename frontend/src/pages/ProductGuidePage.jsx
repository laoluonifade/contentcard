import { Link } from 'react-router-dom'
import { ArrowRight, BookOpen, Calendar, FolderOpen, Layers, Palette, Sparkles, Users, Zap } from 'lucide-react'
import { LogoFull } from '../components/ui/Logo'

/* ─── Notion-like doc chrome ─────────────────────────────────────── */

function DocShell({ children }) {
  return (
    <div className="min-h-screen bg-[#FBFBFA] text-[#37352F]">
      <header className="sticky top-0 z-30 border-b border-black/[0.06] bg-[#FBFBFA]/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/" className="flex-shrink-0 opacity-90 hover:opacity-100 transition-opacity">
              <LogoFull size={22} />
            </Link>
            <span className="hidden sm:inline text-[#37352F]/35">/</span>
            <span className="hidden sm:inline text-sm font-medium text-[#37352F]/70 truncate">Product guide</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link to="/login" className="text-sm text-[#37352F]/55 hover:text-[#37352F] px-3 py-1.5 rounded-lg transition-colors">
              Log in
            </Link>
            <Link
              to="/signup"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-[#2383E2] hover:bg-[#1a6ec4] px-3 py-1.5 rounded-lg transition-colors"
            >
              Start free trial <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </header>
      {children}
    </div>
  )
}

function GuideWindow({ title, subtitle, children }) {
  return (
    <figure className="my-8 rounded-xl border border-black/[0.08] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden max-w-3xl">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-black/[0.06] bg-[#FAFAFA]">
        <div className="flex gap-1">
          {['#FF5F57', '#FEBC2E', '#28C840'].map((c) => (
            <div key={c} className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
          ))}
        </div>
        <div className="flex-1 text-center">
          <span className="text-[11px] text-[#37352F]/45 font-medium truncate block">{title}</span>
        </div>
        <div className="w-10" />
      </div>
      {subtitle && <figcaption className="sr-only">{subtitle}</figcaption>}
      <div className="p-4 sm:p-5">{children}</div>
    </figure>
  )
}

function ShotDashboard() {
  return (
    <GuideWindow title="app.contentcard.io/dashboard — Aurora Workspace" subtitle="Dummy dashboard overview">
      <div className="flex gap-4">
        <div className="w-44 hidden sm:block rounded-lg border border-fog bg-mist/50 p-3 space-y-2">
          <div className="text-[10px] font-bold text-ink/35 uppercase tracking-wider">Workspace</div>
          <div className="text-xs font-semibold text-ink">Aurora Labs</div>
          <div className="h-px bg-fog my-2" />
          <div className="text-xs text-ink/50 py-1 rounded bg-white border border-fog px-2">Dashboard</div>
          <div className="text-xs text-ink/35 py-1 px-2">Calendar</div>
          <div className="text-xs text-ink/35 py-1 px-2">Brand kit</div>
        </div>
        <div className="flex-1 space-y-4">
          <div>
            <p className="text-[10px] text-ink/40 uppercase tracking-wide mb-1">Good afternoon</p>
            <p className="text-lg font-semibold text-ink">Maya · April 2026</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { v: '24', l: 'Posts this month' },
              { v: '18', l: 'Ready to publish' },
              { v: '6', l: 'Drafts' },
            ].map((s) => (
              <div key={s.l} className="rounded-xl border border-fog bg-white p-3">
                <div className="text-xl font-semibold text-ink">{s.v}</div>
                <div className="text-[10px] text-ink/40 mt-0.5 leading-tight">{s.l}</div>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-fog bg-white p-3">
            <div className="text-[11px] font-semibold text-ink/50 mb-2">Upcoming</div>
            <div className="flex gap-2 text-[11px] text-ink/60">
              <span className="px-2 py-0.5 rounded bg-mist">Thu 17 · Launch teaser</span>
              <span className="px-2 py-0.5 rounded bg-mist">Mon 21 · Customer story</span>
            </div>
          </div>
        </div>
      </div>
    </GuideWindow>
  )
}

function ShotBrandKit() {
  return (
    <GuideWindow title="Brand kit — Visual · Northwind Coffee" subtitle="Dummy brand kit visual tokens">
      <div className="flex flex-wrap gap-1.5 mb-4 border-b border-fog pb-3">
        {['Basics', 'Audience', 'Identity', 'Visual', 'Voice', 'Compliance'].map((t, i) => (
          <span
            key={t}
            className={`text-[11px] px-2 py-1 rounded-md ${i === 3 ? 'bg-ink text-white font-semibold' : 'text-ink/40'}`}
          >
            {t}
          </span>
        ))}
      </div>
      <p className="text-sm font-semibold text-ink mb-3">Visual brand system</p>
      <div className="grid sm:grid-cols-3 gap-2 mb-4">
        {['#5C4033', '#C4A574', '#2F4F4F'].map((c) => (
          <div key={c} className="h-14 rounded-lg border border-fog flex items-end p-2" style={{ background: `${c}18` }}>
            <span className="text-[10px] font-mono text-ink/70">{c}</span>
          </div>
        ))}
      </div>
      <label className="block text-[10px] font-bold text-ink/40 uppercase tracking-wider mb-1">People in generated images</label>
      <div className="rounded-lg border border-fog bg-mist/40 px-3 py-2 text-sm text-ink">Mix (vary by post)</div>
      <p className="text-[10px] text-ink/35 mt-3">Dummy data — your real hex values and style rules apply at generation time.</p>
    </GuideWindow>
  )
}

function ShotCalendar() {
  return (
    <GuideWindow title="Content calendar — April 2026 · Instagram" subtitle="Dummy calendar with prep sidebar">
      <div className="flex gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-ink">Northwind Coffee</span>
            <span className="text-[10px] text-white bg-ink px-2 py-1 rounded-lg">Generate</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {['Cold brew drop', 'Behind the roaster', 'Earth Day promo'].map((t, i) => (
              <div key={t} className="rounded-lg border border-fog overflow-hidden bg-white">
                <div className="aspect-square bg-gradient-to-br from-amber-100 to-stone-200" />
                <div className="p-2 border-t border-fog">
                  <p className="text-[10px] font-medium text-ink truncate">{t}</p>
                  <p className="text-[9px] text-ink/35">Apr {10 + i * 5}, 2026</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="w-36 hidden md:block flex-shrink-0 rounded-lg border border-fog bg-white p-2">
          <div className="text-[9px] font-semibold text-ink/50 mb-2">Prep assistant</div>
          <div className="space-y-1.5 text-[9px] leading-snug">
            <div className="bg-mist rounded p-1.5 text-ink/70">Any product shots for April?</div>
            <div className="bg-brand-500/10 rounded p-1.5 text-ink/80 border border-brand-500/15">We can highlight the new oat latte on the 8th.</div>
          </div>
        </div>
      </div>
    </GuideWindow>
  )
}

function ShotGenerateModal() {
  return (
    <GuideWindow title="Generate April 2026" subtitle="Holiday options with dummy dates">
      <div className="rounded-lg border border-fog bg-mist/50 p-3 space-y-2 mb-3">
        <label className="flex items-start gap-2 cursor-default">
          <input type="checkbox" checked readOnly className="mt-0.5" />
          <span className="text-[11px] text-ink/75 leading-relaxed">
            <span className="font-semibold text-ink">Include public holidays</span> (profile country NG). Planner weaves observances into topics.
          </span>
        </label>
        <ul className="text-[10px] text-ink/50 list-disc pl-5 space-y-0.5">
          <li>2026-04-01 — Easter Monday (country)</li>
          <li>2026-04-07 — World Health Day (global)</li>
        </ul>
      </div>
      <div className="flex gap-2 mb-3">
        {['Instagram', 'Facebook'].map((p) => (
          <span key={p} className="text-[10px] px-2 py-1 rounded-lg border border-ink/15 bg-ink text-white font-medium">
            {p}
          </span>
        ))}
      </div>
      <div className="h-9 rounded-lg bg-[#2383E2] text-white text-xs font-semibold flex items-center justify-center gap-1.5">
        <Zap size={12} /> Generate April 2026
      </div>
    </GuideWindow>
  )
}

function ShotDirectory() {
  return (
    <GuideWindow title="Directory — all rendered visuals" subtitle="Dummy asset grid">
      <p className="text-[11px] text-ink/45 mb-3">Every image your workspace generated, newest first. Removing a post from the calendar does not remove it here.</p>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="aspect-square rounded-lg border border-fog bg-gradient-to-br from-violet-100 via-white to-amber-50"
            style={{ opacity: 1 - i * 0.06 }}
          />
        ))}
      </div>
    </GuideWindow>
  )
}

function ShotTemplates() {
  return (
    <GuideWindow title="Templates — Northwind Coffee" subtitle="Dummy template list">
      <div className="space-y-2">
        {[
          { n: 'Q2 product push', t: '12 topics · last edited 2d ago' },
          { n: 'Founder-led thought leadership', t: '8 topics · last edited 1w ago' },
        ].map((row) => (
          <div key={row.n} className="flex items-center justify-between rounded-lg border border-fog bg-white px-3 py-2.5">
            <div>
              <p className="text-xs font-medium text-ink">{row.n}</p>
              <p className="text-[10px] text-ink/40">{row.t}</p>
            </div>
            <span className="text-[10px] text-ink/30">→</span>
          </div>
        ))}
      </div>
    </GuideWindow>
  )
}

const guideH2 = 'text-2xl font-semibold text-[#37352F] tracking-tight mb-4 scroll-mt-28'
const guideH2Spaced = `${guideH2} mt-14`
const guideP = 'text-[15px] leading-[1.7] text-[#37352F]/85 mb-4'

function Callout({ emoji, title, children }) {
  return (
    <div className="flex gap-3 rounded-lg border border-amber-200/90 bg-amber-50/90 px-4 py-3 my-6">
      <span className="text-lg leading-none flex-shrink-0" aria-hidden>
        {emoji}
      </span>
      <div>
        {title && <p className="text-sm font-semibold text-amber-950 mb-1">{title}</p>}
        <div className="text-sm text-amber-950/85 leading-relaxed">{children}</div>
      </div>
    </div>
  )
}

const TOC = [
  { id: 'introduction', label: 'Introduction', icon: BookOpen },
  { id: 'workspaces', label: 'Workspaces & brands', icon: Users },
  { id: 'brand-kit', label: 'Brand kit', icon: Palette },
  { id: 'calendar', label: 'Calendar & generation', icon: Calendar },
  { id: 'prep-holidays', label: 'Prep assistant & holidays', icon: Sparkles },
  { id: 'directory', label: 'Directory', icon: FolderOpen },
  { id: 'templates', label: 'Templates', icon: Layers },
  { id: 'billing', label: 'Billing & limits', icon: Zap },
]

export default function ProductGuidePage() {
  return (
    <DocShell>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 lg:py-14">
        <div className="lg:grid lg:grid-cols-[200px_1fr] lg:gap-12 xl:grid-cols-[220px_1fr]">
          {/* TOC — Notion-style mini nav */}
          <nav
            className="hidden lg:block sticky top-24 self-start text-sm space-y-0.5 border-l-2 border-black/[0.06] pl-4 mb-10 lg:mb-0"
            aria-label="On this page"
          >
            <p className="text-[11px] font-semibold text-[#37352F]/45 uppercase tracking-wider mb-3 pl-1">On this page</p>
            {TOC.map(({ id, label, icon: Icon }) => (
              <a
                key={id}
                href={`#${id}`}
                className="flex items-center gap-2 py-1.5 pl-1 pr-2 rounded-md text-[#37352F]/70 hover:bg-black/[0.04] hover:text-[#37352F] transition-colors scroll-mt-28"
              >
                <Icon size={14} className="text-[#37352F]/35 flex-shrink-0" />
                <span className="leading-snug">{label}</span>
              </a>
            ))}
          </nav>

          {/* Article */}
          <article className="max-w-2xl">
            <p className="text-[13px] font-medium text-[#2383E2] uppercase tracking-wider mb-2">Product guide</p>
            <h1 className="text-4xl font-bold text-[#37352F] tracking-tight mb-3 scroll-mt-28" id="top">
              How teams use ContentCard
            </h1>
            <p className="text-lg text-[#37352F]/65 leading-relaxed mb-10">
              Feature-level walkthrough with annotated UI. Screens use <strong>dummy brands and copy</strong> so you can
              see structure without real customer data.
            </p>

            <section id="introduction" className="scroll-mt-28">
              <h2 className={`${guideH2} mt-10`}>Introduction</h2>
              <p className={guideP}>
                ContentCard connects a <strong>workspace</strong> (your company or agency), one or more{' '}
                <strong>brands</strong>, and AI-generated social posts with on-brand visuals. You work from the{' '}
                <strong>dashboard</strong>, refine identity in the <strong>brand kit</strong>, plan in the{' '}
                <strong>calendar</strong>, and browse finished art in the <strong>directory</strong>.
              </p>
              <ShotDashboard />
              <Callout emoji="💡" title="Tip">
                Complete the brand kit checklist before your first month generation — captions and visuals both pull
                from the same profile.
              </Callout>
            </section>

            <section id="workspaces" className="scroll-mt-28">
              <h2 className={guideH2Spaced}>Workspaces & brands</h2>
              <p className={guideP}>
                A <strong>workspace</strong> is the billing and membership boundary. Inside it you create{' '}
                <strong>brands</strong> (clients, products, or regions). Switch the active brand from the dashboard
                sidebar; calendar and templates always follow the brand you have selected.
              </p>
              <p className={guideP}>
                <strong>Dummy data:</strong> “Aurora Labs” workspace with brands “Northwind Coffee” and “Stridepay
                Marketing” — only one is active at a time in the UI.
              </p>
            </section>

            <section id="brand-kit" className="scroll-mt-28">
              <h2 className={guideH2Spaced}>Brand kit</h2>
              <p className={guideP}>
                The brand kit is organised into tabs: <strong>Basics</strong>, <strong>Audience</strong>,{' '}
                <strong>Identity</strong>, <strong>Visual</strong> (colours, fonts, layout archetypes),{' '}
                <strong>Voice</strong>, <strong>Compliance</strong>, and <strong>Rules</strong>. Scores nudge you toward
                completeness.
              </p>
              <p className={guideP}>
                Under <strong>Visual → People in generated images</strong>, choose <em>real people</em> (photography),{' '}
                <em>illustration</em> (cartoon / flat brand art), or <em>mix</em> so the month can vary by post. This
                flows into AI planning and image prompts.
              </p>
              <ShotBrandKit />
            </section>

            <section id="calendar" className="scroll-mt-28">
              <h2 className={guideH2Spaced}>Calendar & generation</h2>
              <p className={guideP}>
                The <strong>content calendar</strong> shows scheduled posts for the selected month and platform
                filters. Use <strong>Generate</strong> to queue a full month: pick platform, posts-per-week, optional
                focus topic, and holiday behaviour (see below).
              </p>
              <p className={guideP}>
                <strong>Select</strong> lets you multi-select cards, then <strong>Remove from calendar</strong> clears
                schedule fields only — assets remain in Directory.
              </p>
              <ShotCalendar />
              <ShotGenerateModal />
            </section>

            <section id="prep-holidays" className="scroll-mt-28">
              <h2 className={guideH2Spaced}>Prep assistant & holidays</h2>
              <p className={guideP}>
                On wide screens, the <strong>Prep assistant</strong> sits beside the calendar. Chat about launches,
                promos, screenshots you care about, or tone — when you generate, that thread is summarised into the
                planner as extra context.
              </p>
              <p className={guideP}>
                When generating, ContentCard lists <strong>public holidays</strong> that fall in the target month using
                your <strong>profile country</strong> (set in account settings) plus global observances. Check or uncheck
                “include holidays” if you want the AI to skip weaving them into topics.
              </p>
              <Callout emoji="📅" title="Profile country">
                If no country is set, you still get global holidays; add a country for local observances (e.g. public
                holidays in NG, US, GB).
              </Callout>
            </section>

            <section id="directory" className="scroll-mt-28">
              <h2 className={guideH2Spaced}>Directory</h2>
              <p className={guideP}>
                The <strong>directory</strong> is a read-only gallery of rendered post images across every brand in the
                workspace. Use it to download or audit creative without opening each calendar card.
              </p>
              <ShotDirectory />
            </section>

            <section id="templates" className="scroll-mt-28">
              <h2 className={guideH2Spaced}>Templates</h2>
              <p className={guideP}>
                <strong>Templates</strong> store reusable topic lists. When generating a month, you can attach a
                template so the AI rotates through your strategic themes instead of guessing from scratch.
              </p>
              <ShotTemplates />
            </section>

            <section id="billing" className="scroll-mt-28">
              <h2 className={guideH2Spaced}>Billing & limits</h2>
              <p className={guideP}>
                Billing is scoped to the workspace plan (Starter, Business, Enterprise). Some plans include the live{' '}
                <strong>trending topics</strong> panel on the dashboard; others focus on generation volume and seats.
                Free trials include a small number of full generations — the product surfaces this in billing settings.
              </p>
              <p className={guideP}>
                <strong>Dummy data:</strong> “Business plan · 3 brands · renews May 3, 2026” — check your workspace’s{' '}
                <em>Billing</em> page for live numbers.
              </p>
            </section>

            <hr className="border-black/[0.08] my-12" />

            <p className="text-sm text-[#37352F]/50">
              Questions?{' '}
              <Link to="/contact" className="text-[#2383E2] hover:underline">
                Contact support
              </Link>{' '}
              ·{' '}
              <Link to="/" className="text-[#2383E2] hover:underline">
                Back to home
              </Link>
            </p>
          </article>
        </div>

        {/* Mobile TOC */}
        <div className="lg:hidden mt-10 pt-8 border-t border-black/[0.06]">
          <p className="text-[11px] font-semibold text-[#37352F]/45 uppercase tracking-wider mb-3">Jump to</p>
          <div className="flex flex-wrap gap-2">
            {TOC.map(({ id, label }) => (
              <a
                key={id}
                href={`#${id}`}
                className="text-xs px-3 py-1.5 rounded-full border border-black/[0.08] bg-white text-[#37352F]/70 hover:border-[#2383E2]/40 hover:text-[#2383E2]"
              >
                {label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </DocShell>
  )
}
