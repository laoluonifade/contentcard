import { useState } from 'react'
import { ArrowRight, Calendar, ChevronLeft, ChevronRight, MessageSquare, Plus, Sparkles, Wand2, Image as ImageIcon, LogIn } from 'lucide-react'
import { Link } from 'react-router-dom'
import Seo from '../components/seo/Seo'
import { LogoFull, LogoMark } from '../components/ui/Logo'
import AuthEntryModal from '../components/auth/AuthEntryModal'

const sidebarItems = [
  { label: 'Dashboard' },
  { label: 'AI' },
  { label: 'Calendar', active: true },
  { label: 'Playbook' },
  { label: 'Brand Kit' },
  { label: 'Directory' },
  { label: 'Social' },
]

const inspirationCards = [
  { title: 'Promo burst', subtitle: 'Launch a full month of June posts', tone: 'from-[#101828] via-[#19253f] to-[#24476b]' },
  { title: 'Caption polish', subtitle: 'Turn rough notes into on-brand copy', tone: 'from-[#173b2f] via-[#245f4c] to-[#3aa07b]' },
  { title: 'Visual refresh', subtitle: 'Create branded post graphics in seconds', tone: 'from-[#201c38] via-[#3a3562] to-[#5d5aa6]' },
  { title: 'Schedule week', subtitle: 'Queue content across Instagram and X', tone: 'from-[#5d2b17] via-[#8e4c2d] to-[#d48b56]' },
]

