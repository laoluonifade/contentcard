import { Link } from 'react-router-dom'

export function MarketingContainer({ children, className = '' }) {
  return <div className={`max-w-6xl mx-auto px-4 sm:px-6 ${className}`.trim()}>{children}</div>
}

export function HeroSection({ eyebrow, title, subtitle, actions, media, className = '' }) {
  return (
    <section className={`py-14 sm:py-20 ${className}`.trim()}>
      <MarketingContainer className="grid gap-10 lg:grid-cols-[1.08fr_0.92fr] items-center">
        <div>
          {eyebrow ? (
            <p className="inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-brand-700 mb-5">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-ink leading-[1.05] tracking-tight">{title}</h1>
          {subtitle ? <p className="mt-5 text-base sm:text-lg text-ink/70 max-w-2xl leading-relaxed">{subtitle}</p> : null}
          {actions ? <div className="mt-7 flex flex-wrap gap-3">{actions}</div> : null}
        </div>
        {media ? <div>{media}</div> : null}
      </MarketingContainer>
    </section>
  )
}

export function SectionHeader({ eyebrow, title, subtitle, center = false }) {
  return (
    <div className={center ? 'text-center max-w-3xl mx-auto' : 'max-w-3xl'}>
      {eyebrow ? <p className="text-xs font-semibold uppercase tracking-widest text-brand-700 mb-3">{eyebrow}</p> : null}
      <h2 className="text-3xl sm:text-4xl font-bold text-ink tracking-tight">{title}</h2>
      {subtitle ? <p className="mt-3 text-ink/65 leading-relaxed">{subtitle}</p> : null}
    </div>
  )
}

export function SurfaceSection({ children, className = '' }) {
  return <section className={`py-14 sm:py-16 ${className}`.trim()}>{children}</section>
}

export function SoftCard({ children, className = '' }) {
  return (
    <div className={`rounded-2xl border border-fog bg-surface shadow-[0_1px_0_rgba(15,23,42,0.02)] ${className}`.trim()}>
      {children}
    </div>
  )
}

export function FeatureGrid({ items = [] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <SoftCard key={item.title} className="p-5">
          <p className="text-sm font-semibold text-ink mb-2">{item.title}</p>
          <p className="text-sm text-ink/65 leading-relaxed">{item.body}</p>
        </SoftCard>
      ))}
    </div>
  )
}

export function ScreenshotFrame({ src, alt, className = '' }) {
  return (
    <SoftCard className={`overflow-hidden ${className}`.trim()}>
      <div className="h-8 border-b border-fog bg-mist px-3 flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-red-300" />
        <span className="w-2 h-2 rounded-full bg-amber-300" />
        <span className="w-2 h-2 rounded-full bg-green-300" />
      </div>
      <img src={src} alt={alt} className="w-full h-full object-cover" />
    </SoftCard>
  )
}

export function CtaBand({ title, body, primary, secondary }) {
  return (
    <SoftCard className="p-7 sm:p-9 bg-gradient-to-r from-brand-50 via-surface to-emerald-50">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-2xl sm:text-3xl font-bold text-ink tracking-tight">{title}</h3>
          <p className="mt-2 text-ink/65">{body}</p>
        </div>
        <div className="flex flex-wrap gap-3">{primary}{secondary}</div>
      </div>
    </SoftCard>
  )
}

export function PrimaryCta({ to, children }) {
  return (
    <Link to={to} className="inline-flex items-center justify-center rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold text-sm px-5 py-3 transition-colors">
      {children}
    </Link>
  )
}

export function SecondaryCta({ to, children }) {
  return (
    <Link to={to} className="inline-flex items-center justify-center rounded-xl border border-fog bg-surface hover:bg-mist text-ink/80 font-semibold text-sm px-5 py-3 transition-colors">
      {children}
    </Link>
  )
}
