export function LogoMark({ size = 28, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" className={className}>
      <rect width="28" height="28" rx="8" fill="#10A37F" />
      <rect x="6.25" y="8" width="9.2" height="12.2" rx="2.1" transform="rotate(-8 10.85 14.1)" fill="rgba(255,255,255,0.86)" />
      <rect x="12.55" y="7.8" width="9.2" height="12.2" rx="2.1" transform="rotate(8 17.15 13.9)" fill="white" />
      <path d="M13.85 10.2h1.9" stroke="rgba(16,163,127,0.32)" strokeWidth="0.9" strokeLinecap="round" />
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
