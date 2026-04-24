import { useEffect, useState } from 'react'
import { Facebook, Instagram, Twitter } from 'lucide-react'

export default function AuthHeroCards() {
  const [activeCard, setActiveCard] = useState(0)
  const cards = [
    {
      platform: 'Instagram',
      handle: '@juicyjunction_',
      icon: Instagram,
      image: '/marketing-examples/juicy-jollof.png',
      status: 'Queued',
      time: 'Today · 6:30 PM',
      border: 'border-pink-200',
    },
    {
      platform: 'X',
      handle: '@uberlagos',
      icon: Twitter,
      image: '/marketing-examples/uber-ride.png',
      status: 'Ready',
      time: 'Today · 7:00 PM',
      border: 'border-slate-200',
    },
    {
      platform: 'Facebook',
      handle: 'Krispy Kreme NG',
      icon: Facebook,
      image: '/marketing-examples/krispy-fresh.png',
      status: 'Scheduled',
      time: 'Tomorrow · 9:00 AM',
      border: 'border-blue-200',
    },
  ]

  useEffect(() => {
    const iv = setInterval(() => {
      setActiveCard((prev) => (prev + 1) % cards.length)
    }, 3000)
    return () => clearInterval(iv)
  }, [cards.length])

  return (
    <div className="relative min-h-[330px] sm:min-h-[390px] w-full max-w-[500px]">
      {cards.map((card, idx) => {
        const Icon = card.icon
        const isActive = activeCard === idx
        return (
          <div
            key={card.platform}
            className={`absolute w-[84%] sm:w-[78%] rounded-2xl border ${card.border} bg-white shadow-[0_12px_34px_rgba(15,23,42,0.14)] overflow-hidden transition-all duration-700`}
            style={{
              top: `${idx * 48}px`,
              left: `${idx * 9}%`,
              transform: `translateY(${isActive ? '-8px' : '0px'}) rotate(${idx === 1 ? '-2.2deg' : idx === 2 ? '2.2deg' : '-1deg'}) scale(${isActive ? 1.02 : 1})`,
              zIndex: isActive ? 50 : 30 - idx,
              boxShadow: isActive ? '0 18px 45px rgba(16,185,129,0.25)' : undefined,
            }}
          >
            <div className="px-3.5 py-2.5 border-b border-fog flex items-center justify-between bg-mist/60">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-surface border border-fog flex items-center justify-center text-ink/70">
                  <Icon size={14} />
                </span>
                <div>
                  <p className="text-xs font-semibold text-ink">{card.platform}</p>
                  <p className="text-[10px] text-ink/45">{card.handle}</p>
                </div>
              </div>
              <span className="text-[10px] rounded-full px-2 py-0.5 bg-brand-50 text-brand-700 font-semibold">{card.status}</span>
            </div>
            <img src={card.image} alt={`${card.platform} example post`} className="w-full h-36 sm:h-44 object-cover" />
            <div className="px-3.5 py-2.5 border-t border-fog">
              <p className="text-[10px] uppercase tracking-widest text-ink/45 font-semibold">Caption preview</p>
              <p className="text-[11px] text-ink/70 mt-1 leading-relaxed">
                Created in ContentCard with brand-safe design and ready-to-post copy.
              </p>
              <p className="text-[10px] text-ink/45 mt-1.5">{card.time}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
