import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BookOpen,
  Calendar,
  Camera,
  FolderOpen,
  Layers,
  LayoutDashboard,
  Palette,
  Settings,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react'
import { LogoFull } from '../components/ui/Logo'

/* ─── Typography tokens (Notion-like doc) ─────────────────────── */

const guideH2 = 'text-2xl font-semibold text-[#37352F] tracking-tight mb-4 scroll-mt-28'
const guideH2Spaced = `${guideH2} mt-14`
const guideH3 = 'text-lg font-semibold text-[#37352F] mt-10 mb-2 scroll-mt-28'
const guideP = 'text-[15px] leading-[1.7] text-[#37352F]/85 mb-4'
const guideUl = 'list-disc pl-5 text-[15px] leading-[1.65] text-[#37352F]/85 mb-4 space-y-1.5'

function DocShell({ children }) {
  const marketingLightThemeVars = {
    '--cc-ink-rgb': '15 23 42',
    '--cc-fog-rgb': '229 231 235',
    '--cc-mist-rgb': '247 247 248',
    '--cc-surface-rgb': '255 255 255',
    '--cc-page-rgb': '255 255 255',
  }

  return (
    <div className="min-h-screen bg-[#FBFBFA] text-[#37352F]" style={marketingLightThemeVars}>
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
            <Link
              to="/login"
              className="text-sm text-[#37352F]/55 hover:text-[#37352F] px-3 py-1.5 rounded-lg transition-colors"
            >
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
    <figure className="my-8 rounded-xl border border-black/[0.08] bg-surface shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden max-w-3xl">
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
    <GuideWindow title="Dashboard" subtitle="Pipeline snapshot">
      <div className="flex gap-4">
        <div className="w-44 hidden sm:block rounded-lg border border-fog bg-mist/50 p-3 space-y-2">
          <div className="text-[10px] font-bold text-ink/35 uppercase tracking-wider">Workspace</div>
          <div className="text-xs font-semibold text-ink">Your company</div>
          <div className="h-px bg-fog my-2" />
          <div className="text-xs text-ink/50 py-1 rounded bg-surface border border-fog px-2">Dashboard</div>
          <div className="text-xs text-ink/35 py-1 px-2">Calendar</div>
          <div className="text-xs text-ink/35 py-1 px-2">Brand kit</div>
        </div>
        <div className="flex-1 space-y-4">
          <p className="text-lg font-semibold text-ink">Content pipeline</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { v: '24', l: 'Posts scheduled' },
              { v: '18', l: 'Ready to publish' },
              { v: '6', l: 'In draft' },
            ].map((s) => (
              <div key={s.l} className="rounded-xl border border-fog bg-surface p-3">
                <div className="text-xl font-semibold text-ink">{s.v}</div>
                <div className="text-[10px] text-ink/40 mt-0.5 leading-tight">{s.l}</div>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-fog bg-surface p-3">
            <div className="text-[11px] font-semibold text-ink/50 mb-2">Upcoming</div>
            <div className="flex flex-wrap gap-2 text-[11px] text-ink/60">
              <span className="px-2 py-0.5 rounded bg-mist">Product story</span>
              <span className="px-2 py-0.5 rounded bg-mist">Offer reminder</span>
            </div>
          </div>
        </div>
      </div>
    </GuideWindow>
  )
}

function ShotTrends() {
  return (
    <GuideWindow title="Trending topics" subtitle="Industry signals">
      <p className="text-[11px] text-ink/45 mb-3">
        On supported plans, turn live topics into posts while attention is still high. Useful for launches, newsjacking, and
        keeping the feed from going quiet between campaigns.
      </p>
      <div className="space-y-2">
        {[
          { t: 'Embedded finance in retail', b: 'rising' },
          { t: 'Trust-first creative formats', b: 'steady' },
          { t: 'Community-led product drops', b: 'viral' },
        ].map((row) => (
          <div
            key={row.t}
            className="flex items-center justify-between rounded-lg border border-fog bg-surface px-3 py-2.5 gap-2"
          >
            <p className="text-xs font-medium text-ink truncate">{row.t}</p>
            <span className="text-[10px] font-bold uppercase text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full flex-shrink-0">
              {row.b}
            </span>
          </div>
        ))}
      </div>
    </GuideWindow>
  )
}

function ShotBrandKit() {
  return (
    <GuideWindow title="Brand kit: Visual" subtitle="Tokens for generation">
      <div className="flex flex-wrap gap-1.5 mb-4 border-b border-fog pb-3">
        {['Basics', 'Audience', 'Identity', 'Visual', 'Voice', 'Compliance', 'Rules'].map((t, i) => (
          <span
            key={t}
            className={`text-[11px] px-2 py-1 rounded-md ${i === 3 ? 'bg-slate-900 text-white font-semibold' : 'text-ink/40'}`}
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
      <label className="block text-[10px] font-bold text-ink/40 uppercase tracking-wider mb-1">
        People in generated images
      </label>
      <div className="rounded-lg border border-fog bg-mist/40 px-3 py-2 text-sm text-ink">Real people · Illustration · Mix</div>
    </GuideWindow>
  )
}

function ShotCalendar() {
  return (
    <GuideWindow title="Content calendar" subtitle="Month view and prep">
      <div className="flex gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-ink">Active brand</span>
            <span className="text-[10px] text-white bg-slate-900 px-2 py-1 rounded-lg">Generate</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {['Product spotlight', 'Behind the scenes', 'Seasonal offer'].map((t, i) => (
              <div key={t} className="rounded-lg border border-fog overflow-hidden bg-surface">
                <div className="aspect-square bg-gradient-to-br from-amber-100 to-stone-200" />
                <div className="p-2 border-t border-fog">
                  <p className="text-[10px] font-medium text-ink truncate">{t}</p>
                  <p className="text-[9px] text-ink/35">Slot {i + 1}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="w-36 hidden md:block flex-shrink-0 rounded-lg border border-fog bg-surface p-2">
          <div className="text-[9px] font-semibold text-ink/50 mb-2">Prep assistant</div>
          <div className="space-y-1.5 text-[9px] leading-snug">
            <div className="bg-mist rounded p-1.5 text-ink/70">What should we emphasise in April?</div>
            <div className="bg-brand-500/10 rounded p-1.5 text-ink/80 border border-brand-500/15">
              Lead with the new tier, proof points over hype.
            </div>
          </div>
        </div>
      </div>
    </GuideWindow>
  )
}

function ShotGenerateModal() {
  return (
    <GuideWindow title="Generate month" subtitle="Platforms, cadence, holidays">
      <div className="rounded-lg border border-fog bg-mist/50 p-3 space-y-2 mb-3">
        <label className="flex items-start gap-2 cursor-default">
          <input type="checkbox" checked readOnly className="mt-0.5" />
          <span className="text-[11px] text-ink/75 leading-relaxed">
            <span className="font-semibold text-ink">Include public holidays</span> for your profile country so timely
            posts can align with what your market is already thinking about.
          </span>
        </label>
        <ul className="text-[10px] text-ink/50 list-disc pl-5 space-y-0.5">
          <li>Regional public holiday</li>
          <li>Global observance</li>
        </ul>
      </div>
      <div className="flex gap-2 mb-3">
        {['Instagram', 'Facebook'].map((p) => (
          <span key={p} className="text-[10px] px-2 py-1 rounded-lg border border-ink/15 bg-slate-900 text-white font-medium">
            {p}
          </span>
        ))}
      </div>
      <div className="h-9 rounded-lg bg-[#2383E2] text-white text-xs font-semibold flex items-center justify-center gap-1.5">
        <Zap size={12} /> Generate month
      </div>
    </GuideWindow>
  )
}

function ShotDirectory() {
  return (
    <GuideWindow title="Directory" subtitle="Rendered creative library">
      <p className="text-[11px] text-ink/45 mb-3">
        One place to review, download, and reuse visuals across brands without opening each calendar card.
      </p>
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
    <GuideWindow title="Templates" subtitle="Topic lanes">
      <div className="space-y-2">
        {[
          { n: 'Q2 revenue push', t: '12 topics' },
          { n: 'Founder narrative', t: '8 topics' },
        ].map((row) => (
          <div key={row.n} className="flex items-center justify-between rounded-lg border border-fog bg-surface px-3 py-2.5">
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

function ShotPhotoCaption() {
  return (
    <GuideWindow title="Caption from photo" subtitle="Product and event stills">
      <div className="rounded-lg border border-dashed border-fog bg-mist/30 p-4 text-center mb-3">
        <Camera size={24} className="mx-auto text-ink/25 mb-2" />
        <p className="text-[11px] text-ink/50">Upload or describe your photo</p>
      </div>
      <div className="rounded-lg border border-fog bg-surface p-3 space-y-2">
        <p className="text-[10px] font-semibold text-ink/45 uppercase">Platform output</p>
        <p className="text-xs text-ink/75 leading-relaxed">
          Hook-first caption, body, and hashtags tuned to your brand voice, ready to paste where you publish.
        </p>
      </div>
    </GuideWindow>
  )
}

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
  { id: 'introduction', label: 'Why ContentCard', icon: BookOpen },
  { id: 'workspaces', label: 'Workspaces & navigation', icon: Users },
  { id: 'brand-kit', label: 'Brand kit (deep dive)', icon: Palette },
  { id: 'dashboard', label: 'Dashboard & trends', icon: LayoutDashboard },
  { id: 'calendar', label: 'Calendar & generation', icon: Calendar },
  { id: 'templates', label: 'Templates', icon: Layers },
  { id: 'directory', label: 'Directory', icon: FolderOpen },
  { id: 'photo-captions', label: 'Photo captions', icon: Camera },
  { id: 'settings-billing', label: 'Settings & billing', icon: Settings },
]

export default function ProductGuidePage() {
  return (
    <DocShell>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 lg:py-14">
        <div className="lg:grid lg:grid-cols-[210px_1fr] lg:gap-12 xl:grid-cols-[230px_1fr]">
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

          <article className="max-w-2xl">
            <p className="text-[13px] font-medium text-[#2383E2] uppercase tracking-wider mb-2">Product guide</p>
            <h1 className="text-4xl font-bold text-[#37352F] tracking-tight mb-3 scroll-mt-28" id="top">
              Turn social into a reliable growth channel
            </h1>
            <p className="text-lg text-[#37352F]/65 leading-relaxed mb-10">
              ContentCard helps you publish <strong>consistent, on-brand posts</strong> at scale: full-month runs,
              trend-led angles, and creative your sales and performance teams can reuse. Below is a full walkthrough of
              how each area of the product supports pipeline, conversion, and revenue: not just “features,” but where
              they show up in your workflow.
            </p>

            {/* ── INTRO ── */}
            <section id="introduction" className="scroll-mt-28">
              <h2 className={`${guideH2} mt-10`}>Why ContentCard</h2>

              <h3 className={guideH3}>Pipeline and revenue, not vanity posts</h3>
              <p className={guideP}>
                Buyers discover and compare on social long before they talk to sales. When the feed goes quiet, or sounds
                off-brand, you lose <strong>consideration windows</strong>, retargeting efficiency, and trust. ContentCard
                is built so marketing can keep a <strong>steady drumbeat</strong> of proof, offers, and stories aligned
                with what your site and ads already claim, which supports <strong>faster cycles</strong> and{' '}
                <strong>higher-quality inbound</strong>.
              </p>

              <h3 className={guideH3}>What the product does end-to-end</h3>
              <ul className={guideUl}>
                <li>
                  <strong>Brand kit</strong> captures who you are, who you serve, and how you look, so AI output matches
                  positioning instead of generic “motivational” filler.
                </li>
                <li>
                  <strong>Calendar & generation</strong> fill a month with platform-native posts and graphics tied to
                  launches, holidays, and your prep brief.
                </li>
                <li>
                  <strong>Trends</strong> (on eligible plans) help you react while topics are still hot, which matters for
                  traffic spikes and share of voice.
                </li>
                <li>
                  <strong>Directory</strong> centralises finished visuals for paid social, decks, and lifecycle email.
                </li>
                <li>
                  <strong>Photo caption</strong> flows turn existing photography into publish-ready copy in your voice.
                </li>
              </ul>
              <ShotDashboard />
            </section>

            {/* ── WORKSPACES ── */}
            <section id="workspaces" className="scroll-mt-28">
              <h2 className={guideH2Spaced}>Workspaces & navigation</h2>

              <h3 className={guideH3}>Workspace vs brand</h3>
              <p className={guideP}>
                A <strong>workspace</strong> is the home for billing, seats, and membership, typically one company or
                one agency. Inside it you create <strong>brands</strong>: separate profiles for each client, product line,
                or region. That separation keeps <strong>voice, compliance, and visuals</strong> from bleeding across
                accounts. That matters when each brand has different offers and risk profiles.
              </p>

              <h3 className={guideH3}>Switching context</h3>
              <p className={guideP}>
                If you have access to multiple workspaces, pick the active one from the sidebar. Then choose the{' '}
                <strong>active brand</strong>. The calendar, templates, and brand kit always follow that selection so
                nothing ships under the wrong positioning.
              </p>

              <h3 className={guideH3}>Where to work day to day</h3>
              <ul className={guideUl}>
                <li>
                  <strong>Dashboard</strong>: volume, readiness, upcoming posts, and (where enabled) trends.
                </li>
                <li>
                  <strong>Calendar</strong>: schedule, generate months, prep chat, edit and regenerate posts.
                </li>
                <li>
                  <strong>Templates</strong>: reusable topic lists for strategic campaigns.
                </li>
                <li>
                  <strong>Brand kit</strong>: the source of truth the AI reads before writing or designing.
                </li>
                <li>
                  <strong>Directory</strong>: gallery of rendered images across brands in the workspace.
                </li>
                <li>
                  <strong>Settings</strong>: profile (including country for local holidays), security, workspace context.
                </li>
                <li>
                  <strong>Billing</strong>: plan, payment method, and limits for your workspace.
                </li>
              </ul>
            </section>

            {/* ── BRAND KIT DEEP DIVE ── */}
            <section id="brand-kit" className="scroll-mt-28">
              <h2 className={guideH2Spaced}>Brand kit: full breakdown</h2>
              <p className={guideP}>
                The brand kit is the <strong>contract between your strategy and the AI</strong>. Richer inputs produce
                posts that sound like your team, support claims you can defend, and visuals that match your guidelines,
                which directly affects <strong>CTR, save rate, and downstream conversion</strong> on paid and organic.
              </p>

              <h3 className={guideH3}>Strength score & saving</h3>
              <p className={guideP}>
                At the top of the Brand Kit you will see a <strong>strength score</strong> with per-field badges (Poor →
                Excellent). Use it as a prioritisation list: fix “Poor” fields first, they usually move reply quality and
                visual coherence the most. Always tap <strong>Save changes</strong> when you finish a session so
                generation and captions pull the latest kit.
              </p>

              <h3 className={guideH3}>Before month generation unlocks</h3>
              <p className={guideP}>
                Full-month generation checks that the brand is <strong>ready to ship</strong>. In practice you must have
                filled (or have on the brand record where your account stores them):
              </p>
              <ul className={guideUl}>
                <li>
                  <strong>Target audience</strong>: Audience tab: who you are speaking to (generation blocks until this is
                  meaningful text).
                </li>
                <li>
                  <strong>Tone tags</strong>: Voice tab: at least one tag; ideally several so the model can blend your
                  voice (e.g. Bold + Professional + Warm).
                </li>
                <li>
                  <strong>Language style</strong>: Voice tab: the dialect/register your market expects (options can
                  reflect your profile country when set in Settings).
                </li>
                <li>
                  <strong>Writing style</strong>: stored on the brand profile as <code className="text-[13px] bg-black/[0.06] px-1 rounded">brand_kit.writing_style</code> (product copy refers to this as part of Voice / readiness). Use a
                  clear default such as conversational, formal, or storytelling so captions stay consistent.
                </li>
                <li>
                  <strong>Key messages</strong>: stored as <code className="text-[13px] bg-black/[0.06] px-1 rounded">brand_kit.key_messages</code>                   (readiness labels this as Messaging). These are the pillars every post should ladder to: value props,
                  proof points, and differentiators. Without them, the model guesses; with them, output
                  reinforces what sales already says on calls.
                </li>
              </ul>
              <Callout emoji="✓" title="Commercial impact">
                Teams that complete this checklist see fewer generic hooks, tighter CTAs, and less legal rework, because
                guardrails and proof are baked in before the first draft.
              </Callout>

              <h3 className={guideH3}>Basics tab</h3>
              <p className={guideP}>
                <strong>Brand name</strong> anchors every caption and visual brief. <strong>Industry</strong> steers
                vocabulary, examples, and compliance tone (finance vs beauty vs SaaS). The <strong>What you do</strong>{' '}
                description is one of the highest-leverage fields: explain who you help, the outcome you deliver, and
                what makes you different. Longer, specific copy beats one-line slogans for AI quality.
              </p>
              <p className={guideP}>
                <strong>Website</strong> and <strong>Location</strong> ground trust and local relevance.
                <strong> Social handles</strong> (Instagram, Facebook, Twitter/X) keep references accurate when posts
                mention “find us @…”.
              </p>

              <h3 className={guideH3}>Audience tab</h3>
              <p className={guideP}>
                <strong>Who are they?</strong> should go beyond demographics: roles, motivations, objections, and
                buying triggers. <strong>Age range</strong> and <strong>Audience location</strong> sharpen creative and
                language choices. <strong>Biggest pain point</strong> is what makes people stop scrolling. Use concrete
                frustrations and consequences so posts can speak to urgency and empathy (both lift engagement and
                qualified clicks).
              </p>

              <h3 className={guideH3}>Identity tab</h3>
              <p className={guideP}>
                <strong>Brand colours</strong> flow into generated backgrounds and slide treatments. Add at least a
                primary and accent so palettes are not left to AI defaults. <strong>Brand font</strong> sets typography
                direction for slide-style output. <strong>Design style</strong> (bold, minimal, warm, premium) steers the
                overall visual feel of generated imagery toward the aesthetic your buyers associate with your price point.
              </p>

              <h3 className={guideH3}>Visual tab (visual brand system)</h3>
              <p className={guideP}>
                This is the <strong>token layer</strong> for visuals: <strong>primary, secondary, accent, and neutral</strong> hex values should match real brand guidelines (valid <code className="text-[13px] bg-black/[0.06] px-1 rounded">#RRGGBB</code> only).{' '}
                <strong>Heading and body fonts</strong> (for slide-style layouts) should match what marketing approves
                for customer-facing design.
              </p>
              <p className={guideP}>
                <strong>People in generated images</strong>: choose <em>real people</em> for photoreal campaigns,{' '}
                <em>illustration</em> for stylised or product-led art, or <em>mix</em> to vary by post. That choice
                affects how human proof vs brand illustration shows up in the feed. Pick what supports your conversion
                story (e.g. services often lean real; consumer packaged goods may mix).
              </p>
              <p className={guideP}>
                <strong>Logo placement</strong> and <strong>minimum logo width</strong> control how the composited logo
                appears on exported images. <strong>Allowed layout archetypes</strong> define which layout families the
                system can rotate through (photo hero, portrait story, pattern headline, flat education, POV comic).
                Keep at least one enabled. <strong>Never show</strong> lists motifs to avoid in imagery (stock clichés,
                competitor marks). <strong>Forbidden hexes</strong> block off-brand colours. <strong>Reference URLs</strong>{' '}
                (optional) can steer mood boards; you must confirm you have rights to use them for style guidance.
              </p>
              <ShotBrandKit />

              <h3 className={guideH3}>Voice tab</h3>
              <p className={guideP}>
                <strong>Tone tags</strong> combine to define voice. Select enough tags that the model can hit your
                register (not only “Professional”). The <strong>personality</strong> slider moves between serious and
                casual; use it to align with how your sales team actually speaks to buyers. <strong>Language style</strong>{' '}
                should mirror how your audience talks (including regional options when your profile country is set in
                Settings, otherwise you still get a sensible default list).
              </p>
              <p className={guideP}>
                Together with writing style and key messages (readiness above), Voice is what makes generated captions
                feel like <strong>your</strong> brand, not interchangeable AI copy, so downstream actions (DMs, link
                clicks, saves) improve.
              </p>

              <h3 className={guideH3}>Compliance tab</h3>
              <p className={guideP}>
                Use <strong>industry presets</strong> (finance, health, alcohol, crypto, real estate, etc.) to preload
                common guardrails. Toggle individual rules such as disclaimers, no guarantees, not financial advice, age
                gates, fair housing, and disclosure requirements. Add your <strong>regulatory body</strong> and optional{' '}
                <strong>custom disclaimer</strong> text so generated posts stay inside what legal and brand approve,
                reducing takedown risk and protecting revenue during scale-up.
              </p>

              <h3 className={guideH3}>Rules tab</h3>
              <p className={guideP}>
                <strong>Words to never use</strong> blocks competitor names, banned claims, or off-brand jargon across
                all AI text. <strong>Brand guidelines</strong> is your editorial layer, formatting habits, CTA patterns,
                inclusivity rules, and “always / never” bullets. The more specific you are, the less time editors spend
                rewriting, so you can ship more posts per week with the same headcount.
              </p>
            </section>

            {/* ── DASHBOARD ── */}
            <section id="dashboard" className="scroll-mt-28">
              <h2 className={guideH2Spaced}>Dashboard & trending topics</h2>

              <h3 className={guideH3}>Operational view</h3>
              <p className={guideP}>
                The dashboard answers: <em>Do we have enough scheduled?</em> <em>What is going live soon?</em>{' '}
                <em>How much is still draft?</em> That visibility helps you align social with <strong>product launches</strong>,{' '}
                <strong>sales plays</strong>, and <strong>reporting cadence</strong>, so the channel does not miss the
                week revenue marketing cares about.
              </p>

              <h3 className={guideH3}>Trending topics (plan-dependent)</h3>
              <p className={guideP}>
                When your workspace plan includes trends, you see a live list of industry topics with momentum. Turning
                a trend into a post quickly helps you capture <strong>attention while CPMs are favourable</strong> and
                while the narrative still feels fresh. Useful for newsjacking, category education, and share-of-voice
                against slower competitors.
              </p>
              <ShotTrends />
            </section>

            {/* ── CALENDAR ── */}
            <section id="calendar" className="scroll-mt-28">
              <h2 className={guideH2Spaced}>Calendar & month generation</h2>

              <h3 className={guideH3}>Month and platform filters</h3>
              <p className={guideP}>
                Move between months to plan ahead of fiscal quarters and retail peaks. Filter by platform when a
                campaign is channel-specific, so Instagram-heavy launches do not clutter your LinkedIn view.
              </p>

              <h3 className={guideH3}>Generating a full month</h3>
              <p className={guideP}>
                Open <strong>Generate</strong>, choose <strong>platform</strong>, <strong>posts per week</strong>, and
                an optional <strong>focus topic</strong> when you want the month to orbit one initiative (e.g. a new
                SKU). The flow can include <strong>public holidays</strong> for your profile country plus global
                observances, strong for retail, B2C services, and cultural relevance. You can opt out if the month should
                stay purely product- or offer-led.
              </p>
              <ShotGenerateModal />

              <h3 className={guideH3}>Prep assistant (desktop)</h3>
              <p className={guideP}>
                Beside the calendar on wide screens, the prep assistant collects context, launches, promos, proof you
                want highlighted, tone shifts. That conversation is passed into generation so the month reflects what
                leadership and sales care about <strong>this</strong> quarter, not a generic content calendar.
              </p>
              <ShotCalendar />

              <h3 className={guideH3}>After posts exist: edit, regenerate, visuals</h3>
              <p className={guideP}>
                Open any card to edit captions and hashtags, <strong>redraft</strong> copy with AI, or{' '}
                <strong>refresh visuals</strong> while keeping structure, or pick a new layout archetype when you want a
                different creative angle for the same message. That iteration loop supports A/B testing and stakeholder
                feedback without restarting the month from zero.
              </p>

              <h3 className={guideH3}>Select & remove from calendar</h3>
              <p className={guideP}>
                Use <strong>Select</strong> to multi-select cards, then <strong>Remove from calendar</strong> when
                priorities change. That clears schedule fields but <strong>keeps assets in Directory</strong>, so paid
                social, lifecycle, and partner enablement can still use the creative you already paid to generate.
              </p>
            </section>

            {/* ── TEMPLATES ── */}
            <section id="templates" className="scroll-mt-28">
              <h2 className={guideH2Spaced}>Templates</h2>

              <h3 className={guideH3}>What templates are for</h3>
              <p className={guideP}>
                Templates store <strong>curated topic lists</strong>, for example “Q2 pipeline push” or “Founder-led
                narrative.” They keep the AI rotating through the themes your GTM org cares about instead of drifting
                into generic inspiration quotes.
              </p>

              <h3 className={guideH3}>How to use them with generation</h3>
              <p className={guideP}>
                Attach a template when you generate a month so every post ladders to a strategic lane. That is
                especially valuable when <strong>sales needs a drumbeat</strong> around one offer, when{' '}
                <strong>product marketing</strong> is sequencing feature stories, or when <strong>comms</strong> is
                running a reputation arc after a launch.
              </p>
              <ShotTemplates />
            </section>

            {/* ── DIRECTORY ── */}
            <section id="directory" className="scroll-mt-28">
              <h2 className={guideH2Spaced}>Directory</h2>

              <h3 className={guideH3}>Single source for finished art</h3>
              <p className={guideP}>
                The directory lists rendered images across every brand in the workspace, newest first. It is the
                fastest way for <strong>performance marketing</strong> to pull candidates for creative testing, for{' '}
                <strong>sales enablement</strong> to drop proof into decks, and for <strong>lifecycle</strong> to reuse
                winners without hunting through calendar cards.
              </p>

              <h3 className={guideH3}>Relationship to the calendar</h3>
              <p className={guideP}>
                Removing a post from the calendar does <strong>not</strong> remove it from the directory. That
                separation protects creative investment when plans shift. You keep the asset library even if the publish
                schedule changes.
              </p>
              <ShotDirectory />
            </section>

            {/* ── PHOTO CAPTIONS ── */}
            <section id="photo-captions" className="scroll-mt-28">
              <h2 className={guideH2Spaced}>Photo captions</h2>

              <h3 className={guideH3}>When to use it</h3>
              <p className={guideP}>
                When you already have strong photography (product shots, event photos, retail displays), use the caption
                workflow to produce <strong>platform-native hooks and bodies</strong> in your brand voice, plus
                hashtags. That shortens time-to-publish for launches and social proof moments where the image is the
                hero.
              </p>

              <h3 className={guideH3}>What you supply</h3>
              <p className={guideP}>
                Describe the scene (and optionally attach the image where your workflow supports it), pick mood and
                platforms, and receive structured copy you can paste into Instagram, Facebook, Twitter/X, or LinkedIn,
                aligned with the same brand kit the month generator uses.
              </p>
              <ShotPhotoCaption />
            </section>

            {/* ── SETTINGS & BILLING ── */}
            <section id="settings-billing" className="scroll-mt-28">
              <h2 className={guideH2Spaced}>Settings & billing</h2>

              <h3 className={guideH3}>Settings: profile & country</h3>
              <p className={guideP}>
                Your <strong>profile country</strong> powers local public holidays in month generation and can unlock
                richer <strong>language style</strong> options in the brand kit. Keeping profile data accurate improves
                local relevance, which matters for conversion in regional campaigns and regulated categories.
              </p>

              <h3 className={guideH3}>Billing: plans and scale</h3>
              <p className={guideP}>
                Billing lives at the <strong>workspace</strong> level. Plans differ by brands, seats, generation
                allowances, and whether <strong>trending topics</strong> and other advanced features are included.
                Upgrade when you add brands or need trend intelligence for always-on programmes. Trial workspaces may have
                a capped number of full generations. Your Billing page shows live usage and renewal dates so finance can
                forecast spend against pipeline goals.
              </p>
              <p className={guideP}>
                Use <strong>Billing</strong> in the sidebar to manage payment method, plan, and subscription status.
              </p>
            </section>

            <hr className="border-black/[0.08] my-12" />

            <p className="text-sm text-[#37352F]/55 leading-relaxed">
              Ready to shorten content cycles and keep social aligned with revenue?{' '}
              <Link to="/signup" className="text-[#2383E2] font-medium hover:underline">
                Start your free trial
              </Link>
              {' · '}
              <Link to="/contact" className="text-[#2383E2] hover:underline">
                Talk to us
              </Link>
              {' · '}
              <Link to="/" className="text-[#2383E2] hover:underline">
                Home
              </Link>
            </p>
          </article>
        </div>

        <div className="lg:hidden mt-10 pt-8 border-t border-black/[0.06]">
          <p className="text-[11px] font-semibold text-[#37352F]/45 uppercase tracking-wider mb-3">Jump to</p>
          <div className="flex flex-wrap gap-2">
            {TOC.map(({ id, label }) => (
              <a
                key={id}
                href={`#${id}`}
                className="text-xs px-3 py-1.5 rounded-full border border-black/[0.08] bg-surface text-[#37352F]/70 hover:border-[#2383E2]/40 hover:text-[#2383E2]"
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
