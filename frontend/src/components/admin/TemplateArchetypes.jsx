/**
 * Premium template archetypes — 10 reusable composition patterns.
 *
 * VD01–VD10 from PRD-content-template-system.md §20.2. Each archetype
 * is a deliberate composition: typography pairing, asymmetric grid,
 * SVG accents, brand-token color, restrained whitespace. Same archetype
 * renders any content_type — copy + photo change, structure stays.
 *
 *   VD01  Editorial Hero      single
 *   VD02  Offer Card          single
 *   VD03  Proof Snapshot      single
 *   VD04  People-in-Context   single
 *   VD05  Product/Service     single
 *   VD06  Hook→Context→Proof→CTA      carousel
 *   VD07  Problem→Steps→Outcome→CTA   carousel
 *   VD08  Myth→Fact→Proof→CTA         carousel
 *   VD09  Before→Shift→After→CTA      carousel
 *   VD10  Checklist→Action→CTA        carousel
 *
 * Replaces the rushed 21 intent-family layouts that shipped in
 * TemplateLayouts.jsx. Dispatch is by VD code (stored in
 * art_direction_variant on each row); content_type influences
 * art-direction parameters but not composition.
 *
 * Fonts (loaded in index.html):
 *   - Playfair Display (italic display serif) — VD01, VD08
 *   - Bricolage Grotesque (display sans)      — VD02, VD06, VD07, VD09, VD10
 *   - Manrope (geometric sans)                — VD03 (numbers), VD05
 *   - Cormorant Garamond (humanist serif)     — VD04
 *   - Inter (utility sans, body copy)         — all
 */

import React from 'react'

// ─── Font helpers ────────────────────────────────────────────────────

const FONT = {
  serif:        '"Playfair Display", Georgia, serif',
  serifAlt:     '"Cormorant Garamond", Georgia, serif',
  display:      '"Bricolage Grotesque", "Inter Tight", system-ui, sans-serif',
  geometric:    '"Manrope", system-ui, sans-serif',
  body:         'Inter, system-ui, sans-serif',
  mono:         '"JetBrains Mono", ui-monospace, monospace',
}

// ─── Color helpers ────────────────────────────────────────────────────

function tokens(brandTokens) {
  return {
    primary: brandTokens?.primary || '#FFC72C',
    secondary: brandTokens?.secondary || '#DA291C',
    dark: brandTokens?.neutral_dark || '#0E0E10',
    light: brandTokens?.neutral_light || '#FAFAF7',
    cream: '#F4F1EB',
  }
}

function textOnColor(hex) {
  if (!hex) return '#FFFFFF'
  const s = hex.replace('#', '')
  const full = s.length === 3 ? s.split('').map(c => c + c).join('') : s
  if (full.length !== 6) return '#FFFFFF'
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  const yiq = (r * 299 + g * 587 + b * 114) / 1000
  return yiq >= 128 ? '#0E0E10' : '#FAFAF7'
}

// ─── Reusable canvas + lockup ────────────────────────────────────────

function Canvas({ children, style, className = '' }) {
  return (
    <div
      className={`aspect-square w-full rounded-xl overflow-hidden relative isolate ${className}`}
      style={{ fontFamily: FONT.body, ...style }}
    >
      {children}
    </div>
  )
}

function GrainOverlay() {
  // SVG fractal-noise mask gives a film-grain feel that elevates flat
  // brand-color surfaces without dominating them.
  return (
    <svg
      className="absolute inset-0 w-full h-full opacity-[0.06] pointer-events-none mix-blend-overlay"
      aria-hidden="true"
    >
      <filter id="grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" />
        <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#grain)" />
    </svg>
  )
}

function LogoLockup({ slots, color }) {
  if (!slots?.brand_name) return null
  return (
    <div
      className="absolute bottom-5 right-5 text-[10px] font-bold tracking-[0.18em] uppercase"
      style={{ color: color || 'rgba(250,250,247,0.85)', fontFamily: FONT.body }}
    >
      {slots.brand_name}
    </div>
  )
}

function ThinRule({ color, width = '24%', x = 24, y = 88 }) {
  return (
    <div
      className="absolute"
      style={{ left: x, top: y, height: 2, width, background: color, borderRadius: 1 }}
    />
  )
}

// ─── VD01 — Editorial Hero ───────────────────────────────────────────

