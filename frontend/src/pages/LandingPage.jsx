import { useMemo, useState } from 'react'
import { ArrowRight, Calendar, CreditCard, Heart, Images, LayoutDashboard, LayoutTemplate, LogIn, Settings, Share2, Smile, Sparkles, Wand2, Globe, Loader2, CheckCircle2, Lock } from 'lucide-react'
import Seo from '../components/seo/Seo'
import { LogoFull } from '../components/ui/Logo'
import AuthEntryModal from '../components/auth/AuthEntryModal'
import { buildGuestPlanSummary, buildGuestSamplePosts, buildGuestWorkspaceProfile } from '../utils/guestFlow'
import { persistGuestContext } from '../utils/authFlow'

const NAV_ITEMS = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'AI', icon: Sparkles, active: true },
  { label: 'Calendar', icon: Calendar },
  { label: 'Playbook', icon: LayoutTemplate },
  { label: 'Brand Kit', icon: Heart },
  { label: 'Directory', icon: Images },
  { label: 'Memes', icon: Smile },
  { label: 'Social', icon: Share2 },
  { label: 'Settings', icon: Settings },
  { label: 'Billing', icon: CreditCard },
]

const STARTER_PROMPTS = [
  'Generate a month of launch content',
  'Show me how ContentCard would position my brand',
  'Build a social plan from my website',
  'Write posts for every major platform',
]

function PublicDashboardSidebar() {
  return (
    <aside className="hidden w-[238px] flex-shrink-0 flex-col border-r border-fog bg-white lg:flex">
      <div className="border-b border-fog px-4 py-[18px]">
        <LogoFull size={26} />
      </div>

      <div className="border-b border-fog px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-ink/35">Workspace</p>
        <p className="mt-1 text-xs font-semibold text-ink">Guest test drive</p>
      </div>

      <nav className="flex-1 px-2 py-3">
        {NAV_ITEMS.map(({ label, icon: Icon, active }) => (
          <div
            key={label}
            className={`mb-0.5 flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-all ${
              active ? 'bg-brand-500/10 text-brand-600' : 'text-ink/50'
            }`}
          >
            <Icon size={17} className="flex-shrink-0" />
            <span>{label}</span>
          </div>
        ))}
      </nav>

      <div className="border-t border-fog px-3 py-3">
        <div className="rounded-2xl border border-fog bg-mist px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-700">Guest mode</p>
          <p className="mt-2 text-xs font-semibold text-ink">Try the first generation before signing up.</p>
          <p className="mt-1 text-[11px] leading-relaxed text-ink/45">
            When you’re impressed, create an account to save the workspace, edit posts, and schedule them.
          </p>
        </div>
      </div>
    </aside>
  )
}

function PromptChips({ onSelect }) {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {STARTER_PROMPTS.map((prompt) => (
        <button
          key={prompt}
          type="button"
          onClick={() => onSelect(prompt)}
          className="rounded-xl border border-fog bg-surface px-4 py-3 text-left text-sm text-ink/70 transition-all duration-200 hover:border-brand-300 hover:bg-mist hover:text-ink"
        >
          {prompt}
        </button>
      ))}
    </div>
  )
}

function SummaryPill({ label, value }) {
  return (
    <div className="rounded-2xl border border-fog bg-white px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-ink/35">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink">{value}</p>
    </div>
  )
}

