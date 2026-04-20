import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Download, Zap, Calendar, Heart, BarChart3, Shield, Users, Check, ArrowRight, Star, Globe2, Layers, ChevronRight } from 'lucide-react'

const SLIDE_STYLES = `
  @media print {
    .no-print { display: none !important; }
    .slide { page-break-after: always; page-break-inside: avoid; }
    .slide:last-child { page-break-after: avoid; }
    body { background: white !important; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }
`

const BRAND = '#10A37F'
const TEAL  = '#43B89C'
const DARK  = '#0D0D1A'
const CARD  = '#13131F'

export default function PitchDeckPage() {
  const marketingLightThemeVars = {
    '--cc-ink-rgb': '15 23 42',
    '--cc-fog-rgb': '229 231 235',
    '--cc-mist-rgb': '247 247 248',
    '--cc-surface-rgb': '255 255 255',
    '--cc-page-rgb': '255 255 255',
  }

  useEffect(() => {
    document.title = 'ContentCard: Pitch Deck'
    return () => { document.title = 'ContentCard' }
  }, [])

  const handlePrint = () => window.print()

  return (
    <div style={{ ...marketingLightThemeVars, fontFamily: "'Inter', system-ui, sans-serif", background: '#f4f4f8', minHeight: '100vh' }}>
      <style>{SLIDE_STYLES}</style>

      {/* Nav bar: hidden on print */}
      <div className="no-print" style={{ background: DARK, padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <Link to="/" style={{ color: 'rgba(255,255,255,0.6)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
          <ArrowLeft size={15} /> Back to ContentCard
        </Link>
        <button onClick={handlePrint}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', background: BRAND, color: 'white', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          <Download size={14} /> Download PDF
        </button>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px 80px' }}>

        {/* ── SLIDE 1: Cover ── */}
        <Slide>
          <div style={{ background: `linear-gradient(135deg, ${DARK} 0%, #1a1535 50%, ${DARK} 100%)`, borderRadius: 20, padding: '72px 64px', textAlign: 'center', position: 'relative', overflow: 'hidden', minHeight: 480 }}>
            <div style={{ position: 'absolute', top: -60, left: -60, width: 300, height: 300, borderRadius: '50%', background: `radial-gradient(circle, ${BRAND}22 0%, transparent 70%)` }} />
            <div style={{ position: 'absolute', bottom: -40, right: -40, width: 250, height: 250, borderRadius: '50%', background: `radial-gradient(circle, ${TEAL}22 0%, transparent 70%)` }} />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
                <div style={{ width: 40, height: 40, background: BRAND, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Zap size={22} color="white" />
                </div>
                <span style={{ color: 'white', fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em' }}>ContentCard</span>
              </div>
              <h1 style={{ color: 'white', fontSize: 42, fontWeight: 900, lineHeight: 1.15, letterSpacing: '-0.03em', marginBottom: 20, margin: '0 0 20px' }}>
                AI-Powered Social Content.<br />
                <span style={{ background: `linear-gradient(90deg, ${BRAND}, ${TEAL})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Built for Growing Businesses.</span>
              </h1>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 17, maxWidth: 520, margin: '0 auto 40px', lineHeight: 1.6 }}>
                Generate a full month of on-brand social media content: captions, hashtags, and a publishing calendar: in under 60 seconds.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                {['Seed / Series A', 'April 2026', 'Confidential'].map(t => (
                  <span key={t} style={{ padding: '6px 16px', background: 'rgba(255,255,255,0.08)', borderRadius: 20, color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 600, border: '1px solid rgba(255,255,255,0.1)' }}>{t}</span>
                ))}
              </div>
            </div>
          </div>
        </Slide>

        {/* ── SLIDE 2: Problem ── */}
        <Slide label="The Problem">
          <SlideHeader label="01" title="Social media is a full-time job. Most businesses can't keep up." />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 32 }}>
            {[
              { n: '72%', d: 'of small businesses say they don\'t post consistently because they run out of ideas or time' },
              { n: '5h+', d: 'average hours per week a business owner spends on content creation, with mixed results' },
              { n: '$3k+', d: 'average monthly cost of hiring a social media manager or creative agency per brand' },
            ].map(({ n, d }) => (
              <div key={n} style={{ background: 'white', border: '1px solid #e8e8f0', borderRadius: 14, padding: '24px 20px', textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                <div style={{ fontSize: 36, fontWeight: 900, color: BRAND, letterSpacing: '-0.03em', marginBottom: 8 }}>{n}</div>
                <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>{d}</div>
              </div>
            ))}
          </div>
          <div style={{ background: '#fef3f2', border: '1px solid #fde8e6', borderRadius: 14, padding: '20px 24px' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f87171', marginTop: 6, flexShrink: 0 }} />
              <p style={{ color: '#7f1d1d', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
                <strong>The real cost isn't just money: it's lost momentum.</strong> When businesses post inconsistently, their algorithm reach collapses. The average business loses 40% of their organic reach after just 2 weeks of inactivity.
              </p>
            </div>
          </div>
        </Slide>

        {/* ── SLIDE 3: Solution ── */}
        <Slide label="The Solution">
          <SlideHeader label="02" title="ContentCard: your AI content team, available 24/7." accent={TEAL} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div style={{ background: `linear-gradient(135deg, ${DARK}, #1a1535)`, borderRadius: 16, padding: 28, color: 'white' }}>
              <p style={{ fontSize: 15, lineHeight: 1.7, color: 'rgba(255,255,255,0.7)', marginBottom: 20, margin: '0 0 20px' }}>
                ContentCard learns your brand voice, your audience, and your goals: then generates a complete month of social content in seconds, not days.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  'Full month calendars generated in ~60 seconds',
                  'Captions that sound like your brand, not a robot',
                  'Hashtags researched and tailored per post',
                  'Instagram, Facebook & Twitter in one workflow',
                  'Country-aware holiday scheduling built in',
                ].map(item => (
                  <div key={item} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <Check size={14} color={TEAL} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { emoji: '⚡', title: 'Setup in 5 minutes', body: 'Enter your brand details once. ContentCard remembers your voice forever.' },
                { emoji: '🎯', title: 'Content that converts', body: 'AI-trained on high-performing content from your industry and region.' },
                { emoji: '📅', title: 'Full calendar view', body: 'Visual calendar with edit, approve, and copy-to-clipboard for each post.' },
              ].map(({ emoji, title, body }) => (
                <div key={title} style={{ background: 'white', border: '1px solid #e8e8f0', borderRadius: 12, padding: '16px 18px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                  <div style={{ fontSize: 20, marginBottom: 6 }}>{emoji}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>{title}</div>
                  <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>{body}</div>
                </div>
              ))}
            </div>
          </div>
        </Slide>

        {/* ── SLIDE 4: How It Works ── */}
        <Slide label="How It Works">
          <SlideHeader label="03" title="Three steps to a month of content." />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 24 }}>
            {[
              { step: '01', icon: Heart, title: 'Build your brand kit', body: 'Add your brand name, industry, tone, voice guidelines, target audience and brand colors. ContentCard saves it all and uses it on every generation.' },
              { step: '02', icon: Zap, title: 'Generate a month', body: 'Pick your platforms, month, and optional topic focus. Hit Generate: the AI writes every caption, adds hashtags, and lays it all out in a calendar.' },
              { step: '03', icon: Calendar, title: 'Publish or export', body: 'Review your content in the visual calendar. Edit any post, mark it ready, copy to clipboard, or regenerate individual captions. Then post.' },
            ].map(({ step, icon: Icon, title, body }) => (
              <div key={step} style={{ background: 'white', border: '1px solid #e8e8f0', borderRadius: 14, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.04)', position: 'relative' }}>
                <div style={{ position: 'absolute', top: 16, right: 16, fontSize: 11, fontWeight: 800, color: '#cbd5e1' }}>{step}</div>
                <div style={{ width: 40, height: 40, background: `${BRAND}15`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                  <Icon size={20} color={BRAND} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>{title}</div>
                <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>{body}</div>
              </div>
            ))}
          </div>
          <div style={{ background: `${BRAND}0d`, border: `1px solid ${BRAND}30`, borderRadius: 12, padding: '14px 20px', textAlign: 'center' }}>
            <span style={{ color: BRAND, fontSize: 13, fontWeight: 600 }}>⏱ Average time from sign-up to first published post: <strong>under 10 minutes</strong></span>
          </div>
        </Slide>

        {/* ── SLIDE 5: Features ── */}
        <Slide label="Key Features">
          <SlideHeader label="04" title="Everything your content team needs: in one platform." />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {[
              { icon: Zap,       color: BRAND,   title: 'AI Month Generator',       body: 'Generate 20 to 30 posts across all platforms in a single click. Each post tailored to your brand voice and monthly focus.' },
              { icon: Calendar,  color: '#f59e0b', title: 'Visual Content Calendar', body: 'Drag-and-view calendar with holiday overlays, platform filters, and inline editing. Never miss a date.' },
              { icon: Heart,     color: '#ec4899', title: 'Brand Kit Memory',        body: 'AI remembers your tone, fonts, colours, words to avoid, and guidelines. Every output sounds unmistakably like you.' },
              { icon: Globe2,    color: TEAL,    title: 'Multi-Country Holidays',    body: '30+ countries. Global + local holidays automatically shown on your calendar. Dismiss any you don\'t need.' },
              { icon: Users,     color: '#8b5cf6', title: 'Team Collaboration',      body: 'Invite your team with roles: owner, admin, editor, viewer, approver. Full workspace-level access control.' },
              { icon: Shield,    color: '#10b981', title: 'Compliance Assistant',    body: 'Automatic disclosure suggestions, industry-specific disclaimers, and platform policy flags per post.' },
              { icon: BarChart3, color: '#f97316', title: 'Template Library',        body: 'Global and custom templates: Product Launch, Client Win, Weekly Tips, Flash Sale, and more.' },
              { icon: Layers,    color: '#06b6d4', title: 'Photo Caption Generator', body: 'Describe a photo in 20 words. Get a platform-ready caption with hashtags, mood, and brand voice: instantly.' },
            ].map(({ icon: Icon, color, title, body }) => (
              <div key={title} style={{ display: 'flex', gap: 14, padding: '16px 18px', background: 'white', border: '1px solid #e8e8f0', borderRadius: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
                <div style={{ width: 36, height: 36, background: `${color}15`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                  <Icon size={17} color={color} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>{title}</div>
                  <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>{body}</div>
                </div>
              </div>
            ))}
          </div>
        </Slide>

        {/* ── SLIDE 6: Market ── */}
        <Slide label="Target Market">
          <SlideHeader label="05" title="A massive, underserved market of time-poor business owners." />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
            {[
              { segment: 'Startups & Scaleups', icon: '🚀', desc: 'Lean teams needing to build brand presence fast without hiring a full marketing team.', size: '4.4M companies' },
              { segment: 'SMEs & Entrepreneurs', icon: '🏪', desc: 'Business owners in Africa, Southeast Asia, and emerging markets who post manually and inconsistently.', size: '$22B market' },
              { segment: 'Marketing Agencies', icon: '🎯', desc: 'Agencies managing 10 to 50 client brands who need to scale content production without scaling headcount.', size: '500K+ agencies' },
            ].map(({ segment, icon, desc, size }) => (
              <div key={segment} style={{ background: 'white', border: '1px solid #e8e8f0', borderRadius: 14, padding: 22, boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>{icon}</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>{segment}</div>
                <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5, marginBottom: 12 }}>{desc}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: BRAND, background: `${BRAND}10`, padding: '4px 10px', borderRadius: 20, display: 'inline-block' }}>{size}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ background: `linear-gradient(135deg, ${BRAND}10, ${TEAL}10)`, border: `1px solid ${BRAND}20`, borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: BRAND, marginBottom: 4 }}>$14.9B</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Global social media management market (2024), growing at 23% CAGR</div>
            </div>
            <div style={{ background: `linear-gradient(135deg, ${TEAL}10, ${BRAND}10)`, border: `1px solid ${TEAL}20`, borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: TEAL, marginBottom: 4 }}>Africa-First</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Built for Nigeria and African markets first: where the gap between need and tooling is largest</div>
            </div>
          </div>
        </Slide>

        {/* ── SLIDE 7: Business Model ── */}
        <Slide label="Business Model">
          <SlideHeader label="06" title="Simple SaaS pricing. Growing with your customers." />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
            {[
              { name: 'Starter', price: '$19', period: '/mo', color: '#64748b', features: ['1 brand', '3 platforms', '30 posts/mo', 'Photo captions', 'Brand kit', 'Email support'], highlight: false },
              { name: 'Business', price: '$49', period: '/mo', color: BRAND, features: ['5 brands', '3 platforms', 'Unlimited posts', 'Team (3 users)', 'Templates', 'Priority support'], highlight: true },
              { name: 'Enterprise', price: 'Custom', period: '', color: TEAL, features: ['Unlimited brands', 'Custom integrations', 'Dedicated CSM', 'SLA guarantees', 'Custom templates', 'White-label option'], highlight: false },
            ].map(({ name, price, period, color, features, highlight }) => (
              <div key={name} style={{ background: highlight ? `linear-gradient(135deg, ${DARK}, #1a1535)` : 'white', border: highlight ? `2px solid ${BRAND}` : '1px solid #e8e8f0', borderRadius: 16, padding: 24, boxShadow: highlight ? `0 8px 32px ${BRAND}25` : '0 2px 12px rgba(0,0,0,0.04)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: highlight ? 'rgba(255,255,255,0.6)' : '#64748b', marginBottom: 8 }}>{name}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, marginBottom: 20 }}>
                  <span style={{ fontSize: 30, fontWeight: 900, color: highlight ? 'white' : '#0f172a', letterSpacing: '-0.03em' }}>{price}</span>
                  <span style={{ fontSize: 13, color: highlight ? 'rgba(255,255,255,0.4)' : '#94a3b8' }}>{period}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {features.map(f => (
                    <div key={f} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <Check size={12} color={color} />
                      <span style={{ fontSize: 12, color: highlight ? 'rgba(255,255,255,0.7)' : '#475569' }}>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ background: '#fafafa', border: '1px solid #e8e8f0', borderRadius: 12, padding: '14px 20px', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {[['14-day free trial', 'No card required'],['Paystack for Africa', 'Stripe for global'],['Annual billing', '20% discount'],['99.9% uptime SLA', 'Enterprise tier']].map(([a, b]) => (
              <div key={a}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{a}</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>{b}</div>
              </div>
            ))}
          </div>
        </Slide>

        {/* ── SLIDE 8: Traction ── */}
        <Slide label="Why Now">
          <SlideHeader label="07" title="The timing has never been better." />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { title: 'AI is production-ready', body: 'Claude Sonnet & GPT-4 have crossed the quality threshold for brand-safe content. Captions are now indistinguishable from human-written.' },
                { title: 'African digital commerce is booming', body: 'Nigeria alone has 33M+ social media users. SME digital spend grew 67% in 2023. The market is here, it\'s just underserved.' },
                { title: 'Content costs are unsustainable', body: 'Agency costs are rising while AI costs are falling. The arbitrage window is open right now.' },
                { title: 'First-mover advantage in key markets', body: 'No AI-native content platform is built for African market nuances: pidgin, local holidays, local industry context.' },
              ].map(({ title, body }) => (
                <div key={title} style={{ display: 'flex', gap: 12 }}>
                  <div style={{ width: 6, background: BRAND, borderRadius: 3, flexShrink: 0, marginTop: 3 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 3 }}>{title}</div>
                    <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>{body}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ background: `linear-gradient(135deg, ${DARK}, #1a1535)`, borderRadius: 16, padding: 28 }}>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 20 }}>ContentCard advantage</div>
              {[
                ['Language-aware AI', 'Nigerian English, Pidgin, code-switching'],
                ['Country-specific holidays', '30+ countries, pre-loaded'],
                ['Industry-tuned prompts', 'Church, finance, fashion, tech…'],
                ['Compliance built-in', 'FTC, NDPC, platform policies'],
                ['Paystack integration', 'Local payment for Africa'],
              ].map(([feat, detail]) => (
                <div key={feat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>{feat}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textAlign: 'right', maxWidth: 140 }}>{detail}</div>
                </div>
              ))}
            </div>
          </div>
        </Slide>

        {/* ── SLIDE 9: What to Expect ── */}
        <Slide label="For Your Team">
          <SlideHeader label="08" title="What ContentCard delivers for your business." />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            {[
              { metric: '10 min', label: 'To your first generated calendar', icon: '⚡' },
              { metric: '20 to 30', label: 'Posts generated per month per brand', icon: '📝' },
              { metric: '60 sec', label: 'Average generation time for a full month', icon: '⏱' },
              { metric: '3 hrs', label: 'Saved per week vs. manual content creation', icon: '🕐' },
            ].map(({ metric, label, icon }) => (
              <div key={metric} style={{ background: 'white', border: '1px solid #e8e8f0', borderRadius: 14, padding: '20px 24px', display: 'flex', gap: 16, alignItems: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
                <div style={{ fontSize: 28 }}>{icon}</div>
                <div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: BRAND, letterSpacing: '-0.03em', lineHeight: 1 }}>{metric}</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{label}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ background: 'white', border: '1px solid #e8e8f0', borderRadius: 14, padding: '24px 28px', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 16 }}>ContentCard replaces or reduces reliance on:</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              {[
                ['Social media managers', '$2,500 to 5,000/mo', '#fef3f2'],
                ['Content agencies', '$3,000 to 8,000/mo', '#fff7ed'],
                ['Freelance copywriters', '$800 to 2,000/mo', '#fefce8'],
              ].map(([role, cost, bg]) => (
                <div key={role} style={{ background: bg, borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>{role}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', textDecoration: 'line-through' }}>{cost}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: BRAND, marginTop: 4 }}>→ $19 to 49/mo</div>
                </div>
              ))}
            </div>
          </div>
        </Slide>

        {/* ── SLIDE 10: CTA ── */}
        <Slide>
          <div style={{ background: `linear-gradient(135deg, ${DARK} 0%, #1a1535 100%)`, borderRadius: 20, padding: '64px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -80, right: -80, width: 350, height: 350, borderRadius: '50%', background: `radial-gradient(circle, ${BRAND}18 0%, transparent 70%)` }} />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ display: 'inline-block', padding: '6px 16px', background: `${TEAL}20`, border: `1px solid ${TEAL}40`, borderRadius: 20, color: TEAL, fontSize: 12, fontWeight: 700, marginBottom: 24 }}>
                Let's get started
              </div>
              <h2 style={{ color: 'white', fontSize: 36, fontWeight: 900, letterSpacing: '-0.03em', marginBottom: 16, margin: '0 0 16px' }}>
                Ready to transform your<br />social media strategy?
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 15, marginBottom: 40, margin: '0 0 40px' }}>
                Start your 14-day free trial today. No credit card required.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 48, flexWrap: 'wrap' }}>
                <a href="https://contentcard-1.onrender.com/signup" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 28px', background: BRAND, color: 'white', textDecoration: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700 }}>
                  Start free trial <ArrowRight size={15} />
                </a>
                <a href="https://contentcard-1.onrender.com" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 28px', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', textDecoration: 'none', borderRadius: 12, fontSize: 14, fontWeight: 600, border: '1px solid rgba(255,255,255,0.12)' }}>
                  View live demo
                </a>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, maxWidth: 480, margin: '0 auto' }}>
                {[['hellovoya@gmail.com', 'Email us'],['contentcard-1.onrender.com', 'Live product'],['14-day trial', 'No card needed']].map(([val, label]) => (
                  <div key={val} style={{ padding: '12px', background: 'rgba(255,255,255,0.04)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.6)', marginBottom: 2 }}>{val}</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Slide>

      </div>
    </div>
  )
}

function Slide({ children, label }) {
  return (
    <div className="slide" style={{ marginBottom: 32, background: 'white', borderRadius: 20, padding: 32, boxShadow: '0 4px 24px rgba(0,0,0,0.06)', border: '1px solid #e8e8f0' }}>
      {label && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{ width: 3, height: 14, background: BRAND, borderRadius: 2 }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</span>
        </div>
      )}
      {children}
    </div>
  )
}

function SlideHeader({ label, title, accent = BRAND }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: accent, letterSpacing: '0.08em', textTransform: 'uppercase', marginRight: 10 }}>{label}</span>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', lineHeight: 1.3, margin: '8px 0 0', display: 'inline' }}>{title}</h2>
    </div>
  )
}
