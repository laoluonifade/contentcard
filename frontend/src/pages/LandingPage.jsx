import { useNavigate } from 'react-router-dom'
import ShopifyIcon from '../components/ui/ShopifyIcon'
import { LogoFull } from '../components/ui/Logo'

// Ad-optimized landing page (ContentCard).
// Multi-section, conversion-focused, e-commerce-first.
//
// Structure:
//   1. Hero  — headline / subtext / primary CTA / trust strip / 3-slide carousel preview
//   2. Instant Clarity  — "From product → post in seconds" + 3-step flow
//   3. Output  — "What you get immediately" + 4 bullets
//   4. Differentiation  — "This is not Canva"
//   5. Use Case  — "Built for product businesses"
//   6. Speed  — "Your first posts in under 30 seconds"
//   7. Mid-page CTA
//   8. Objection handling  — "Why brands switch"
//   9. Final CTA

const BRAND_TEAL = '#10A37F'
const BRAND_TEAL_DARK = '#0d8f6e'
const CREAM = '#F7F4EE'
const INK = '#101820'

// ── Tiny re-usable bits ──────────────────────────────────────────────────

function PrimaryCTA({ label = 'Generate my first posts', onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center gap-3 font-semibold transition-colors"
      style={{
        background: BRAND_TEAL,
        color: '#FFFFFF',
        borderRadius: 999,
        paddingTop: 22,
        paddingBottom: 22,
        paddingLeft: 36,
        paddingRight: 36,
        fontSize: 20,
        minWidth: 360,
        boxShadow: '0 12px 30px rgba(16, 163, 127, 0.35)',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = BRAND_TEAL_DARK)}
      onMouseLeave={(e) => (e.currentTarget.style.background = BRAND_TEAL)}
    >
      <ShopifyIcon className="w-5 h-5" monochrome />
      {label}
    </button>
  )
}

// ── Hero carousel preview ────────────────────────────────────────────────
// Three Instagram-style cards fanned slightly so the eye reads them as a
// carousel of posts the AI generates from one product.

function ProductIllustration({ size = '50%' }) {
  // Simple skincare-bottle silhouette. Realistic enough to read as "product"
  // without committing to a specific category.
  return (
    <svg viewBox="0 0 100 140" width={size} aria-hidden="true">
      <rect x="38" y="6" width="24" height="14" rx="3" fill="#D7CEBE" />
      <rect x="30" y="22" width="40" height="100" rx="14" fill="#C8B49B" />
      <rect x="34" y="62" width="32" height="22" rx="3" fill="#FFFFFF" />
      <rect x="40" y="71" width="20" height="3" rx="1.5" fill="#C8B49B" />
      <rect x="42" y="78" width="16" height="2" rx="1" fill="#C8B49B" />
    </svg>
  )
}

