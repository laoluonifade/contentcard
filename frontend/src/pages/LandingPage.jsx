import { useState } from 'react'
import { ArrowRight, Calendar, CreditCard, Heart, Images, LayoutDashboard, LayoutTemplate, LogIn, MessageSquare, Send, Settings, Share2, Smile, Sparkles, Wand2 } from 'lucide-react'
import Seo from '../components/seo/Seo'
import { LogoFull } from '../components/ui/Logo'
import AuthEntryModal from '../components/auth/AuthEntryModal'

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

const SUGGESTIONS = [
  'Generate my Instagram posts for this month',
  "What should I post this week for my brand?",
  'Create a promo campaign for a product launch',
  'Plan content around upcoming holidays',
]

function PublicDashboardSidebar() {
  return (
    <aside className="hidden w-[230px] flex-shrink-0 flex-col border-r border-fog bg-white lg:flex">
      <div className="border-b border-fog px-4 py-[18px]">
        <LogoFull size={26} />
      </div>

      <div className="border-b border-fog px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-ink/35">Workspace</p>
        <p className="mt-1 text-xs font-semibold text-ink">Your ContentCard Workspace</p>
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
        <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-ink/40 transition-all">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-500 text-[10px] font-bold text-white">
            CC
          </div>
          <div className="min-w-0 text-left">
            <div className="truncate text-xs font-semibold text-ink">Content creator</div>
            <div className="truncate text-[10px] text-ink/40">Log in to save your chat</div>
          </div>
        </button>
      </div>
    </aside>
  )
}

function SuggestionGrid({ onOpenAuth }) {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {SUGGESTIONS.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          onClick={() => onOpenAuth('signup')}
          className="rounded-xl border border-fog bg-surface px-4 py-3 text-left text-sm text-ink/70 transition-all duration-200 hover:border-brand-300 hover:bg-mist hover:text-ink"
        >
          {suggestion}
        </button>
      ))}
    </div>
  )
}

export default function LandingPage() {
  const [authModal, setAuthModal] = useState({ open: false, mode: 'signup', email: '' })
  const [heroEmail, setHeroEmail] = useState('')

  const openAuth = (mode = 'signup', email = '') => {
    setAuthModal({
      open: true,
      mode,
      email: email && email.includes('@') ? email.trim() : '',
    })
  }

  return (
    <>
      <Seo
        title="ContentCard | Free Social Media Content Generator and Scheduler"
        description="Open ContentCard and land straight inside an AI-first dashboard for generating and scheduling social media content."
        path="/"
        image="/og-image.svg"
        keywords="free social media content generator, ai social media dashboard, free social media scheduler, contentcard"
        structuredData={[
          {
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'ContentCard',
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web',
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
            description: 'Free social media content generator and scheduler.',
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
                <span className="ml-2 text-xs text-ink/40">Public dashboard preview</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => openAuth('login', heroEmail)}
                className="inline-flex items-center justify-center rounded-full bg-[#101828] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0b1320]"
              >
                Log in
              </button>
              <button
                type="button"
                onClick={() => openAuth('signup', heroEmail)}
                className="inline-flex items-center justify-center rounded-full border border-fog bg-white px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-mist"
              >
                Sign up for free
              </button>
            </div>
          </header>

          <div className="flex flex-1 flex-col">
            <div className="border-b border-fog bg-gradient-to-b from-white via-[#fcfdfc] to-[#f6faf8] px-5 py-6 sm:px-8">
              <div className="max-w-4xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-brand-700">Dashboard on landing</p>
                <h1 className="mt-2 text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
                  Open the product, not a marketing page.
                </h1>
                <p className="mt-4 max-w-3xl text-base leading-relaxed text-ink/58 sm:text-lg">
                  Just like ChatGPT, ContentCard opens on the product surface first. The AI workspace is already selected, so visitors can see exactly how they would start generating.
                </p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6">
                <section className="rounded-[28px] border border-fog bg-white shadow-[0_12px_34px_rgba(15,23,42,0.05)]">
                  <div className="flex items-center justify-between gap-4 border-b border-fog px-5 py-4">
                    <div>
                      <h2 className="text-xl font-semibold text-ink">ContentCard AI</h2>
                      <p className="mt-1 text-sm text-ink/40">Ask anything or generate content instantly</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="inline-flex rounded-full border border-fog bg-mist px-3 py-1 text-xs font-semibold text-ink/60">No credit card</span>
                    </div>
                  </div>

                  <div className="px-5 py-8 sm:px-8">
                    <div className="flex flex-col items-center justify-center gap-8 px-4 pb-8 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500 shadow-lg shadow-brand-500/20">
                          <Wand2 size={26} className="text-white" />
                        </div>
                        <div>
                          <h3 className="text-2xl font-semibold text-ink">Start generating immediately</h3>
                          <p className="mt-1 text-sm text-ink/50">The default tab is AI, so the product opens exactly where generation starts.</p>
                        </div>
                      </div>

                      <div className="w-full max-w-3xl">
                        <SuggestionGrid onOpenAuth={openAuth} />
                      </div>
                    </div>
                  </div>
                </section>

                <section className="rounded-[28px] border border-fog bg-white px-4 py-4 shadow-[0_12px_34px_rgba(15,23,42,0.05)] sm:px-6">
                  <div className="flex items-end gap-3 rounded-2xl border border-fog bg-mist px-4 py-3 transition-all focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-300/30">
                    <textarea
                      rows={1}
                      value={heroEmail}
                      onChange={(event) => setHeroEmail(event.target.value)}
                      placeholder="Ask anything or say 'generate my posts for this month'…"
                      className="min-h-[22px] flex-1 resize-none bg-transparent text-sm leading-relaxed text-ink placeholder:text-ink/40 focus:outline-none"
                    />

                    <button
                      type="button"
                      onClick={() => openAuth('signup', heroEmail)}
                      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm transition-all duration-200 hover:bg-slate-800"
                    >
                      <Send size={14} />
                    </button>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-[11px] text-ink/30">
                      <kbd className="font-mono">Enter</kbd> to send · <kbd className="font-mono">Shift+Enter</kbd> for new line
                    </p>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openAuth('signup', heroEmail)}
                        className="btn-primary rounded-[16px] px-5 py-3"
                      >
                        <Sparkles size={16} /> Start free
                      </button>
                      <button
                        type="button"
                        onClick={() => openAuth('login', heroEmail)}
                        className="btn-secondary rounded-[16px] px-5 py-3"
                      >
                        <LogIn size={16} /> Log in
                      </button>
                    </div>
                  </div>
                </section>

                <section className="grid gap-4 lg:grid-cols-3">
                  <div className="rounded-[24px] border border-fog bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-700">AI first</p>
                    <p className="mt-3 text-lg font-semibold text-ink">Visitors land where content generation actually happens.</p>
                  </div>
                  <div className="rounded-[24px] border border-fog bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-700">Product-led</p>
                    <p className="mt-3 text-lg font-semibold text-ink">The root URL behaves like a dashboard shell instead of a classic marketing homepage.</p>
                  </div>
                  <div className="rounded-[24px] border border-fog bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-700">Auth gated</p>
                    <p className="mt-3 text-lg font-semibold text-ink">Real actions still funnel into the popup sign-up or login flow you asked for.</p>
                  </div>
                </section>
              </div>
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