function GuestPostCard({ post, onUnlock }) {
  return (
    <article className="rounded-[24px] border border-fog bg-white shadow-[0_12px_34px_rgba(15,23,42,0.05)] overflow-hidden">
      <div className="border-b border-fog px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${post.accent}`}>
            {post.platformLabel}
          </span>
          <span className="text-[11px] text-ink/35">{post.type}</span>
        </div>
        <span className="text-[11px] font-medium text-ink/40">{post.day} {buildGuestWorkspaceProfile({}).monthLabel.split(' ')[0]}</span>
      </div>

      <div className="p-4">
        <div className="rounded-[22px] border border-fog bg-gradient-to-br from-[#101828] via-[#17324f] to-[#215d5a] p-5 text-white">
          <p className="text-[11px] uppercase tracking-[0.22em] text-white/55">{post.angle}</p>
          <h3 className="mt-3 text-xl font-semibold tracking-tight">{post.title}</h3>
          <p className="mt-3 text-sm leading-relaxed text-white/82">{post.hook}</p>
        </div>

        <div className="mt-4">
          <p className="text-sm font-semibold text-ink">Suggested caption</p>
          <p className="mt-2 text-sm leading-relaxed text-ink/62">{post.caption}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {post.hashtags.map((tag) => (
              <span key={tag} className="rounded-full bg-mist px-2.5 py-1 text-[10px] font-semibold text-ink/55">
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-fog bg-mist px-3 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-ink/35">Best publish window</p>
            <p className="mt-1 text-sm font-semibold text-ink">{post.bestTime}</p>
          </div>
          <button
            type="button"
            onClick={onUnlock}
            className="inline-flex items-center gap-1.5 rounded-full border border-fog bg-white px-3 py-2 text-xs font-semibold text-ink hover:bg-mist"
          >
            <Lock size={12} /> {post.cta}
          </button>
        </div>
      </div>
    </article>
  )
}

export default function LandingPage() {
  const [authModal, setAuthModal] = useState({ open: false, mode: 'signup', email: '' })
  const [generating, setGenerating] = useState(false)
  const [guestForm, setGuestForm] = useState({
    brandName: '',
    website: '',
    goal: '',
  })
  const [guestRun, setGuestRun] = useState(null)

  const guestProfile = useMemo(
    () => buildGuestWorkspaceProfile(guestRun || guestForm),
    [guestForm, guestRun]
  )
  const guestPosts = useMemo(
    () => (guestRun ? buildGuestSamplePosts(guestRun) : []),
    [guestRun]
  )
  const planSummary = useMemo(
    () => buildGuestPlanSummary(guestRun || guestForm),
    [guestForm, guestRun]
  )

  const openAuth = (mode = 'signup', email = '', persistPreview = false) => {
    if (persistPreview) {
      persistGuestContext(guestRun || guestForm)
    }
    setAuthModal({
      open: true,
      mode,
      email: email && email.includes('@') ? email.trim() : '',
    })
  }

  const runGuestGeneration = () => {
    const brandName = guestForm.brandName.trim()
    const website = guestForm.website.trim()
    if (!brandName) return
    setGenerating(true)
    window.setTimeout(() => {
      setGuestRun({
        brandName,
        website,
        goal: guestForm.goal.trim(),
      })
      setGenerating(false)
    }, 1200)
  }

  const onSubmit = (event) => {
    event.preventDefault()
    runGuestGeneration()
  }

  const canGenerate = guestForm.brandName.trim().length > 1

  return (
    <>
      <Seo
        title="ContentCard | Try the app first"
        description="Go straight into ContentCard, enter your brand and website, and test a first social content generation before creating an account."
        path="/"
        image="/og-image.svg"
        keywords="try contentcard, guest social media content generator, ai social media dashboard, generate content from website"
        structuredData={[
          {
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'ContentCard',
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web',
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
            description: 'Guest-first social media content generator and scheduler.',
          },
        ]}
      />

      <div className="flex min-h-screen bg-mist overflow-hidden">
        <PublicDashboardSidebar />

        <main className="flex min-w-0 flex-1 flex-col bg-surface">
          <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-fog bg-surface/95 px-5 py-3.5 backdrop-blur-sm">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500">
                <Sparkles size={14} className="text-white" />
              </div>
              <div>
                <span className="text-sm font-semibold text-ink">ContentCard AI</span>
                <span className="ml-2 text-xs text-ink/40">Guest workspace</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => openAuth('login')}
                className="inline-flex items-center justify-center rounded-full bg-[#101828] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0b1320]"
              >
                Log in
              </button>
              <button
                type="button"
                onClick={() => openAuth('signup', '', true)}
                className="inline-flex items-center justify-center rounded-full border border-fog bg-white px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-mist"
              >
                Finish signup to save
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6">
              <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-[30px] border border-fog bg-gradient-to-br from-white via-[#fcfdfc] to-[#eef7f3] p-6 shadow-[0_16px_40px_rgba(15,23,42,0.06)] sm:p-8">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-brand-700">First-generation moment</p>
                  <h1 className="mt-3 max-w-[14ch] text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
                    Land in the app. Test your brand. Feel the value first.
                  </h1>
                  <p className="mt-4 max-w-3xl text-base leading-relaxed text-ink/58 sm:text-lg">
                    Enter a brand name and website, and ContentCard will sketch a cross-platform sample month immediately. If you like what you see, save it by creating an account. If you already have one, just log in and keep going.
                  </p>

                  <form onSubmit={onSubmit} className="mt-7 rounded-[28px] border border-fog bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)] sm:p-5">
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="block">
                        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-ink/35">Brand name</span>
                        <input
                          value={guestForm.brandName}
                          onChange={(event) => setGuestForm((current) => ({ ...current, brandName: event.target.value }))}
                          placeholder="Juicy Junction"
                          className="w-full rounded-2xl border border-fog bg-surface px-4 py-3 text-sm text-ink outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/30"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-ink/35">Website</span>
                        <div className="relative">
                          <Globe size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/30" />
                          <input
                            value={guestForm.website}
                            onChange={(event) => setGuestForm((current) => ({ ...current, website: event.target.value }))}
                            placeholder="juicyjunction.com"
                            className="w-full rounded-2xl border border-fog bg-surface py-3 pl-11 pr-4 text-sm text-ink outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/30"
                          />
                        </div>
                      </label>
                    </div>

                    <label className="mt-3 block">
                      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-ink/35">What should the content push this month?</span>
                      <textarea
                        rows={3}
                        value={guestForm.goal}
                        onChange={(event) => setGuestForm((current) => ({ ...current, goal: event.target.value }))}
                        placeholder="Launch a new product, increase awareness, get more website traffic, close more leads..."
                        className="w-full resize-none rounded-2xl border border-fog bg-surface px-4 py-3 text-sm text-ink outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/30"
                      />
                    </label>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-[11px] text-ink/35">
                        Returning user? Log in. New visitor? Test the product before you decide.
                      </p>
                      <button
                        type="submit"
                        disabled={!canGenerate || generating}
                        className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {generating ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                        {generating ? 'Generating sample month...' : 'Generate sample month'}
                      </button>
                    </div>
                  </form>
                </div>

                <div className="rounded-[30px] border border-fog bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.05)] sm:p-8">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-brand-700">Why this works</p>
                      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">A guest flow that sells the product by using it</h2>
                    </div>
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500/10">
                      <CheckCircle2 size={20} className="text-brand-600" />
                    </div>
                  </div>

                  <div className="mt-6 grid gap-3">
                    {planSummary.map((item) => (
                      <SummaryPill key={item.label} label={item.label} value={item.value} />
                    ))}
                  </div>

                  <div className="mt-6 rounded-[24px] border border-fog bg-mist p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-ink/35">Try these prompts</p>
                    <div className="mt-3">
                      <PromptChips onSelect={(prompt) => setGuestForm((current) => ({ ...current, goal: prompt }))} />
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-[30px] border border-fog bg-white shadow-[0_12px_34px_rgba(15,23,42,0.05)]">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-fog px-5 py-4">
                  <div>
                    <h2 className="text-xl font-semibold text-ink">Guest content workspace</h2>
                    <p className="mt-1 text-sm text-ink/40">
                      {guestRun
                        ? `Sample month generated for ${guestProfile.brandName}`
                        : 'Fill the form above to generate a brand-specific first month across your main channels.'}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex rounded-full border border-fog bg-mist px-3 py-1 text-xs font-semibold text-ink/60">No credit card</span>
                    <span className="inline-flex rounded-full border border-fog bg-mist px-3 py-1 text-xs font-semibold text-ink/60">Instagram + Facebook + X + LinkedIn</span>
                  </div>
                </div>

                {!guestRun ? (
                  <div className="px-5 py-10 sm:px-8">
                    <div className="mx-auto flex max-w-3xl flex-col items-center justify-center gap-6 text-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-brand-500 shadow-lg shadow-brand-500/15">
                        <Sparkles size={30} className="text-white" />
                      </div>
                      <div>
                        <h3 className="text-2xl font-semibold text-ink">This is where the first impression happens</h3>
                        <p className="mt-2 text-sm leading-relaxed text-ink/50">
                          Give ContentCard just enough context to understand your brand, and we’ll turn that into a believable starter month so you can judge the product on output, not promises.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="px-5 py-6 sm:px-8">
                    <div className="mb-6 grid gap-3 lg:grid-cols-4">
                      {planSummary.map((item) => (
                        <SummaryPill key={item.label} label={item.label} value={item.value} />
                      ))}
                    </div>

                    <div className="grid gap-5 lg:grid-cols-2">
                      {guestPosts.map((post) => (
                        <GuestPostCard key={post.id} post={post} onUnlock={() => openAuth('signup', '', true)} />
                      ))}
                    </div>

                    <div className="mt-6 rounded-[24px] border border-brand-400/25 bg-brand-500/8 px-5 py-5">
                      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-700">You’ve seen the value</p>
                          <h3 className="mt-1 text-xl font-semibold text-ink">Now save this workspace and keep building</h3>
                          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink/58">
                            Create an account to store this brand, edit the sample posts, generate a full calendar, connect social accounts, and schedule everything properly.
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openAuth('signup', '', true)}
                            className="inline-flex items-center gap-2 rounded-full bg-brand-500 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
                          >
                            Finish signup to save <ArrowRight size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => openAuth('login')}
                            className="inline-flex items-center gap-2 rounded-full border border-fog bg-white px-5 py-3 text-sm font-semibold text-ink transition-colors hover:bg-mist"
                          >
                            <LogIn size={15} /> I already have an account
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        </main>
      </div>

      <AuthEntryModal
        open={authModal.open}
        mode={authModal.mode}
        initialEmail={authModal.email}
        onClose={() => setAuthModal((current) => ({ ...current, open: false }))}
      />
    </>
  )
}