function PostCardChrome({ children, label }) {
  // Square Instagram-feeling post card. The chrome at the top (avatar +
  // handle + ⋯) makes it look like a real post, not an abstract poster.
  return (
    <div
      style={{
        aspectRatio: '1 / 1',
        borderRadius: 18,
        overflow: 'hidden',
        boxShadow: '0 24px 60px rgba(16, 24, 32, 0.14), 0 2px 6px rgba(16, 24, 32, 0.05)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div className="flex items-center gap-2 px-3 py-2" style={{ background: '#FFFFFF', borderBottom: '1px solid rgba(16, 24, 32, 0.06)' }}>
        <div className="rounded-full" style={{ width: 24, height: 24, background: BRAND_TEAL }} />
        <span className="font-semibold text-ink text-[11px]">@yourbrand</span>
        <span className="ml-auto text-ink/35 text-[14px] leading-none">⋯</span>
      </div>
      <div className="flex-1 relative">{children}</div>
      <div className="flex items-center gap-3 px-3 py-2 text-ink/55 text-[11px]" style={{ background: '#FFFFFF' }}>
        <span>♡</span>
        <span>💬</span>
        <span>↗</span>
        <span className="ml-auto font-semibold text-ink/40 text-[9px] uppercase tracking-widest">{label}</span>
      </div>
    </div>
  )
}

function HeroCarouselPreview() {
  // Three cards, fanned slightly. The middle card is the dominant one;
  // side cards peek behind to suggest a carousel.
  return (
    <div className="relative w-full" style={{ minHeight: 340 }}>
      {/* Slide 3 — CTA, behind right */}
      <div
        className="absolute"
        style={{
          top: 18,
          right: '6%',
          width: 240,
          transform: 'rotate(8deg)',
          zIndex: 1,
        }}
      >
        <PostCardChrome label="3 / 3 · Shop now">
          <div
            className="w-full h-full flex flex-col items-center justify-center text-center px-5"
            style={{ background: BRAND_TEAL, color: '#FFFFFF' }}
          >
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">contentcard</span>
            <span
              className="font-extrabold mt-3"
              style={{ fontSize: 30, letterSpacing: -0.5, lineHeight: 1 }}
            >
              Glow up,<br />on tap.
            </span>
            <span
              className="mt-4 text-[11px] font-bold inline-flex items-center gap-1"
              style={{ background: '#FFFFFF', color: BRAND_TEAL, padding: '8px 14px', borderRadius: 999 }}
            >
              Shop now →
            </span>
          </div>
        </PostCardChrome>
      </div>

      {/* Slide 1 — Hook, behind left */}
      <div
        className="absolute"
        style={{
          top: 18,
          left: '6%',
          width: 240,
          transform: 'rotate(-8deg)',
          zIndex: 1,
        }}
      >
        <PostCardChrome label="1 / 3 · Hook">
          <div
            className="w-full h-full flex flex-col items-center justify-center text-center px-5"
            style={{ background: '#F4E5DC', color: INK }}
          >
            <span
              className="font-extrabold"
              style={{ fontSize: 28, letterSpacing: -0.5, lineHeight: 1 }}
            >
              Skin<br />feeling<br />off?
            </span>
          </div>
        </PostCardChrome>
      </div>

      {/* Slide 2 — Product benefit, in front and centred */}
      <div
        className="relative mx-auto"
        style={{
          width: 280,
          transform: 'rotate(-2deg)',
          zIndex: 2,
          marginTop: 0,
        }}
      >
        <PostCardChrome label="2 / 3 · Benefit">
          <div className="w-full h-full flex flex-col" style={{ background: '#FFFFFF' }}>
            <div className="px-4 pt-4">
              <span
                className="text-[9px] font-extrabold uppercase tracking-widest"
                style={{
                  background: BRAND_TEAL,
                  color: '#FFFFFF',
                  padding: '4px 8px',
                  borderRadius: 999,
                  letterSpacing: 1.2,
                }}
              >
                NEW
              </span>
              <div
                className="font-extrabold mt-2"
                style={{ fontSize: 22, letterSpacing: -0.5, lineHeight: 1.05, color: INK }}
              >
                Glow starts<br />here.
              </div>
            </div>
            <div className="flex-1 flex items-center justify-center" style={{ background: '#F4E5DC' }}>
              <ProductIllustration size="48%" />
            </div>
            <div
              className="flex items-center justify-between px-4 py-2"
              style={{ background: '#FFFFFF', borderTop: '1px solid rgba(16, 24, 32, 0.06)' }}
            >
              <span className="font-extrabold text-ink" style={{ fontSize: 16, letterSpacing: -0.3 }}>
                ₦12,000
              </span>
              <span
                className="text-[10px] font-bold inline-flex items-center gap-1"
                style={{
                  background: INK,
                  color: '#FFFFFF',
                  padding: '6px 12px',
                  borderRadius: 999,
                }}
              >
                Shop →
              </span>
            </div>
          </div>
        </PostCardChrome>
      </div>
    </div>
  )
}

// ── Section primitives ───────────────────────────────────────────────────

function SectionHeader({ eyebrow, title, sub }) {
  return (
    <div className="text-center max-w-3xl mx-auto mb-12">
      {eyebrow && (
        <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: BRAND_TEAL, letterSpacing: 2 }}>
          {eyebrow}
        </p>
      )}
      <h2
        className="font-bold text-ink"
        style={{
          fontFamily: '"Inter", system-ui, sans-serif',
          fontSize: 'clamp(36px, 5vw, 56px)',
          lineHeight: 1.05,
          letterSpacing: -1.2,
        }}
      >
        {title}
      </h2>
      {sub && <p className="mt-4 text-ink/60 text-base sm:text-lg leading-relaxed">{sub}</p>}
    </div>
  )
}

