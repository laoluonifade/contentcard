import { useNavigate } from 'react-router-dom'
import ShopifyIcon from '../components/ui/ShopifyIcon'

// Landing page — Posthearts-style one-pager, ContentCard's positioning.
//
// Hero shows a product → post transformation: a raw product card on the
// left, a designed social post mockup on the right, with a subtle arrow
// between them. That visual immediately communicates the value prop:
// "your Shopify products become scroll-stopping social posts." No abstract
// stickers, no random shapes — the graphic IS the product.

// ── Product → Post transformation graphic ───────────────────────────────
// Two stacked cards: the left is a clean "product photo" mockup (the raw
// state), the right is the same product reinterpreted as a designed
// Instagram post (with brand colours, headline, price, CTA). They overlap
// slightly so the eye reads them as a transformation.

function RawProductCard() {
  return (
    <div
      className="absolute select-none pointer-events-none"
      style={{
        top: '7%',
        left: '12%',
        transform: 'rotate(-6deg)',
        width: 230,
      }}
    >
      <div
        className="relative bg-white"
        style={{
          aspectRatio: '4 / 5',
          borderRadius: 16,
          padding: 18,
          boxShadow: '0 24px 60px rgba(16, 24, 32, 0.10), 0 2px 6px rgba(16, 24, 32, 0.04)',
        }}
      >
        {/* Plain product silhouette — a soft beauty bottle shape */}
        <div className="w-full h-full flex items-center justify-center" style={{ background: '#F4F1EC', borderRadius: 10 }}>
          <svg viewBox="0 0 100 140" width="58%" aria-hidden="true">
            <rect x="38" y="6" width="24" height="14" rx="3" fill="#D7CEBE" />
            <rect x="30" y="22" width="40" height="100" rx="14" fill="#C8B49B" />
            <rect x="34" y="62" width="32" height="22" rx="3" fill="#FFFFFF" />
            <rect x="40" y="71" width="20" height="3" rx="1.5" fill="#C8B49B" />
            <rect x="42" y="78" width="16" height="2" rx="1" fill="#C8B49B" />
          </svg>
        </div>
        {/* Tag */}
        <div
          className="absolute -top-2 -left-2 text-[10px] font-bold uppercase tracking-widest text-ink/70 bg-white px-2 py-1 rounded"
          style={{ letterSpacing: 1.5, boxShadow: '0 2px 6px rgba(16, 24, 32, 0.08)' }}
        >
          your product
        </div>
      </div>
    </div>
  )
}

