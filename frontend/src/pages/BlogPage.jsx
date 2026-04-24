import { ArrowRight } from 'lucide-react'
import MarketingLayout from '../components/layout/MarketingLayout'
import {
  HeroSection,
  MarketingContainer,
  PrimaryCta,
  SoftCard,
  SurfaceSection,
} from '../components/marketing/MarketingPrimitives'

const POSTS = [
  { tag: 'Strategy',   title: 'How Nigerian brands are using AI to cut content costs by 70%',        date: 'Apr 10, 2026', img: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&auto=format&fit=crop&q=80', featured: true },
  { tag: 'Guide',      title: '5 social media mistakes enterprise teams make (and how to fix them)',  date: 'Apr 3, 2026',  img: 'https://images.unsplash.com/photo-1434626881859-194d67b2b86f?w=600&auto=format&fit=crop&q=80' },
  { tag: 'Trends',     title: 'The 2026 social media trends every African brand needs to know',       date: 'Mar 28, 2026', img: 'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=600&auto=format&fit=crop&q=80' },
  { tag: 'Case Study', title: 'How Blaze Digital Agency scaled to 17 clients with one tool',         date: 'Mar 20, 2026', img: 'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=600&auto=format&fit=crop&q=80' },
  { tag: 'Product',    title: 'New: approval workflows and multi-brand dashboards are here',         date: 'Mar 12, 2026', img: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=600&auto=format&fit=crop&q=80' },
  { tag: 'Guide',      title: 'Building a brand voice that AI can replicate: a practical guide',   date: 'Mar 5, 2026',  img: 'https://images.unsplash.com/photo-1506784983877-45594efa4cbe?w=600&auto=format&fit=crop&q=80' },
]

export default function BlogPage() {
  const [featured, ...rest] = POSTS
  return (
    <MarketingLayout>
      <HeroSection
        eyebrow="Blog"
        title={<>Resources for social media operators</>}
        subtitle="Strategy, practical playbooks, and product updates from the ContentCard team."
      />
      <SurfaceSection className="pt-0">
        <MarketingContainer>
          <SoftCard className="grid lg:grid-cols-2 overflow-hidden mb-10 group cursor-pointer">
            <img src={featured.img} alt={featured.title} className="w-full h-64 lg:h-full object-cover group-hover:scale-105 transition-transform duration-500" />
            <div className="p-8 flex flex-col justify-center">
              <span className="text-brand-500 text-xs font-bold uppercase tracking-widest mb-4">{featured.tag} · Featured</span>
              <h2 className="text-2xl font-bold text-ink mb-4 leading-snug">{featured.title}</h2>
              <p className="text-ink/45 text-sm mb-6">{featured.date}</p>
              <PrimaryCta to="/contact">Read article <ArrowRight size={14} className="ml-1" /></PrimaryCta>
            </div>
          </SoftCard>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {rest.map(({ tag, title, date, img }) => (
              <SoftCard key={title} className="overflow-hidden cursor-pointer group">
                <img src={img} alt={title} className="w-full h-44 object-cover group-hover:scale-105 transition-transform duration-500" />
                <div className="p-5">
                  <span className="text-brand-500 text-[10px] font-bold uppercase tracking-widest">{tag}</span>
                  <h3 className="font-bold text-ink text-sm mt-2 mb-3 leading-snug">{title}</h3>
                  <p className="text-ink/40 text-xs">{date}</p>
                </div>
              </SoftCard>
            ))}
          </div>
        </MarketingContainer>
      </SurfaceSection>
    </MarketingLayout>
  )
}
