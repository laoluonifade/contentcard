export function LogoMark({ size = 28, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" className={className}>
      <rect width="28" height="28" rx="8" fill="#10A37F"/>
      <path d="M19 7H12C10.9 7 10 7.9 10 9v3h2.5V9.5h6L16 14h3l-2.5 7.5H10V23h6.5c.7 0 1.3-.4 1.6-1L21 13c.3-.8-.3-1.5-1.1-1.5H16L17.5 7H19z" fill="white"/>
      <path d="M10 17v2.5h6l-.8 2.5H10V24h5.5c.7 0 1.3-.4 1.6-1l1-3H10z" fill="rgba(255,255,255,0.35)"/>
    </svg>
  )
}

export function LogoFull({ size = 28, dark = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <span
        className={`font-bold tracking-tight ${dark ? 'text-white' : 'text-[#0F172A]'}`}
        style={{ fontSize: size * 0.57, letterSpacing: '-0.02em' }}
      >
        ContentCard
      </span>
    </div>
  )
}