function VD01_EditorialHero({ slots, brandTokens }) {
  const t = tokens(brandTokens)
  return (
    <Canvas style={{ background: t.cream }}>
      {/* Top: badge + thin accent rule */}
      {slots.badge && (
        <div className="absolute top-5 left-5 flex items-center gap-2">
          <span
            className="text-[9px] font-bold tracking-[0.22em] uppercase"
            style={{ color: t.dark, fontFamily: FONT.body }}
          >
            {slots.badge}
          </span>
          <span className="block h-px w-12" style={{ background: t.dark }} />
        </div>
      )}
      {/* Italic display serif headline */}
      {slots.headline && (
        <div
          className="absolute"
          style={{
            top: '15%', left: '5.5%', right: '5.5%',
            fontFamily: FONT.serif, fontWeight: 700, fontStyle: 'italic',
            fontSize: '54px', lineHeight: 1.04, color: t.dark,
            letterSpacing: '-0.01em',
          }}
        >
          {slots.headline}
        </div>
      )}
      {/* Photo strip with vignette */}
      <div
        className="absolute inset-x-0 bottom-0 h-[40%]"
        style={{
          background: `radial-gradient(120% 80% at 50% 100%, ${t.secondary} 0%, ${t.dark} 75%)`,
        }}
      >
        <div className="absolute inset-0" style={{
          background: `linear-gradient(180deg, ${t.cream}10 0%, transparent 30%)`,
        }} />
      </div>
      {slots.subhead && (
        <div
          className="absolute"
          style={{
            bottom: '14%', left: '5.5%', right: '20%',
            fontFamily: FONT.body, fontSize: '13px', lineHeight: 1.5,
            color: 'rgba(250,250,247,0.92)', fontWeight: 500,
          }}
        >
          {slots.subhead}
        </div>
      )}
      {slots.cta && (
        <span
          className="absolute"
          style={{
            bottom: '5%', left: '5.5%',
            fontFamily: FONT.body, fontSize: '11px', fontWeight: 700,
            color: t.primary, letterSpacing: '0.05em',
            borderBottom: `1px solid ${t.primary}`,
            paddingBottom: 2,
          }}
        >
          {slots.cta} →
        </span>
      )}
      <LogoLockup slots={slots} />
    </Canvas>
  )
}

// ─── VD02 — Offer Card ────────────────────────────────────────────────

function VD02_OfferCard({ slots, brandTokens }) {
  const t = tokens(brandTokens)
  const onPrimary = textOnColor(t.primary)
  return (
    <Canvas style={{ background: t.primary }}>
      <GrainOverlay />
      {slots.badge && (
        <div
          className="absolute"
          style={{
            top: '8%', right: '6%',
            transform: 'rotate(8deg)',
          }}
        >
          <span
            className="inline-block px-3 py-1.5 rounded-md text-[10px] font-extrabold uppercase"
            style={{
              background: t.dark, color: t.light,
              letterSpacing: '0.18em', fontFamily: FONT.body,
            }}
          >
            {slots.badge}
          </span>
        </div>
      )}
      {/* Massive type-as-shape headline */}
      {slots.headline && (
        <div
          className="absolute"
          style={{
            top: '32%', left: '5%', right: '5%',
            fontFamily: FONT.display, fontWeight: 800,
            fontSize: '64px', lineHeight: 0.92, letterSpacing: '-0.025em',
            color: onPrimary,
          }}
        >
          {slots.headline}
        </div>
      )}
      {slots.subhead && (
        <div
          className="absolute"
          style={{
            bottom: '20%', left: '5%', right: '5%',
            fontFamily: FONT.body, fontSize: '13px', lineHeight: 1.5,
            color: onPrimary, opacity: 0.78,
          }}
        >
          {slots.subhead}
        </div>
      )}
      {slots.cta && (
        <span
          className="absolute inline-flex items-center gap-1.5 px-4 py-2 rounded-full"
          style={{
            bottom: '6%', left: '5%',
            background: t.dark, color: t.light,
            fontFamily: FONT.body, fontSize: '12px', fontWeight: 700,
          }}
        >
          {slots.cta}
          <span style={{ fontSize: '14px' }}>→</span>
        </span>
      )}
      <LogoLockup slots={slots} color={`${onPrimary}cc`} />
    </Canvas>
  )
}

// ─── VD03 — Proof Snapshot ───────────────────────────────────────────