function StepCard({ n, title, body }) {
  return (
    <div className="flex flex-col items-start text-left p-6 rounded-2xl border border-ink/10 bg-white">
      <span className="text-[11px] font-bold uppercase tracking-widest text-ink/45 mb-3" style={{ letterSpacing: 2 }}>
        Step {n}
      </span>
      <h3 className="font-bold text-ink text-lg leading-tight">{title}</h3>
      <p className="mt-2 text-ink/60 text-sm leading-relaxed">{body}</p>
    </div>
  )
}

function BulletRow({ children }) {
  return (
    <div className="flex items-start gap-3">
      <span
        className="flex-shrink-0 inline-flex items-center justify-center"
        style={{ width: 24, height: 24, background: BRAND_TEAL, color: '#FFFFFF', borderRadius: 999, fontSize: 14, fontWeight: 800 }}
      >
        ✓
      </span>
      <span className="text-ink/80 text-base leading-relaxed">{children}</span>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const navigate = useNavigate()
  const goSignup = () => navigate('/signup')

  return (
    <main className="relative w-full overflow-x-hidden" style={{ background: CREAM, color: INK }}>
      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section className="relative px-6 pt-12 pb-16 lg:pt-20 lg:pb-24">
        <div className="max-w-6xl mx-auto">
          <LogoFull size={32} />

          <div className="mt-12 lg:mt-16 grid lg:grid-cols-2 gap-12 items-center">
            <div className="text-left">
              <h1
                className="font-bold text-ink"
                style={{
                  fontFamily: '"Inter", system-ui, sans-serif',
                  fontSize: 'clamp(48px, 7vw, 88px)',
                  lineHeight: 0.98,
                  letterSpacing: -2.5,
                }}
              >
                Turn your store into daily content that drives sales.
              </h1>
              <p className="mt-6 text-ink/65 text-lg sm:text-xl leading-relaxed max-w-xl">
                Connect your Shopify or Bumpa store. Get ready-to-post product content in seconds.
              </p>
              <div className="mt-10">
                <PrimaryCTA onClick={goSignup} />
              </div>
              <p className="mt-4 text-ink/55 text-xs sm:text-sm">
                No design skills needed · No blank pages · Works instantly
              </p>
            </div>

            <div className="lg:pl-6">
              <HeroCarouselPreview />
            </div>
          </div>
        </div>
      </section>

      {/* ── INSTANT CLARITY ──────────────────────────────────────────── */}
      <section className="px-6 py-20 lg:py-28">
        <div className="max-w-5xl mx-auto">
          <SectionHeader
            eyebrow="How it works"
            title="From product → post in seconds."
          />
          <div className="grid md:grid-cols-3 gap-4">
            <StepCard
              n={1}
              title="Connect your store"
              body="One-click Shopify or Bumpa connection. We pull your products instantly — names, photos, prices, descriptions."
            />
            <StepCard
              n={2}
              title="We generate your content"
              body="Posts, captions, carousels — designed around your actual products, your colours, your brand voice."
            />
            <StepCard
              n={3}
              title="You post and sell"
              body="Download or copy, paste into Instagram, Facebook, X, LinkedIn. Done."
            />
          </div>
        </div>
      </section>

      {/* ── OUTPUT (what you get) ────────────────────────────────────── */}
      <section className="px-6 py-20 lg:py-28" style={{ background: '#FFFFFF' }}>
        <div className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <SectionHeader
              eyebrow="What you get immediately"
              title="Real posts. Ready to ship."
            />
            <div className="space-y-4 max-w-md">
              <BulletRow>Scroll-stopping product posts</BulletRow>
              <BulletRow>High-converting captions</BulletRow>
              <BulletRow>Carousel designs that explain your product</BulletRow>
              <BulletRow>A full content calendar — every day, planned</BulletRow>
            </div>
          </div>
          <div>
            <HeroCarouselPreview />
          </div>
        </div>
      </section>

      {/* ── DIFFERENTIATION ─────────────────────────────────────────── */}
      <section className="px-6 py-20 lg:py-28">
        <div className="max-w-4xl mx-auto text-center">
          <SectionHeader
            eyebrow="Not another design tool"
            title="This is not Canva."
            sub="Canva makes you design from scratch. ContentCard turns your store into the content."
          />
          <div className="grid md:grid-cols-2 gap-4 mt-12 text-left">
            <div className="p-6 rounded-2xl border border-ink/10 bg-white">
              <p className="text-xs font-bold uppercase tracking-widest text-ink/45 mb-2" style={{ letterSpacing: 2 }}>Canva</p>
              <p className="text-ink/75 text-base leading-relaxed">
                Blank canvas. You pick a template, drag your product photo in, write the caption, design the layout, post it. Repeat tomorrow.
              </p>
            </div>
            <div className="p-6 rounded-2xl text-white" style={{ background: BRAND_TEAL }}>
              <p className="text-xs font-bold uppercase tracking-widest opacity-80 mb-2" style={{ letterSpacing: 2 }}>ContentCard</p>
              <p className="text-base leading-relaxed">
                Connect your store. We read your products and generate the post — design, caption, copy. You post.
              </p>
            </div>
          </div>
          <p className="mt-10 text-ink/65 text-base">
            No templates. No guesswork. No starting from zero.
          </p>
        </div>
      </section>

      {/* ── USE CASE SNAPSHOT ────────────────────────────────────────── */}
      <section className="px-6 py-20 lg:py-28" style={{ background: '#FFFFFF' }}>
        <div className="max-w-4xl mx-auto text-center">
          <SectionHeader
            eyebrow="Built for product businesses"
            title="If you have products, you have content."
          />
          <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
            {['Skincare', 'Fashion', 'Food', 'Beauty', 'Digital products', 'Accessories', 'Home goods'].map((c) => (
              <span
                key={c}
                className="text-sm font-semibold text-ink/75 px-4 py-2 rounded-full border border-ink/10 bg-white"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── SPEED / VALUE TRIGGER ───────────────────────────────────── */}
      <section className="px-6 py-20 lg:py-28">
        <div className="max-w-4xl mx-auto text-center">
          <SectionHeader
            eyebrow="Speed"
            title="Your first posts in under 30 seconds."
            sub="No onboarding stress. No learning curve. Just connect and generate."
          />
          <div className="mt-10 flex flex-col items-center">
            <PrimaryCTA label="Generate my product posts" onClick={goSignup} />
          </div>
        </div>
      </section>

      {/* ── OBJECTION HANDLING ──────────────────────────────────────── */}
      <section className="px-6 py-20 lg:py-28" style={{ background: '#FFFFFF' }}>
        <div className="max-w-4xl mx-auto">
          <SectionHeader
            eyebrow="Why brands switch"
            title="From scattered to scaled."
          />
          <div className="grid md:grid-cols-2 gap-4 mt-8">
            <div className="p-6 rounded-2xl border border-ink/10 bg-white">
              <p className="text-xs font-bold uppercase tracking-widest text-red-500 mb-2" style={{ letterSpacing: 2 }}>Stop</p>
              <ul className="space-y-2 text-ink/75 text-base">
                <li>· Spending hours designing</li>
                <li>· Guessing what works</li>
              </ul>
            </div>
            <div className="p-6 rounded-2xl border border-ink/10 bg-white">
              <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: BRAND_TEAL, letterSpacing: 2 }}>Start</p>
              <ul className="space-y-2 text-ink/75 text-base">
                <li>· Posting consistently</li>
                <li>· Driving product attention daily</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ───────────────────────────────────────────────── */}
      <section className="px-6 py-24 lg:py-32 text-center">
        <h2
          className="font-bold text-ink mx-auto"
          style={{
            fontFamily: '"Inter", system-ui, sans-serif',
            fontSize: 'clamp(36px, 5vw, 64px)',
            lineHeight: 1.05,
            letterSpacing: -1.5,
            maxWidth: 800,
          }}
        >
          Start turning your products into content that sells.
        </h2>
        <div className="mt-10 flex flex-col items-center">
          <PrimaryCTA onClick={goSignup} />
          <p className="mt-6 text-ink/55 text-sm">
            Already have an account?{' '}
            <a href="/login" className="font-semibold text-ink hover:underline">Sign in</a>
          </p>
        </div>
      </section>
    </main>
  )
}
