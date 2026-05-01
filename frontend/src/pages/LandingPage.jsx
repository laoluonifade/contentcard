import { useNavigate } from 'react-router-dom'
import ShopifyIcon from '../components/ui/ShopifyIcon'

// Posthearts-style one-pager: floating sticker decorations, lowercase brand
// wordmark, oversized headline, single big CTA, tiny ToS/Privacy footer.
//
// Copy translation (Posthearts → ContentCard):
//   "ea" wordmark         → "contentcard"
//   "Create memories."    → "Turn products into posts."
//   "Continue with Google" → "Continue with Shopify"
//   "Posthearts"          → "ContentCard"

// ── Decorative stickers ───────────────────────────────────────────────────
// All inline SVG / styled divs so the page has zero asset dependencies.
// Pinned to floating positions just above the headline.

function StickerYellowCircle() {
  return (
    <div
      className="absolute select-none pointer-events-none"
      style={{
        top: '6%',
        left: '10%',
        transform: 'rotate(-12deg)',
      }}
    >
      <div
        className="rounded-full flex items-center justify-center"
        style={{
          width: 220,
          height: 220,
          background: '#FFC93C',
          boxShadow: '0 0 0 12px white, 0 24px 50px rgba(0,0,0,0.10)',
        }}
      >
        <span
          className="font-black text-center leading-none"
          style={{
            fontFamily: '"Bowlby One", "Arial Black", sans-serif',
            fontSize: 48,
            color: '#E76A1C',
            letterSpacing: 2,
            transform: 'translateY(2px)',
          }}
        >
          VIBES
        </span>
      </div>
    </div>
  )
}

function StickerPinkScript() {
  return (
    <div
      className="absolute select-none pointer-events-none"
      style={{
        top: '8%',
        left: '36%',
        transform: 'rotate(-6deg)',
      }}
    >
      <span
        className="font-black"
        style={{
          fontFamily: '"Caveat Brush", "Pacifico", cursive',
          fontSize: 220,
          color: '#FF5BB1',
          textShadow: '8px 0 0 white, -8px 0 0 white, 0 8px 0 white, 0 -8px 0 white, 6px 6px 0 white, -6px -6px 0 white, 6px -6px 0 white, -6px 6px 0 white, 0 30px 50px rgba(0,0,0,0.10)',
          lineHeight: 1,
          display: 'inline-block',
        }}
      >
        sell
      </span>
    </div>
  )
}

function StickerBlueStarburst() {
  return (
    <div
      className="absolute select-none pointer-events-none"
      style={{
        top: '4%',
        right: '14%',
        transform: 'rotate(8deg)',
      }}
    >
      <svg width="220" height="220" viewBox="0 0 100 100">
        <polygon
          points="50,2 58,32 88,28 65,50 88,72 58,68 50,98 42,68 12,72 35,50 12,28 42,32"
          fill="#5145E5"
          stroke="white"
          strokeWidth="6"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

function StickerOrangeWedge() {
  return (
    <div
      className="absolute select-none pointer-events-none"
      style={{
        top: '18%',
        right: '4%',
        transform: 'rotate(20deg)',
      }}
    >
      <svg width="200" height="160" viewBox="0 0 200 160">
        <polygon
          points="10,80 180,10 190,150 30,140"
          fill="#FF6B2C"
          stroke="white"
          strokeWidth="8"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

// ── Brand wordmark ────────────────────────────────────────────────────────
// Lowercase "contentcard" with a small green dot (mirrors the Posthearts "ea"
// lowercase mark — playful, friendly, quietly distinct).

function BrandWordmark() {
  return (
    <div className="flex items-center gap-2 mb-8 lg:mb-10">
      <div
        className="rounded-full"
        style={{
          width: 18,
          height: 18,
          background: '#168C5A',
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
      {/* Decorative stickers, floating */}
      <StickerYellowCircle />
      <StickerPinkScript />
      <StickerBlueStarburst />
      <StickerOrangeWedge />

      {/* Centered hero column */}
      <section className="relative z-10 flex flex-col items-center text-center px-6 pt-[36vh] pb-16">
        <BrandWordmark />

        <h1
          className="font-bold text-ink"
          style={{
            fontFamily: '"Caveat Brush", "Pacifico", "Inter", sans-serif',
            fontSize: 'clamp(64px, 11vw, 160px)',
            lineHeight: 1.0,
            letterSpacing: -1,
            maxWidth: 900,
            color: '#101820',
          }}
        >
          Turn products
          <br />
          into posts.
        </h1>

        <button
          type="button"
          onClick={() => navigate('/signup')}
          className="mt-12 inline-flex items-center justify-center gap-3 font-semibold transition-colors"
          style={{
            background: '#5145E5',
            color: '#FFFFFF',
            borderRadius: 999,
            paddingTop: 22,
            paddingBottom: 22,
            paddingLeft: 36,
            paddingRight: 36,
            fontSize: 20,
            minWidth: 360,
            boxShadow: '0 12px 30px rgba(81, 69, 229, 0.35)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#3F32C6')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#5145E5')}
        >
          <ShopifyIcon className="w-5 h-5" monochrome />
          Continue with Shopify
        </button>

        <p className="mt-6 text-sm text-ink/60 max-w-md leading-relaxed">
          By using ContentCard, you agree to our{' '}
          <a href="/terms" className="font-semibold text-ink hover:underline">Terms of Service</a>
          {' '}and{' '}
          <a href="/privacy" className="font-semibold text-ink hover:underline">Privacy Policy.</a>
        </p>
      </section>

      {/* Tiny existing-user link, bottom-right */}
      <div className="absolute bottom-6 right-6 text-xs text-ink/55">
        Already have an account?{' '}
        <a href="/login" className="font-semibold text-ink hover:underline">Sign in</a>
      </div>
    </main>
  )
}