function DesignedPostCard() {
  return (
    <div
      className="absolute select-none pointer-events-none"
      style={{
        top: '5%',
        right: '12%',
        transform: 'rotate(4deg)',
        width: 270,
      }}
    >
      <div
        className="relative"
        style={{
          aspectRatio: '4 / 5',
          borderRadius: 16,
          background: '#10A37F',
          padding: 22,
          color: '#FFFFFF',
          boxShadow: '0 24px 60px rgba(16, 163, 127, 0.30), 0 2px 6px rgba(16, 163, 127, 0.20)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {/* Brand wordmark + offer badge */}
        <div className="flex items-start justify-between">
          <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">contentcard</span>
          <span
            className="text-[10px] font-extrabold uppercase tracking-widest"
            style={{
              background: '#FFFFFF',
              color: '#10A37F',
              padding: '4px 8px',
              borderRadius: 999,
              letterSpacing: 1.2,
            }}
          >
            20% off
          </span>
        </div>
        {/* Headline */}
        <div
          className="font-extrabold leading-tight"
          style={{
            fontFamily: '"Inter", system-ui, sans-serif',
            fontSize: 26,
            letterSpacing: -0.5,
          }}
        >
          Glow starts<br />here.
        </div>
        {/* Product image white card */}
        <div
          className="flex-1 flex items-center justify-center"
          style={{ background: '#FFFFFF', borderRadius: 10, padding: 8, marginTop: 4 }}
        >
          <svg viewBox="0 0 100 140" width="50%" aria-hidden="true">
            <rect x="38" y="6" width="24" height="14" rx="3" fill="#D7CEBE" />
            <rect x="30" y="22" width="40" height="100" rx="14" fill="#C8B49B" />
            <rect x="34" y="62" width="32" height="22" rx="3" fill="#FFFFFF" />
            <rect x="40" y="71" width="20" height="3" rx="1.5" fill="#C8B49B" />
            <rect x="42" y="78" width="16" height="2" rx="1" fill="#C8B49B" />
          </svg>
        </div>
        {/* Price + CTA row */}
        <div className="flex items-center justify-between gap-2 mt-1">
          <span
            className="font-extrabold"
            style={{ fontSize: 20, letterSpacing: -0.5 }}
          >
            ₦12,000
          </span>
          <span
            className="text-[10px] font-bold inline-flex items-center gap-1"
            style={{
              background: '#FFFFFF',
              color: '#10A37F',
              padding: '6px 12px',
              borderRadius: 999,
            }}
          >
            Shop now →
          </span>
        </div>
      </div>
      <div
        className="absolute -top-2 -right-2 text-[10px] font-bold uppercase tracking-widest bg-ink text-white px-2 py-1 rounded"
        style={{ letterSpacing: 1.5, boxShadow: '0 2px 6px rgba(16, 24, 32, 0.18)' }}
      >
        the post
      </div>
    </div>
  )
}

function TransformationArrow() {
  // Subtle hand-drawn arrow between the two cards. Hidden on small screens
  // because the two cards stack visually and don't need the connector.
  return (
    <div
      className="absolute hidden md:block select-none pointer-events-none"
      style={{
        top: '14%',
        left: '50%',
        transform: 'translateX(-50%)',
      }}
    >
      <svg width="160" height="60" viewBox="0 0 160 60" fill="none">
        <path
          d="M 8 30 C 50 6, 110 54, 152 30"
          stroke="#101820"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M 142 22 L 152 30 L 142 38"
          stroke="#101820"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </div>
  )
}

// ── Brand wordmark ────────────────────────────────────────────────────────

function BrandWordmark() {
  return (
    <div className="flex items-center gap-2 mb-8 lg:mb-10">
      <div
        className="rounded-full"
        style={{
          width: 18,
          height: 18,
          background: '#10A37F',
        }}
      />
      <span
        className="font-bold text-ink"
        style={{
          fontFamily: '"Inter", system-ui, sans-serif',
          fontSize: 24,
          letterSpacing: -0.5,
        }}
      >
        contentcard
      </span>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const navigate = useNavigate()
  return (
    <main
      className="relative w-full overflow-hidden"
      style={{
        minHeight: '100vh',
        background: '#F7F4EE',
      }}
    >
      {/* Hero graphic: product → post transformation */}
      <RawProductCard />
      <TransformationArrow />
      <DesignedPostCard />

      {/* Centered hero column */}
      <section className="relative z-10 flex flex-col items-center text-center px-6 pt-[36vh] pb-16">
        <BrandWordmark />

        <h1
          className="font-bold text-ink"
          style={{
            fontFamily: '"Inter", system-ui, sans-serif',
            fontSize: 'clamp(64px, 11vw, 160px)',
            lineHeight: 1.0,
            letterSpacing: -3,
            maxWidth: 900,
            color: '#101820',
          }}
        >
          Turn products
          <br />
          into posts.
        </h1>

        <p className="mt-6 text-ink/60 text-base sm:text-lg max-w-md leading-relaxed">
          Connect your Shopify store and your products start showing up as scroll-stopping social posts — every day.
        </p>

        <button
          type="button"
          onClick={() => navigate('/signup')}
          className="mt-10 inline-flex items-center justify-center gap-3 font-semibold transition-colors"
          style={{
            background: '#10A37F',
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
          onMouseEnter={(e) => (e.currentTarget.style.background = '#0d8f6e')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#10A37F')}
        >
          <ShopifyIcon className="w-5 h-5" monochrome />
          Connect your shop
        </button>
      </section>

      {/* Tiny existing-user link, bottom-right */}
      <div className="absolute bottom-6 right-6 text-xs text-ink/55">
        Already have an account?{' '}
        <a href="/login" className="font-semibold text-ink hover:underline">Sign in</a>
      </div>
    </main>
  )
}