function VD03_ProofSnapshot({ slots, brandTokens }) {
  const t = tokens(brandTokens)
  return (
    <Canvas style={{ background: t.light }}>
      {slots.badge && (
        <div className="absolute top-5 left-5">
          <span
            className="text-[9px] font-bold tracking-[0.22em] uppercase"
            style={{ color: t.secondary, fontFamily: FONT.body }}
          >
            {slots.badge}
          </span>
        </div>
      )}
      {/* Big proof metric */}
      {slots.proof_metric && (
        <div
          className="absolute"
          style={{
            top: '24%', left: '5%', right: '5%',
            fontFamily: FONT.geometric, fontWeight: 900,
            fontSize: '110px', lineHeight: 0.88, letterSpacing: '-0.04em',
            color: t.dark,
          }}
        >
          {slots.proof_metric}
        </div>
      )}
      {/* Headline */}
      {slots.headline && (
        <div
          className="absolute"
          style={{
            top: '60%', left: '5%', right: '15%',
            fontFamily: FONT.body, fontSize: '17px', lineHeight: 1.35,
            color: t.dark, fontWeight: 600,
          }}
        >
          {slots.headline}
        </div>
      )}
      <ThinRule color={t.primary} width="36%" x="5%" y="80%" />
      {slots.proof_attribution && (
        <div
          className="absolute"
          style={{
            top: '83%', left: '5%', right: '5%',
            fontFamily: FONT.body, fontSize: '11px',
            color: t.dark, opacity: 0.55, fontWeight: 500,
          }}
        >
          — {slots.proof_attribution}
        </div>
      )}
      <LogoLockup slots={slots} color={`${t.dark}cc`} />
    </Canvas>
  )
}

// ─── VD04 — People-in-Context ────────────────────────────────────────

