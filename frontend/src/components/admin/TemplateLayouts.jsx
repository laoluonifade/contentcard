/**
 * Premium template layouts — 21 distinct designs.
 *
 * Dispatch table maps (intent_family, art_direction_variant) to a React
 * component that paints a 1080×1080 canvas using the slot values
 * resolved by the demo render job (PR 1.7).
 *
 * Each layout reads from the same canonical slot set defined in
 * `app/services/template_design/slot_contract.py`. Variants:
 *   A — photo-led      (hero subject placeholder, editorial typography,
 *                       restrained accents)
 *   B — type-led       (display-scale headline, no background photo,
 *                       restrained color)
 *   C — surface-led    (color block / pattern dominant, minimal photo)
 *
 * Carousel slide_role differences ('cover' / 'body' / 'cta') are
 * handled inline by reading which slots are populated.
 *
 * Replaces the placeholder PreviewCanvas painted in PR 1.8.
 */

import React from 'react'

// ─── Helpers ──────────────────────────────────────────────────────────

function tokens(brandTokens) {
  return {
    primary: brandTokens?.primary || '#FFC72C',
    secondary: brandTokens?.secondary || '#DA291C',
    dark: brandTokens?.neutral_dark || '#1A1A1A',
    light: brandTokens?.neutral_light || '#FFFFFF',
    fontDisplay: brandTokens?.font_display || 'Inter, system-ui, sans-serif',
    fontBody: brandTokens?.font_body || 'Inter, system-ui, sans-serif',
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
  return yiq >= 128 ? '#000000' : '#FFFFFF'
}

// Layout container that all 21 layouts wrap with. Sets aspect, font,
// and a relative positioning context. Tailwind classes drive responsive
// scaling — the canvas is a square that scales to the container width.
function Canvas({ children, style }) {
  return (
    <div
      className="aspect-square w-full rounded-xl overflow-hidden relative"
      style={{ fontFamily: 'Inter, system-ui, sans-serif', ...style }}
    >
      {children}
    </div>
  )
}

// Logo lockup pinned to bottom-right per PRD §4.1. Falls back to brand_name.
function LogoLockup({ slots, color = 'rgba(255,255,255,0.85)' }) {
  if (!slots?.brand_name) return null
  return (
    <div
      className="absolute bottom-5 right-5 text-[11px] font-bold tracking-wide"
      style={{ color }}
    >
      {slots.brand_name}
    </div>
  )
}

function isBodySlide(slots) {
  return !!slots?.body && !slots?.cta && !slots?.badge
}

// ─── PROMO ─────────────────────────────────────────────────────────────

function PromoA({ slots, brandTokens }) {
  const t = tokens(brandTokens)
  const onAccent = textOnColor(t.primary)
  return (
    <Canvas style={{ background: `linear-gradient(160deg, ${t.dark}, #000)` }}>
      <div
        className="absolute inset-x-0 bottom-0 h-1/2"
        style={{
          background: `linear-gradient(to top, rgba(0,0,0,0.85), transparent)`,
        }}
      />
      {/* Hero zone (placeholder swirl using brand red as accent) */}
      <div
        className="absolute"
        style={{
          width: '60%', height: '60%', top: '8%', left: '20%',
          borderRadius: '50%',
          background: `radial-gradient(circle at 35% 35%, ${t.secondary}33, transparent 60%)`,
          filter: 'blur(8px)',
        }}
      />
      {slots.badge && (
        <div
          className="absolute top-5 right-5 px-3 py-1.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest"
          style={{ background: t.secondary, color: '#fff' }}
        >
          {slots.badge}
        </div>
      )}
      <div className="absolute left-5 right-5 bottom-16">
        {slots.headline && (
          <div className="text-white font-extrabold leading-[1.05]"
               style={{ fontSize: '32px' }}>
            {slots.headline}
          </div>
        )}
        {slots.subhead && (
          <div className="text-white/75 text-xs mt-2 leading-snug">
            {slots.subhead}
          </div>
        )}
      </div>
      {slots.cta && (
        <div className="absolute bottom-5 left-5">
          <span className="inline-block px-3.5 py-1.5 rounded-full text-[11px] font-extrabold"
                style={{ background: t.primary, color: onAccent }}>
            {slots.cta}
          </span>
        </div>
      )}
      <LogoLockup slots={slots} />
    </Canvas>
  )
}

function PromoB({ slots, brandTokens }) {
  const t = tokens(brandTokens)
  const onAccent = textOnColor(t.primary)
  return (
    <Canvas style={{ background: t.dark }}>
      {slots.badge && (
        <div className="absolute top-5 left-5 px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-widest"
             style={{ color: t.primary, border: `1px solid ${t.primary}` }}>
          {slots.badge}
        </div>
      )}
      <div className="absolute inset-x-5 top-16 bottom-16 flex items-center">
        <div className="text-white font-black leading-[0.95] tracking-tight"
             style={{ fontSize: '52px', color: t.light }}>
          {slots.headline}
        </div>
      </div>
      {slots.subhead && (
        <div className="absolute left-5 right-5 bottom-16 text-white/55 text-[10px]">
          {slots.subhead}
        </div>
      )}
      {slots.cta && (
        <div className="absolute bottom-5 right-5">
          <span className="inline-block px-4 py-1.5 text-[11px] font-extrabold rounded-sm"
                style={{ background: t.primary, color: onAccent }}>
            {slots.cta} →
          </span>
        </div>
      )}
      <LogoLockup slots={slots} color={`${t.primary}cc`} />
    </Canvas>
  )
}

function PromoC({ slots, brandTokens }) {
  const t = tokens(brandTokens)
  const onAccent = textOnColor(t.primary)
  const onSecondary = textOnColor(t.secondary)
  return (
    <Canvas style={{ background: t.light }}>
      <div className="absolute inset-x-0 top-0 h-1/2"
           style={{ background: t.primary }} />
      {slots.badge && (
        <div className="absolute top-5 left-5 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest"
             style={{ background: t.secondary, color: onSecondary }}>
          {slots.badge}
        </div>
      )}
      {/* Big offer-chip overlapping the color seam */}
      <div className="absolute left-5 right-5" style={{ top: '38%' }}>
        <div className="rounded-2xl p-4 shadow-lg"
             style={{ background: t.dark, color: t.light }}>
          {slots.headline && (
            <div className="font-extrabold leading-tight" style={{ fontSize: '24px' }}>
              {slots.headline}
            </div>
          )}
          {slots.subhead && (
            <div className="text-[10px] opacity-70 mt-1.5 leading-snug">
              {slots.subhead}
            </div>
          )}
        </div>
      </div>
      {slots.cta && (
        <div className="absolute bottom-5 left-5 right-5 flex justify-center">
          <span className="inline-block px-5 py-2 rounded-full text-[12px] font-extrabold"
                style={{ background: t.dark, color: t.light }}>
            {slots.cta}
          </span>
        </div>
      )}
      <LogoLockup slots={slots} color={t.dark + 'cc'} />
    </Canvas>
  )
}

// ─── EDU ───────────────────────────────────────────────────────────────

function EduA({ slots, brandTokens }) {
  const t = tokens(brandTokens)
  return (
    <Canvas style={{ background: t.light }}>
      {/* Subject column with photographic gradient */}
      <div
        className="absolute left-0 top-0 bottom-0 w-2/5"
        style={{ background: `linear-gradient(160deg, ${t.dark}, ${t.secondary})` }}
      />
      {slots.badge && (
        <div className="absolute top-5 left-5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest"
             style={{ background: '#fff', color: t.dark }}>
          {slots.badge}
        </div>
      )}
      <div className="absolute" style={{ top: '20%', left: '45%', right: '5%' }}>
        {slots.headline && (
          <div className="font-extrabold leading-tight" style={{ fontSize: '26px', color: t.dark }}>
            {slots.headline}
          </div>
        )}
        {slots.subhead && (
          <div className="text-[11px] mt-2.5 leading-snug" style={{ color: '#555' }}>
            {slots.subhead}
          </div>
        )}
        {slots.body && (
          <div className="text-[11px] mt-2.5 leading-snug" style={{ color: '#555' }}>
            {slots.body}
          </div>
        )}
      </div>
      {slots.cta && (
        <div className="absolute" style={{ bottom: '22px', left: '45%' }}>
          <span className="inline-block px-3 py-1 text-[10px] font-bold rounded-md"
                style={{ background: t.dark, color: '#fff' }}>
            {slots.cta}
          </span>
        </div>
      )}
      <LogoLockup slots={slots} color={t.dark} />
    </Canvas>
  )
}

function EduB({ slots, brandTokens }) {
  const t = tokens(brandTokens)
  return (
    <Canvas style={{ background: '#FAFAF7' }}>
      {/* Numbered list aesthetic */}
      <div className="absolute" style={{ top: '12%', left: '5%' }}>
        <div className="font-black leading-none opacity-15"
             style={{ fontSize: '120px', color: t.secondary }}>
          01
        </div>
      </div>
      {slots.badge && (
        <div className="absolute top-5 right-5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest"
             style={{ background: t.secondary, color: '#fff' }}>
          {slots.badge}
        </div>
      )}
      <div className="absolute" style={{ top: '40%', left: '5%', right: '5%' }}>
        {slots.headline && (
          <div className="font-extrabold leading-tight" style={{ fontSize: '32px', color: t.dark }}>
            {slots.headline}
          </div>
        )}
        {slots.subhead && (
          <div className="text-[12px] mt-2.5 leading-snug" style={{ color: '#444' }}>
            {slots.subhead}
          </div>
        )}
        {slots.body && (
          <div className="text-[12px] mt-2.5 leading-snug" style={{ color: '#444' }}>
            {slots.body}
          </div>
        )}
      </div>
      {slots.cta && (
        <div className="absolute bottom-5 left-5">
          <span className="inline-block text-[11px] font-bold border-b-2 pb-0.5"
                style={{ color: t.dark, borderColor: t.secondary }}>
            {slots.cta} ↗
          </span>
        </div>
      )}
      <LogoLockup slots={slots} color={t.dark + 'cc'} />
    </Canvas>
  )
}

function EduC({ slots, brandTokens }) {
  const t = tokens(brandTokens)
  return (
    <Canvas style={{ background: t.dark }}>
      {/* Card stack metaphor */}
      <div className="absolute inset-5 rounded-2xl p-5"
           style={{ background: t.light, borderLeft: `6px solid ${t.primary}` }}>
        {slots.badge && (
          <div className="text-[10px] font-extrabold uppercase tracking-widest mb-3"
               style={{ color: t.secondary }}>
            {slots.badge}
          </div>
        )}
        {slots.headline && (
          <div className="font-extrabold leading-tight" style={{ fontSize: '28px', color: t.dark }}>
            {slots.headline}
          </div>
        )}
        {slots.subhead && (
          <div className="text-[12px] mt-3 leading-snug" style={{ color: '#555' }}>
            {slots.subhead}
          </div>
        )}
        {slots.body && (
          <div className="text-[12px] mt-3 leading-snug" style={{ color: '#555' }}>
            {slots.body}
          </div>
        )}
        {slots.cta && (
          <div className="absolute bottom-5 left-5">
            <span className="inline-block px-3 py-1 text-[10px] font-bold rounded-md"
                  style={{ background: t.dark, color: '#fff' }}>
              {slots.cta}
            </span>
          </div>
        )}
      </div>
      <LogoLockup slots={slots} color="#ffffffaa" />
    </Canvas>
  )
}

// ─── TESTIMONIAL ───────────────────────────────────────────────────────

function TestimonialA({ slots, brandTokens }) {
  const t = tokens(brandTokens)
  return (
    <Canvas style={{ background: t.light }}>
      {/* Portrait silhouette circle */}
      <div className="absolute"
           style={{
             top: '8%', left: '5%',
             width: '120px', height: '120px',
             borderRadius: '50%',
             background: `radial-gradient(circle at 35% 30%, ${t.dark}, ${t.secondary})`,
           }} />
      {slots.badge && (
        <div className="absolute top-5 right-5 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest"
             style={{ background: '#0001', color: t.dark }}>
          {slots.badge}
        </div>
      )}
      <div className="absolute" style={{ top: '38%', left: '5%', right: '5%' }}>
        {slots.headline && (
          <div className="font-extrabold leading-snug italic" style={{ fontSize: '24px', color: t.dark }}>
            "{slots.headline}"
          </div>
        )}
      </div>
      {slots.proof_metric && (
        <div className="absolute" style={{ top: '70%', left: '5%' }}>
          <span className="inline-block px-3 py-1.5 rounded-md text-[12px] font-extrabold"
                style={{ background: t.primary, color: textOnColor(t.primary) }}>
            {slots.proof_metric}
          </span>
        </div>
      )}
      {slots.proof_attribution && (
        <div className="absolute text-[11px] font-medium" style={{ top: '78%', left: '5%', color: '#555' }}>
          {slots.proof_attribution}
        </div>
      )}
      {slots.cta && (
        <div className="absolute bottom-5 left-5">
          <span className="text-[11px] font-bold underline" style={{ color: t.dark }}>
            {slots.cta}
          </span>
        </div>
      )}
      <LogoLockup slots={slots} color={t.dark + 'cc'} />
    </Canvas>
  )
}

function TestimonialB({ slots, brandTokens }) {
  const t = tokens(brandTokens)
  return (
    <Canvas style={{ background: '#F4F1EB' }}>
      <div className="absolute font-black opacity-20" style={{ fontSize: '160px', top: '-30px', left: '20px', color: t.secondary }}>
        “
      </div>
      <div className="absolute inset-x-5 top-16 bottom-20 flex items-center justify-center text-center">
        <div>
          {slots.headline && (
            <div className="font-extrabold leading-snug italic" style={{ fontSize: '26px', color: t.dark, fontFamily: 'Georgia, serif' }}>
              {slots.headline}
            </div>
          )}
          {slots.proof_metric && (
            <div className="mt-4 font-extrabold text-[12px]" style={{ color: t.secondary }}>
              {slots.proof_metric}
            </div>
          )}
          {slots.proof_attribution && (
            <div className="mt-1 text-[10px]" style={{ color: '#777' }}>
              — {slots.proof_attribution}
            </div>
          )}
        </div>
      </div>
      {slots.cta && (
        <div className="absolute bottom-5 left-0 right-0 text-center">
          <span className="text-[11px] font-bold border-b" style={{ color: t.dark, borderColor: t.dark }}>
            {slots.cta}
          </span>
        </div>
      )}
      <LogoLockup slots={slots} color={t.dark} />
    </Canvas>
  )
}

function TestimonialC({ slots, brandTokens }) {
  const t = tokens(brandTokens)
  return (
    <Canvas style={{ background: t.primary }}>
      <div className="absolute inset-5 rounded-2xl bg-white shadow-2xl flex flex-col p-5">
        {slots.badge && (
          <div className="text-[10px] font-extrabold uppercase tracking-widest"
               style={{ color: t.secondary }}>
            {slots.badge}
          </div>
        )}
        {slots.proof_metric && (
          <div className="font-black leading-none mt-3" style={{ fontSize: '64px', color: t.dark }}>
            {slots.proof_metric}
          </div>
        )}
        {slots.headline && (
          <div className="text-[14px] mt-3 leading-snug" style={{ color: t.dark }}>
            {slots.headline}
          </div>
        )}
        <div className="flex-1" />
        {slots.proof_attribution && (
          <div className="text-[10px] font-medium" style={{ color: '#777' }}>
            — {slots.proof_attribution}
          </div>
        )}
      </div>
      <LogoLockup slots={slots} color={textOnColor(t.primary) + 'cc'} />
    </Canvas>
  )
}

// ─── HIRING ────────────────────────────────────────────────────────────

function HiringA({ slots, brandTokens }) {
  const t = tokens(brandTokens)
  return (
    <Canvas style={{ background: `linear-gradient(135deg, ${t.dark}, ${t.secondary})` }}>
      {/* Suggestion of team/people via abstract shapes */}
      {[0, 1, 2].map(i => (
        <div key={i} className="absolute rounded-full"
             style={{
               width: '90px', height: '90px',
               top: `${15 + i * 4}%`,
               right: `${5 + i * 12}%`,
               background: `${t.primary}33`,
               filter: 'blur(8px)',
             }} />
      ))}
      {slots.badge && (
        <div className="absolute top-5 left-5 px-3 py-1.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest"
             style={{ background: t.primary, color: textOnColor(t.primary) }}>
          {slots.badge}
        </div>
      )}
      <div className="absolute inset-x-5" style={{ top: '50%' }}>
        {slots.headline && (
          <div className="text-white font-extrabold leading-tight" style={{ fontSize: '30px' }}>
            {slots.headline}
          </div>
        )}
        {slots.subhead && (
          <div className="text-white/75 text-[12px] mt-2.5 leading-snug">
            {slots.subhead}
          </div>
        )}
      </div>
      {slots.cta && (
        <div className="absolute bottom-5 left-5">
          <span className="inline-block px-4 py-2 rounded-full text-[11px] font-extrabold"
                style={{ background: t.light, color: t.dark }}>
            {slots.cta}
          </span>
        </div>
      )}
      <LogoLockup slots={slots} />
    </Canvas>
  )
}

function HiringB({ slots, brandTokens }) {
  const t = tokens(brandTokens)
  return (
    <Canvas style={{ background: t.light }}>
      <div className="absolute inset-x-5" style={{ top: '6%' }}>
        <div className="font-black leading-[0.9] tracking-tight"
             style={{ fontSize: '64px', color: t.dark }}>
          {slots.badge || "WE'RE HIRING"}
        </div>
      </div>
      <div className="absolute inset-x-5" style={{ top: '52%' }}>
        {slots.headline && (
          <div className="font-extrabold leading-tight" style={{ fontSize: '24px', color: t.secondary }}>
            {slots.headline}
          </div>
        )}
        {slots.subhead && (
          <div className="text-[12px] mt-2.5 leading-snug" style={{ color: '#555' }}>
            {slots.subhead}
          </div>
        )}
      </div>
      {slots.cta && (
        <div className="absolute bottom-5 right-5">
          <span className="inline-block px-3.5 py-1.5 text-[11px] font-bold"
                style={{ color: t.light, background: t.dark }}>
            {slots.cta}
          </span>
        </div>
      )}
      <LogoLockup slots={slots} color={t.dark + 'cc'} />
    </Canvas>
  )
}

function HiringC({ slots, brandTokens }) {
  const t = tokens(brandTokens)
  return (
    <Canvas style={{ background: t.light }}>
      <div className="absolute inset-x-0 top-0 h-2/5" style={{ background: t.primary }}>
        {slots.badge && (
          <div className="absolute bottom-3 left-5 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest"
               style={{ color: textOnColor(t.primary), border: `1.5px solid ${textOnColor(t.primary)}` }}>
            {slots.badge}
          </div>
        )}
      </div>
      <div className="absolute inset-x-5" style={{ top: '46%' }}>
        {slots.headline && (
          <div className="font-extrabold leading-tight" style={{ fontSize: '30px', color: t.dark }}>
            {slots.headline}
          </div>
        )}
        {slots.subhead && (
          <div className="text-[12px] mt-2.5 leading-snug" style={{ color: '#555' }}>
            {slots.subhead}
          </div>
        )}
      </div>
      {slots.cta && (
        <div className="absolute bottom-5 left-5">
          <span className="inline-block px-4 py-2 rounded-full text-[11px] font-extrabold"
                style={{ background: t.dark, color: t.light }}>
            {slots.cta} →
          </span>
        </div>
      )}
      <LogoLockup slots={slots} color={t.dark + 'cc'} />
    </Canvas>
  )
}

// ─── CONTENT ───────────────────────────────────────────────────────────

function ContentA({ slots, brandTokens }) {
  const t = tokens(brandTokens)
  if (isBodySlide(slots)) return <BodySlide slots={slots} brandTokens={brandTokens} accent={t.primary} />
  return (
    <Canvas style={{ background: `linear-gradient(180deg, ${t.dark}, #000)` }}>
      <div className="absolute"
           style={{
             top: '5%', left: '10%', right: '10%', height: '50%',
             borderRadius: '12px',
             background: `linear-gradient(135deg, ${t.secondary}55, ${t.primary}33)`,
           }} />
      <div className="absolute inset-x-5" style={{ top: '60%' }}>
        {slots.headline && (
          <div className="text-white font-extrabold leading-tight" style={{ fontSize: '28px' }}>
            {slots.headline}
          </div>
        )}
        {slots.subhead && (
          <div className="text-white/65 text-[11px] mt-2.5 leading-snug">
            {slots.subhead}
          </div>
        )}
        {slots.body && !slots.subhead && (
          <div className="text-white/65 text-[11px] mt-2.5 leading-snug">
            {slots.body}
          </div>
        )}
      </div>
      {slots.cta && (
        <div className="absolute bottom-5 left-5">
          <span className="inline-block px-3 py-1.5 rounded-full text-[10px] font-extrabold"
                style={{ background: t.primary, color: textOnColor(t.primary) }}>
            {slots.cta}
          </span>
        </div>
      )}
      <LogoLockup slots={slots} />
    </Canvas>
  )
}

function ContentB({ slots, brandTokens }) {
  const t = tokens(brandTokens)
  if (isBodySlide(slots)) return <BodySlide slots={slots} brandTokens={brandTokens} accent={t.secondary} />
  return (
    <Canvas style={{ background: '#FAFAF7' }}>
      <div className="absolute inset-x-5 top-12 bottom-16 flex flex-col justify-center">
        {slots.headline && (
          <div className="font-black leading-[0.95] tracking-tight"
               style={{ fontSize: '46px', color: t.dark }}>
            {slots.headline}
          </div>
        )}
        {slots.subhead && (
          <div className="text-[12px] mt-4 leading-snug" style={{ color: '#444' }}>
            {slots.subhead}
          </div>
        )}
      </div>
      <div className="absolute top-5 left-5 h-1 w-12" style={{ background: t.secondary }} />
      {slots.cta && (
        <div className="absolute bottom-5 left-5">
          <span className="text-[11px] font-bold" style={{ color: t.secondary }}>
            {slots.cta} →
          </span>
        </div>
      )}
      <LogoLockup slots={slots} color={t.dark + 'cc'} />
    </Canvas>
  )
}

function ContentC({ slots, brandTokens }) {
  const t = tokens(brandTokens)
  if (isBodySlide(slots)) return <BodySlide slots={slots} brandTokens={brandTokens} accent={t.primary} surface />
  return (
    <Canvas style={{ background: t.secondary }}>
      <div className="absolute inset-5 rounded-2xl bg-white p-5 flex flex-col">
        {slots.headline && (
          <div className="font-extrabold leading-tight" style={{ fontSize: '28px', color: t.dark }}>
            {slots.headline}
          </div>
        )}
        {slots.subhead && (
          <div className="text-[12px] mt-3 leading-snug" style={{ color: '#555' }}>
            {slots.subhead}
          </div>
        )}
        <div className="flex-1" />
        {slots.cta && (
          <div className="self-start">
            <span className="inline-block px-3.5 py-1.5 rounded-full text-[11px] font-extrabold"
                  style={{ background: t.primary, color: textOnColor(t.primary) }}>
              {slots.cta}
            </span>
          </div>
        )}
      </div>
      <LogoLockup slots={slots} color={textOnColor(t.secondary) + 'cc'} />
    </Canvas>
  )
}

// Carousel body-slide companion: simpler surface for slot_role='body'.
function BodySlide({ slots, brandTokens, accent, surface }) {
  const t = tokens(brandTokens)
  return (
    <Canvas style={{ background: surface ? t.primary : t.light }}>
      <div className="absolute inset-5 flex flex-col justify-center"
           style={{ background: surface ? '#fff' : 'transparent', borderRadius: '12px', padding: '20px' }}>
        {slots.headline && (
          <div className="font-extrabold leading-tight" style={{ fontSize: '24px', color: t.dark }}>
            {slots.headline}
          </div>
        )}
        {slots.body && (
          <div className="text-[12px] mt-3 leading-relaxed" style={{ color: '#555' }}>
            {slots.body}
          </div>
        )}
      </div>
      <div className="absolute top-5 left-5 h-1 w-10" style={{ background: accent }} />
      <LogoLockup slots={slots} color={t.dark + 'aa'} />
    </Canvas>
  )
}

// ─── HOOK ──────────────────────────────────────────────────────────────

function HookA({ slots, brandTokens }) {
  const t = tokens(brandTokens)
  return (
    <Canvas style={{ background: '#000' }}>
      {/* Dramatic radial */}
      <div className="absolute inset-0"
           style={{ background: `radial-gradient(circle at 70% 30%, ${t.secondary}99, transparent 50%)` }} />
      {slots.badge && (
        <div className="absolute top-5 left-5 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest"
             style={{ background: t.primary, color: textOnColor(t.primary) }}>
          {slots.badge}
        </div>
      )}
      <div className="absolute inset-x-5 bottom-12">
        {slots.headline && (
          <div className="text-white font-black leading-[0.95]" style={{ fontSize: '36px' }}>
            {slots.headline}
          </div>
        )}
        {slots.subhead && (
          <div className="text-white/70 text-[11px] mt-2 leading-snug">
            {slots.subhead}
          </div>
        )}
      </div>
      {slots.cta && (
        <div className="absolute bottom-5 right-5 text-[10px] text-white/55">
          {slots.cta} ↓
        </div>
      )}
      <LogoLockup slots={slots} />
    </Canvas>
  )
}

function HookB({ slots, brandTokens }) {
  const t = tokens(brandTokens)
  return (
    <Canvas style={{ background: t.primary }}>
      <div className="absolute font-black leading-none"
           style={{ fontSize: '180px', top: '-20px', left: '20px', color: textOnColor(t.primary) + '22' }}>
        ?
      </div>
      <div className="absolute inset-x-5" style={{ top: '38%' }}>
        {slots.headline && (
          <div className="font-black leading-[0.95]" style={{ fontSize: '40px', color: textOnColor(t.primary) }}>
            {slots.headline}
          </div>
        )}
        {slots.subhead && (
          <div className="text-[12px] mt-3 leading-snug" style={{ color: textOnColor(t.primary) + 'cc' }}>
            {slots.subhead}
          </div>
        )}
      </div>
      {slots.cta && (
        <div className="absolute bottom-5 left-5 text-[11px] font-bold"
             style={{ color: textOnColor(t.primary) }}>
          {slots.cta} →
        </div>
      )}
      <LogoLockup slots={slots} color={textOnColor(t.primary) + 'cc'} />
    </Canvas>
  )
}

function HookC({ slots, brandTokens }) {
  const t = tokens(brandTokens)
  return (
    <Canvas style={{ background: t.secondary }}>
      <div className="absolute inset-x-0 bottom-0 h-1/3" style={{ background: t.dark }} />
      {slots.badge && (
        <div className="absolute top-5 left-5 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-widest"
             style={{ background: t.primary, color: textOnColor(t.primary) }}>
          {slots.badge}
        </div>
      )}
      <div className="absolute inset-x-5" style={{ top: '20%' }}>
        {slots.headline && (
          <div className="font-extrabold leading-tight"
               style={{ fontSize: '32px', color: textOnColor(t.secondary) }}>
            {slots.headline}
          </div>
        )}
      </div>
      {slots.subhead && (
        <div className="absolute inset-x-5 text-[11px] leading-snug"
             style={{ bottom: '22%', color: textOnColor(t.secondary) + 'cc' }}>
          {slots.subhead}
        </div>
      )}
      {slots.cta && (
        <div className="absolute bottom-5 left-5 right-5 text-center">
          <span className="text-[11px] font-extrabold"
                style={{ color: textOnColor(t.dark) }}>
            ↓ {slots.cta}
          </span>
        </div>
      )}
      <LogoLockup slots={slots} color={textOnColor(t.dark) + 'cc'} />
    </Canvas>
  )
}

// ─── QUOTE ─────────────────────────────────────────────────────────────

function QuoteA({ slots, brandTokens }) {
  const t = tokens(brandTokens)
  return (
    <Canvas style={{ background: `linear-gradient(160deg, ${t.dark}, ${t.secondary}88)` }}>
      <div className="absolute font-black opacity-25"
           style={{ fontSize: '180px', top: '-20px', left: '20px', color: t.primary, fontFamily: 'Georgia, serif' }}>
        “
      </div>
      <div className="absolute inset-x-7 inset-y-12 flex items-center">
        <div>
          {slots.quote_text && (
            <div className="font-bold leading-snug"
                 style={{ fontSize: '24px', color: '#fff', fontFamily: 'Georgia, serif' }}>
              {slots.quote_text}
            </div>
          )}
          {slots.proof_attribution && (
            <div className="mt-4 text-[11px]" style={{ color: t.primary }}>
              — {slots.proof_attribution}
            </div>
          )}
        </div>
      </div>
      <LogoLockup slots={slots} />
    </Canvas>
  )
}

function QuoteB({ slots, brandTokens }) {
  const t = tokens(brandTokens)
  return (
    <Canvas style={{ background: '#F4F1EB' }}>
      <div className="absolute inset-x-7 top-10 bottom-16 flex items-center">
        <div className="relative w-full">
          <div className="font-black opacity-15 leading-none absolute"
               style={{ fontSize: '200px', top: '-90px', left: '-15px', color: t.secondary, fontFamily: 'Georgia, serif' }}>
            “
          </div>
          {slots.quote_text && (
            <div className="font-bold leading-tight relative"
                 style={{ fontSize: '34px', color: t.dark, fontFamily: 'Georgia, serif' }}>
              {slots.quote_text}
            </div>
          )}
          {slots.proof_attribution && (
            <div className="mt-5 text-[11px] font-medium" style={{ color: '#666' }}>
              — {slots.proof_attribution}
            </div>
          )}
        </div>
      </div>
      <LogoLockup slots={slots} color={t.dark} />
    </Canvas>
  )
}

function QuoteC({ slots, brandTokens }) {
  const t = tokens(brandTokens)
  return (
    <Canvas style={{ background: t.primary }}>
      <div className="absolute inset-7 bg-white rounded-xl flex items-center justify-center p-5 shadow-lg">
        <div className="text-center">
          {slots.quote_text && (
            <div className="font-extrabold leading-snug italic"
                 style={{ fontSize: '20px', color: t.dark, fontFamily: 'Georgia, serif' }}>
              "{slots.quote_text}"
            </div>
          )}
          {slots.proof_attribution && (
            <div className="mt-4 text-[10px] font-medium" style={{ color: t.secondary }}>
              {slots.proof_attribution}
            </div>
          )}
        </div>
      </div>
      <LogoLockup slots={slots} color={textOnColor(t.primary) + 'cc'} />
    </Canvas>
  )
}

// ─── Dispatch ──────────────────────────────────────────────────────────

const LAYOUTS = {
  promo:       { A: PromoA,       B: PromoB,       C: PromoC },
  edu:         { A: EduA,         B: EduB,         C: EduC },
  testimonial: { A: TestimonialA, B: TestimonialB, C: TestimonialC },
  hiring:      { A: HiringA,      B: HiringB,      C: HiringC },
  content:     { A: ContentA,     B: ContentB,     C: ContentC },
  hook:        { A: HookA,        B: HookB,        C: HookC },
  quote:       { A: QuoteA,       B: QuoteB,       C: QuoteC },
}

/**
 * Render a designed template tile from a resolved slot_values payload.
 * Used by both the grid (PreviewTile) and the drawer (PreviewCanvas).
 *
 * Falls back to a neutral placeholder when the (intent, variant) pair
 * has no layout component yet — keeps the admin grid resilient if the
 * library grows beyond what's coded here.
 */
export default function TemplateLayout({
  intentFamily, variant, slotValues, brandTokens,
}) {
  const family = LAYOUTS[intentFamily]
  const Comp = family && family[variant]
  if (!Comp) {
    return (
      <Canvas style={{ background: '#1A1A1A' }}>
        <div className="absolute inset-0 flex items-center justify-center text-white/30 text-[11px]">
          {intentFamily}/{variant} layout not implemented
        </div>
      </Canvas>
    )
  }
  return <Comp slots={slotValues || {}} brandTokens={brandTokens || {}} />
}