function LandingSidebar() {
  return (
    <aside className="hidden xl:flex w-[280px] flex-col border-r border-fog bg-white/86 backdrop-blur-xl">
      <div className="border-b border-fog px-6 py-6">
        <LogoFull size={28} />
      </div>

      <div className="border-b border-fog px-6 py-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ink/35">Workspace</p>
        <p className="mt-2 text-[15px] font-semibold text-ink">Your ContentCard Workspace</p>
      </div>

      <nav className="flex-1 px-3 py-5">
        {sidebarItems.map((item) => (
          <div
            key={item.label}
            className={`mb-1 flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-all ${
              item.active
                ? 'bg-emerald-50 text-brand-700'
                : 'text-ink/45'
            }`}
          >
            <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl border ${item.active ? 'border-emerald-200 bg-white' : 'border-fog bg-mist/70'}`}>
              {item.label === 'Calendar' ? <Calendar size={15} /> : <Sparkles size={15} />}
            </span>
            {item.label}
          </div>
        ))}
      </nav>

      <div className="border-t border-fog px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-500 text-sm font-semibold text-white">
            CC
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">Get tailored responses</p>
            <p className="text-xs text-ink/45">Log in to save chats, brands, and generated posts.</p>
          </div>
        </div>
      </div>
    </aside>
  )
}

function InspirationRail({ onOpenAuth }) {
  return (
    <section className="mt-10">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ink/35">Start with</p>
          <h3 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Generate content fast</h3>
        </div>
        <button type="button" onClick={() => onOpenAuth('signup')} className="hidden rounded-full border border-fog px-4 py-2 text-sm font-semibold text-ink/65 transition-colors hover:text-ink md:inline-flex">
          Open ContentCard <ArrowRight size={14} className="ml-1" />
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {inspirationCards.map((card) => (
          <button
            key={card.title}
            type="button"
            onClick={() => onOpenAuth('signup')}
            className={`group overflow-hidden rounded-[30px] border border-white/50 bg-gradient-to-br ${card.tone} p-5 text-left shadow-[0_20px_60px_rgba(15,23,42,0.12)] transition-transform duration-200 hover:-translate-y-1`}
          >
            <div className="flex h-full min-h-[200px] flex-col justify-between">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-white backdrop-blur-sm">
                <Wand2 size={18} />
              </div>
              <div>
                <p className="text-xl font-semibold tracking-tight text-white">{card.title}</p>
                <p className="mt-2 max-w-[18ch] text-sm leading-relaxed text-white/72">{card.subtitle}</p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
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

  const closeAuth = () => {
    setAuthModal((current) => ({ ...current, open: false }))
  }

  const handlePromptSubmit = (event) => {
    event.preventDefault()
    openAuth('signup', heroEmail)
  }

  return (
    <>
      <Seo
        title="ContentCard | Free Social Media Content Generator and Scheduler"
        description="ContentCard is a free social media content generator and scheduler with an app-like workflow for planning, generating, and queuing your next month of posts."
        path="/"
        image="/og-image.svg"
        keywords="free social media content generator, free social media scheduler, content calendar ai, contentcard"
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

      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(16,163,127,0.12),transparent_24%),radial-gradient(circle_at_top_right,rgba(148,163,184,0.12),transparent_22%),linear-gradient(180deg,#f7f7f5_0%,#fbfbfa_45%,#f5f7fa_100%)]">
        <header className="sticky top-0 z-40 border-b border-fog/80 bg-white/76 backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <LogoFull size={28} />
              <span className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-700 md:inline-flex">
                Free forever
              </span>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
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
          </div>
        </header>

        <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:py-8">
          <div className="overflow-hidden rounded-[34px] border border-white/80 bg-white/70 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <div className="flex min-h-[760px]">
              <LandingSidebar />

              <div className="flex-1">
                <div className="border-b border-fog/80 px-5 py-5 sm:px-8">
                  <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-brand-700">Free social media content generator and scheduler</p>
                      <h1 className="mt-3 max-w-[12ch] text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
                        Your content calendar, before sign-up friction.
                      </h1>
                      <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink/60 sm:text-lg">
                        Explore the product like an app. Then, when you are ready to generate, schedule, or publish, open a quick pop-up to sign up or log in.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex rounded-full border border-fog bg-white px-3 py-1 text-xs font-semibold text-ink/60">2,000 free generations</span>
                      <span className="inline-flex rounded-full border border-fog bg-white px-3 py-1 text-xs font-semibold text-ink/60">No credit card</span>
                      <span className="inline-flex rounded-full border border-fog bg-white px-3 py-1 text-xs font-semibold text-ink/60">Instagram, X, Facebook</span>
                    </div>
                  </div>

                  <form onSubmit={handlePromptSubmit} className="mt-7">
                    <div className="flex flex-col gap-3 rounded-[30px] border border-fog bg-white px-4 py-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)] sm:flex-row sm:items-center">
                      <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-mist text-ink/55">
                        <ImageIcon size={18} />
                      </div>
                      <input
                        value={heroEmail}
                        onChange={(event) => setHeroEmail(event.target.value)}
                        placeholder="Enter your email to start generating free social content"
                        className="min-w-0 flex-1 border-0 bg-transparent px-1 text-base text-ink outline-none placeholder:text-ink/35"
                      />
                      <button type="submit" className="inline-flex h-12 items-center justify-center rounded-full bg-brand-500 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-600">
                        Open free workspace <ArrowRight size={15} className="ml-1" />
                      </button>
                    </div>
                  </form>
                </div>

                <div className="grid gap-5 px-5 py-5 xl:grid-cols-[minmax(0,1fr)_360px] sm:px-8">
                  <section className="min-w-0">
                    <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <h2 className="text-2xl font-semibold tracking-tight text-ink">Content Calendar</h2>
                        <p className="mt-1 text-sm text-ink/42">ContentCard Workspace · 0 posts in June 2026</p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <div className="inline-flex items-center rounded-[22px] border border-fog bg-white px-3 py-2 text-sm font-semibold text-ink shadow-sm">
                          <button type="button" onClick={() => openAuth('signup', heroEmail)} className="rounded-full p-1 text-ink/35 transition-colors hover:text-ink">
                            <ChevronLeft size={18} />
                          </button>
                          <span className="px-4">Jun 2026</span>
                          <button type="button" onClick={() => openAuth('signup', heroEmail)} className="rounded-full p-1 text-ink/35 transition-colors hover:text-ink">
                            <ChevronRight size={18} />
                          </button>
                        </div>
                        <button type="button" onClick={() => openAuth('signup', heroEmail)} className="btn-primary rounded-[18px] px-5 py-3">
                          <Plus size={16} /> Generate
                        </button>
                      </div>
                    </div>

                    <div className="rounded-[34px] border border-dashed border-fog bg-white px-5 py-10 shadow-[0_10px_40px_rgba(15,23,42,0.04)] sm:px-8 sm:py-16">
                      <div className="mx-auto max-w-2xl text-center">
                        <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-[22px] bg-emerald-50 text-brand-700">
                          <Calendar size={28} />
                        </div>
                        <h3 className="mt-6 text-3xl font-semibold tracking-tight text-ink">No content for June 2026</h3>
                        <p className="mt-3 text-lg leading-relaxed text-ink/45">
                          Generate a full month of posts in under a minute, then review, polish, and schedule everything from one place.
                        </p>
                        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
                          <button type="button" onClick={() => openAuth('signup', heroEmail)} className="btn-primary rounded-[18px] px-6 py-3 text-base">
                            <Plus size={18} /> Generate content
                          </button>
                          <button type="button" onClick={() => openAuth('login', heroEmail)} className="btn-secondary rounded-[18px] px-6 py-3 text-base">
                            <LogIn size={17} /> Log in to continue
                          </button>
                        </div>
                      </div>
                    </div>

                    <InspirationRail onOpenAuth={openAuth} />
                  </section>

                  <aside className="min-w-0 rounded-[34px] border border-fog bg-white shadow-[0_14px_36px_rgba(15,23,42,0.05)]">
                    <div className="border-b border-fog px-5 py-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-mist text-ink/45">
                            <MessageSquare size={18} />
                          </span>
                          <div>
                            <p className="text-[28px] font-semibold leading-none tracking-tight text-ink">Your social media manager</p>
                            <p className="mt-2 text-sm leading-relaxed text-ink/42">
                              Ask questions or share updates before you generate your next month of posts.
                            </p>
                          </div>
                        </div>
                        <button type="button" onClick={() => openAuth('login', heroEmail)} className="rounded-xl border border-fog p-2 text-ink/35 transition-colors hover:text-ink">
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="px-5 py-8">
                      <div className="flex min-h-[320px] flex-col items-center justify-center rounded-[28px] border border-dashed border-fog bg-[#fbfbfa] px-5 text-center">
                        <div className="inline-flex h-14 w-14 items-center justify-center rounded-[18px] bg-emerald-50 text-brand-700">
                          <Sparkles size={24} />
                        </div>
                        <p className="mt-5 text-base font-medium text-ink/62">Chat to brief the AI, then say “generate” when ready.</p>
                        <p className="mt-2 max-w-[22ch] text-sm leading-relaxed text-ink/38">
                          The assistant will help shape captions, themes, and post timing before anything goes live.
                        </p>
                      </div>

                      <div className="mt-4 flex items-center gap-2 rounded-[18px] border border-fog bg-white px-3 py-3 text-sm text-ink/35">
                        <button type="button" onClick={() => openAuth('signup', heroEmail)} className="inline-flex rounded-full border border-fog px-3 py-2 font-semibold text-ink/55">
                          + Attach
                        </button>
                        <span>screenshot or recording</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => openAuth('signup', heroEmail)}
                        className="mt-4 flex w-full items-center gap-2 rounded-[18px] border border-fog bg-white px-4 py-4 text-left text-sm text-ink/35"
                      >
                        <span className="flex-1">Chat or say “generate my posts”...</span>
                        <ArrowRight size={16} />
                      </button>

                      <button
                        type="button"
                        onClick={() => openAuth('signup', heroEmail)}
                        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[18px] bg-[#101828] px-5 py-4 text-base font-semibold text-white transition-colors hover:bg-[#0b1320]"
                      >
                        <Sparkles size={17} /> Generate posts
                      </button>
                    </div>
                  </aside>
                </div>
              </div>
            </div>
          </div>

          <footer className="px-2 py-10">
            <div className="flex flex-col gap-4 rounded-[30px] border border-white/70 bg-white/65 px-6 py-5 text-sm text-ink/45 shadow-[0_10px_30px_rgba(15,23,42,0.05)] sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <LogoMark size={24} />
                <span>Free social media content generation and scheduling, designed to feel like the real app from the first click.</span>
              </div>
              <div className="flex flex-wrap gap-4">
                <Link to="/features" className="transition-colors hover:text-ink">Features</Link>
                <Link to="/pricing" className="transition-colors hover:text-ink">Pricing</Link>
                <Link to="/about" className="transition-colors hover:text-ink">About</Link>
              </div>
            </div>
          </footer>
        </main>
      </div>

      <AuthEntryModal
        open={authModal.open}
        mode={authModal.mode}
        initialEmail={authModal.email}
        onClose={closeAuth}
      />
    </>
  )
}