function VD04_PeopleInContext({ slots, brandTokens }) {
  const t = tokens(brandTokens)
  return (
    <Canvas style={{ background: t.cream }}>
      {/* Photo dominates left 55% */}
      <div
        className="absolute top-0 bottom-0 left-0"
        style={{
          width: '55%',
          background: `linear-gradient(160deg, ${t.dark} 0%, ${t.secondary} 80%)`,
        }}
      />
      {/* Diagonal accent shape connecting halves */}
      <svg
        className="absolute"
        style={{ left: '50%', top: '0', height: '100%', width: '12%' }}
        viewBox="0 0 100 1000" preserveAspectRatio="none"
      >
        <polygon points="0,0 100,1000 0,1000" fill={t.primary} opacity="0.85" />
      </svg>
      {/* Vertical type-as-spine on left edge */}
      {slots.badge && (
        <div
          className="absolute"
          style={{
            top: '50%', left: 22, transformOrigin: 'left top',
            transform: 'rotate(-90deg) translate(-50%, 0)',
            color: t.light, fontFamily: FONT.body,
            fontSize: '10px', fontWeight: 700,
            letterSpacing: '0.32em', textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}
        >
          {slots.badge}
        </div>
      )}
      {/* Quote-style headline right column */}
      {slots.headline && (
        <div
          className="absolute"
          style={{
            top: '22%', left: '60%', right: '5%',
            fontFamily: FONT.serifAlt, fontWeight: 700, fontStyle: 'italic',
            fontSize: '34px', lineHeight: 1.1, color: t.dark,
            letterSpacing: '-0.005em',
          }}
        >
          “{slots.headline}”
        </div>
      )}
      {slots.proof_attribution && (
        <div
          className="absolute"
          style={{
            top: '64%', left: '60%', right: '5%',
            fontFamily: FONT.body, fontSize: '11px', fontWeight: 600,
            color: t.dark, opacity: 0.7,
          }}
        >
          — {slots.proof_attribution}
        </div>
      )}
      {slots.cta && (
        <span
          className="absolute"
          style={{
            bottom: '6%', left: '60%',
            fontFamily: FONT.body, fontSize: '11px', fontWeight: 700,
            color: t.dark, letterSpacing: '0.05em',
            borderBottom: `2px solid ${t.primary}`,
            paddingBottom: 2,
          }}
        >
          {slots.cta} ↗
        </span>
      )}
      <LogoLockup slots={slots} color={`${t.dark}cc`} />
    </Canvas>
  )
}

// ─── VD05 — Product / Service Focus ──────────────────────────────────

function VD05_ProductFocus({ slots, brandTokens }) {
  const t = tokens(brandTokens)
  return (
    <Canvas style={{ background: t.dark }}>
      {/* Top brand-color stripe with badge */}
      <div
        className="absolute top-0 inset-x-0 h-[7%]"
        style={{ background: t.primary }}
      >
        {slots.badge && (
          <div className="absolute inset-y-0 left-5 flex items-center">
            <span
              className="text-[9px] font-extrabold uppercase tracking-[0.22em]"
              style={{ color: textOnColor(t.primary), fontFamily: FONT.body }}
            >
              {slots.badge}
            </span>
          </div>
        )}
      </div>
      {/* Center: simulated product hero (radial glow standin) */}
      <div
        className="absolute"
        style={{
          top: '20%', left: '20%', right: '20%', height: '40%',
          background: `radial-gradient(circle at 50% 45%, ${t.primary}66 0%, transparent 60%)`,
          filter: 'blur(6px)',
        }}
      />
      <div
        className="absolute"
        style={{
          top: '24%', left: '28%', right: '28%', height: '32%',
          background: t.secondary, borderRadius: '12px', opacity: 0.85,
          boxShadow: `0 20px 40px -10px ${t.dark}`,
        }}
      />
      {/* Bottom 35% scrim with content */}
      <div
        className="absolute inset-x-0 bottom-0 h-[40%]"
        style={{
          background: `linear-gradient(180deg, transparent 0%, ${t.dark}f5 50%, ${t.dark} 100%)`,
        }}
      />
      {slots.headline && (
        <div
          className="absolute"
          style={{
            bottom: '20%', left: '5%', right: '5%',
            fontFamily: FONT.geometric, fontWeight: 800,
            fontSize: '32px', lineHeight: 1.05, color: t.light,
            letterSpacing: '-0.01em',
          }}
        >
          {slots.headline}
        </div>
      )}
      {slots.cta && (
        <span
          className="absolute inline-block px-4 py-2 rounded-full"
          style={{
            bottom: '6%', left: '5%',
            background: t.primary, color: textOnColor(t.primary),
            fontFamily: FONT.body, fontSize: '12px', fontWeight: 800,
          }}
        >
          {slots.cta}
        </span>
      )}
      <LogoLockup slots={slots} color="#fafafaaa" />
    </Canvas>
  )
}

// ─── VD06 — Hook → Context → Proof → CTA (carousel cover) ────────────

function VD06_HookContextProofCTA({ slots, brandTokens }) {
  const t = tokens(brandTokens)
  return (
    <Canvas style={{ background: t.dark }}>
      {/* Big number marker */}
      <div
        className="absolute"
        style={{
          top: '6%', left: '5%',
          fontFamily: FONT.geometric, fontWeight: 900,
          fontSize: '54px', lineHeight: 1, color: t.primary,
          letterSpacing: '-0.04em',
        }}
      >
        01.
      </div>
      <div
        className="absolute"
        style={{
          top: '12%', right: '5%',
          fontFamily: FONT.body, fontSize: '9px', fontWeight: 700,
          color: t.light, opacity: 0.55, letterSpacing: '0.22em',
        }}
      >
        {slots.badge || 'A 4-PART STORY'}
      </div>
      {/* Headline takes top half */}
      {slots.headline && (
        <div
          className="absolute"
          style={{
            top: '24%', left: '5%', right: '5%',
            fontFamily: FONT.display, fontWeight: 800,
            fontSize: '46px', lineHeight: 0.98, color: t.light,
            letterSpacing: '-0.02em',
          }}
        >
          {slots.headline}
        </div>
      )}
      {/* Photo-strip in bottom half */}
      <div
        className="absolute inset-x-0 bottom-0 h-[42%]"
        style={{
          background: `linear-gradient(135deg, ${t.secondary} 0%, ${t.primary}55 100%)`,
        }}
      />
      <div
        className="absolute inset-x-0"
        style={{
          bottom: '42%', height: 1, background: `${t.primary}55`,
        }}
      />
      {slots.subhead && (
        <div
          className="absolute"
          style={{
            bottom: '12%', left: '5%', right: '5%',
            fontFamily: FONT.body, fontSize: '13px', lineHeight: 1.4,
            color: t.light, opacity: 0.92, fontWeight: 500,
          }}
        >
          {slots.subhead}
        </div>
      )}
      <div
        className="absolute"
        style={{
          bottom: '5%', left: '5%',
          fontFamily: FONT.body, fontSize: '10px', fontWeight: 700,
          color: t.light, opacity: 0.75, letterSpacing: '0.12em',
        }}
      >
        SWIPE →
      </div>
      <LogoLockup slots={slots} />
    </Canvas>
  )
}

// ─── VD07 — Problem → Steps → Outcome → CTA (carousel cover) ─────────

function VD07_ProblemStepsOutcomeCTA({ slots, brandTokens }) {
  const t = tokens(brandTokens)
  return (
    <Canvas style={{ background: t.cream }}>
      {/* Top color-block with badge */}
      <div
        className="absolute top-0 inset-x-0 h-[55%]"
        style={{ background: t.dark }}
      >
        <GrainOverlay />
        {slots.badge && (
          <div className="absolute top-5 left-5">
            <span
              className="inline-block px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.22em]"
              style={{
                color: t.primary,
                border: `1px solid ${t.primary}`,
                fontFamily: FONT.body,
              }}
            >
              {slots.badge}
            </span>
          </div>
        )}
        {slots.headline && (
          <div
            className="absolute"
            style={{
              top: '25%', left: '5%', right: '5%',
              fontFamily: FONT.display, fontWeight: 800,
              fontSize: '38px', lineHeight: 1.05, color: t.light,
              letterSpacing: '-0.015em',
            }}
          >
            {slots.headline}
          </div>
        )}
      </div>
      {/* Bottom cream area with subhead + step-count chip */}
      {slots.subhead && (
        <div
          className="absolute"
          style={{
            top: '60%', left: '5%', right: '5%',
            fontFamily: FONT.body, fontSize: '14px', lineHeight: 1.45,
            color: t.dark, opacity: 0.78,
          }}
        >
          {slots.subhead}
        </div>
      )}
      <div className="absolute bottom-5 left-5 flex items-center gap-2">
        {[1, 2, 3, 4].map(i => (
          <span
            key={i}
            className="inline-block w-7 h-7 rounded-full text-[10px] font-extrabold flex items-center justify-center"
            style={{
              background: i === 1 ? t.primary : `${t.dark}11`,
              color: i === 1 ? textOnColor(t.primary) : t.dark,
              fontFamily: FONT.geometric,
            }}
          >
            {i}
          </span>
        ))}
      </div>
      <LogoLockup slots={slots} color={`${t.dark}cc`} />
    </Canvas>
  )
}

// ─── VD08 — Myth → Fact → Proof → CTA (carousel cover) ───────────────

function VD08_MythFactProofCTA({ slots, brandTokens }) {
  const t = tokens(brandTokens)
  return (
    <Canvas style={{ background: t.cream }}>
      {/* Vertical split: left = myth (dark/red), right = fact (light/primary) */}
      <div className="absolute top-0 left-0 h-full w-1/2"
           style={{ background: t.secondary }} />
      <div className="absolute top-0 right-0 h-full w-1/2"
           style={{ background: t.dark }} />
      {/* Centerline */}
      <div
        className="absolute top-0 bottom-0"
        style={{
          left: '50%', width: 2, marginLeft: -1,
          background: t.primary,
          boxShadow: `0 0 24px ${t.primary}88`,
        }}
      />
      {/* Top vs bottom labels */}
      <div className="absolute top-5 left-5">
        <span
          className="text-[10px] font-extrabold uppercase tracking-[0.28em]"
          style={{ color: t.light, fontFamily: FONT.body, opacity: 0.7 }}
        >
          MYTH
        </span>
      </div>
      <div className="absolute top-5 right-5">
        <span
          className="text-[10px] font-extrabold uppercase tracking-[0.28em]"
          style={{ color: t.primary, fontFamily: FONT.body }}
        >
          FACT
        </span>
      </div>
      {/* Centered serif title */}
      {slots.headline && (
        <div
          className="absolute inset-x-5 text-center"
          style={{
            top: '38%',
            fontFamily: FONT.serif, fontWeight: 900, fontStyle: 'italic',
            fontSize: '40px', lineHeight: 1, color: t.light,
            letterSpacing: '-0.015em',
          }}
        >
          {slots.headline}
        </div>
      )}
      {slots.subhead && (
        <div
          className="absolute inset-x-5 text-center"
          style={{
            top: '60%',
            fontFamily: FONT.body, fontSize: '12px', lineHeight: 1.45,
            color: t.light, opacity: 0.85,
          }}
        >
          {slots.subhead}
        </div>
      )}
      <div className="absolute bottom-5 left-0 right-0 text-center">
        <span
          className="inline-block px-3 py-1.5 rounded-full text-[10px] font-extrabold tracking-widest uppercase"
          style={{ background: t.primary, color: textOnColor(t.primary), fontFamily: FONT.body }}
        >
          SWIPE FOR THE TRUTH →
        </span>
      </div>
      <LogoLockup slots={slots} color="#ffffff99" />
    </Canvas>
  )
}

// ─── VD09 — Before → Shift → After → CTA (carousel cover) ────────────

function VD09_BeforeShiftAfterCTA({ slots, brandTokens }) {
  const t = tokens(brandTokens)
  return (
    <Canvas style={{ background: t.dark }}>
      {/* Diagonal split */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 1080 1080" preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="vd09grad" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor={t.dark} />
            <stop offset="1" stopColor={t.secondary} />
          </linearGradient>
        </defs>
        <polygon points="0,0 1080,0 1080,540 0,1080" fill="url(#vd09grad)" />
        <polygon points="0,1080 1080,540 1080,1080" fill={t.primary} />
      </svg>
      {/* Arrow accent crossing the seam */}
      <svg
        className="absolute"
        style={{ top: '46%', left: '32%', width: '36%' }}
        viewBox="0 0 100 20"
      >
        <line x1="0" y1="10" x2="92" y2="10" stroke={t.light} strokeWidth="2" />
        <polygon points="92,4 100,10 92,16" fill={t.light} />
      </svg>
      {/* Before / After labels */}
      <div className="absolute top-5 left-5">
        <span
          className="text-[10px] font-extrabold uppercase tracking-[0.28em]"
          style={{ color: t.light, opacity: 0.7, fontFamily: FONT.body }}
        >
          BEFORE
        </span>
      </div>
      <div className="absolute bottom-[42%] right-5">
        <span
          className="text-[10px] font-extrabold uppercase tracking-[0.28em]"
          style={{ color: textOnColor(t.primary), fontFamily: FONT.body }}
        >
          AFTER
        </span>
      </div>
      {/* Headline at top-left */}
      {slots.headline && (
        <div
          className="absolute"
          style={{
            top: '14%', left: '5%', right: '40%',
            fontFamily: FONT.display, fontWeight: 800,
            fontSize: '36px', lineHeight: 1, color: t.light,
            letterSpacing: '-0.02em',
          }}
        >
          {slots.headline}
        </div>
      )}
      {slots.subhead && (
        <div
          className="absolute"
          style={{
            bottom: '6%', left: '5%', right: '5%',
            fontFamily: FONT.body, fontSize: '12px', lineHeight: 1.4,
            color: textOnColor(t.primary), fontWeight: 600,
          }}
        >
          {slots.subhead}
        </div>
      )}
      <LogoLockup slots={slots} color={`${textOnColor(t.primary)}cc`} />
    </Canvas>
  )
}

// ─── VD10 — Checklist → Action → CTA (carousel cover) ────────────────

function VD10_ChecklistActionCTA({ slots, brandTokens }) {
  const t = tokens(brandTokens)
  return (
    <Canvas style={{ background: t.light }}>
      {slots.badge && (
        <div className="absolute top-5 left-5">
          <span
            className="text-[9px] font-bold uppercase tracking-[0.22em]"
            style={{ color: t.secondary, fontFamily: FONT.body }}
          >
            {slots.badge}
          </span>
        </div>
      )}
      {/* Headline */}
      {slots.headline && (
        <div
          className="absolute"
          style={{
            top: '14%', left: '5%', right: '5%',
            fontFamily: FONT.display, fontWeight: 800,
            fontSize: '36px', lineHeight: 1, color: t.dark,
            letterSpacing: '-0.018em',
          }}
        >
          {slots.headline}
        </div>
      )}
      {/* Big numbered marks 01-04 in a faded vertical column */}
      <div className="absolute" style={{ top: '36%', left: '5%' }}>
        {[1, 2, 3, 4].map((i, idx) => (
          <div
            key={i}
            className="flex items-baseline gap-3 mb-1.5"
          >
            <span
              style={{
                fontFamily: FONT.geometric, fontWeight: 900,
                fontSize: '34px', lineHeight: 1, color: t.dark,
                opacity: idx === 0 ? 1 : 0.16,
                letterSpacing: '-0.04em',
              }}
            >
              0{i}
            </span>
            {idx === 0 && (
              <span
                style={{
                  fontFamily: FONT.body, fontSize: '13px', fontWeight: 600,
                  color: t.dark, opacity: 0.85,
                }}
              >
                {slots.subhead || 'Tap to start'}
              </span>
            )}
          </div>
        ))}
      </div>
      {slots.cta && (
        <span
          className="absolute inline-block px-3 py-1.5 rounded-full text-[11px] font-extrabold"
          style={{
            bottom: '5%', left: '5%',
            background: t.dark, color: t.light, fontFamily: FONT.body,
          }}
        >
          {slots.cta}
        </span>
      )}
      <LogoLockup slots={slots} color={`${t.dark}cc`} />
    </Canvas>
  )
}

// ─── Body slide (carousels VD06–VD10) ────────────────────────────────

function BodySlide({ slots, brandTokens, accent }) {
  const t = tokens(brandTokens)
  return (
    <Canvas style={{ background: t.cream }}>
      <div className="absolute top-5 left-5 h-1 w-12" style={{ background: accent || t.primary }} />
      {slots.headline && (
        <div
          className="absolute"
          style={{
            top: '18%', left: '5%', right: '5%',
            fontFamily: FONT.display, fontWeight: 800,
            fontSize: '34px', lineHeight: 1.04, color: t.dark,
            letterSpacing: '-0.018em',
          }}
        >
          {slots.headline}
        </div>
      )}
      {slots.body && (
        <div
          className="absolute"
          style={{
            top: '55%', left: '5%', right: '5%',
            fontFamily: FONT.body, fontSize: '14px', lineHeight: 1.55,
            color: t.dark, opacity: 0.78,
          }}
        >
          {slots.body}
        </div>
      )}
      <LogoLockup slots={slots} color={`${t.dark}cc`} />
    </Canvas>
  )
}

// ─── Dispatch ────────────────────────────────────────────────────────

const ARCHETYPES = {
  VD01: VD01_EditorialHero,
  VD02: VD02_OfferCard,
  VD03: VD03_ProofSnapshot,
  VD04: VD04_PeopleInContext,
  VD05: VD05_ProductFocus,
  VD06: VD06_HookContextProofCTA,
  VD07: VD07_ProblemStepsOutcomeCTA,
  VD08: VD08_MythFactProofCTA,
  VD09: VD09_BeforeShiftAfterCTA,
  VD10: VD10_ChecklistActionCTA,
}

const ARCHETYPE_LABELS = {
  VD01: 'Editorial Hero',
  VD02: 'Offer Card',
  VD03: 'Proof Snapshot',
  VD04: 'People-in-Context',
  VD05: 'Product Focus',
  VD06: 'Hook → Context → Proof → CTA',
  VD07: 'Problem → Steps → Outcome → CTA',
  VD08: 'Myth → Fact → Proof → CTA',
  VD09: 'Before → Shift → After → CTA',
  VD10: 'Checklist → Action → CTA',
}

function isCarouselBody(slots) {
  return !!slots?.body && !slots?.cta && !slots?.badge
}

/**
 * Render an archetype tile from a resolved slot_values payload.
 *
 * Dispatches by VD code stored in art_direction_variant. Falls back to
 * VD01 when variant is missing or unknown — keeps the admin grid resilient
 * if the library expands beyond what's coded here.
 */
export default function TemplateArchetype({ variant, slotValues, brandTokens }) {
  const code = String(variant || 'VD01').toUpperCase()
  const Comp = ARCHETYPES[code]
  if (!Comp) {
    return (
      <div className="aspect-square w-full rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-center text-white/30 text-[11px]">
        {code} not implemented
      </div>
    )
  }
  // Carousel body slides drop into the BodySlide component regardless of
  // archetype — keeps slide-2+ visually quieter than the cover.
  if (isCarouselBody(slotValues)) {
    return <BodySlide slots={slotValues || {}} brandTokens={brandTokens || {}} />
  }
  return <Comp slots={slotValues || {}} brandTokens={brandTokens || {}} />
}

export { ARCHETYPES, ARCHETYPE_LABELS }
