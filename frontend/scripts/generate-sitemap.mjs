import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SITE_URL = (process.env.VITE_SITE_URL || 'https://www.contentcard.co').replace(/\/+$/, '')
const OUTPUT_PATH = resolve(process.cwd(), 'public/sitemap.xml')

// `/` is the app entry (redirects into the dashboard) so it's intentionally
// not the SEO root. The marketing landing page lives at /about, which is what
// Google should treat as the brand-facing canonical.
const TODAY = new Date().toISOString().slice(0, 10)

const routes = [
  { path: '/about',                changefreq: 'weekly',  priority: '1.0' },
  { path: '/features',             changefreq: 'weekly',  priority: '0.9' },
  { path: '/pricing',              changefreq: 'weekly',  priority: '0.9' },
  { path: '/enterprise',           changefreq: 'weekly',  priority: '0.8' },
  { path: '/solutions/agencies',   changefreq: 'weekly',  priority: '0.8' },
  { path: '/solutions/startups',   changefreq: 'weekly',  priority: '0.8' },
  { path: '/solutions/corporate',  changefreq: 'weekly',  priority: '0.8' },
  { path: '/product-guide',        changefreq: 'weekly',  priority: '0.8' },
  { path: '/blog',                 changefreq: 'weekly',  priority: '0.8' },
  { path: '/changelog',            changefreq: 'weekly',  priority: '0.7' },
  { path: '/roadmap',              changefreq: 'weekly',  priority: '0.7' },
  { path: '/careers',              changefreq: 'weekly',  priority: '0.7' },
  { path: '/contact',              changefreq: 'monthly', priority: '0.6' },
  { path: '/pitch-deck',           changefreq: 'monthly', priority: '0.6' },
  { path: '/privacy',              changefreq: 'monthly', priority: '0.5' },
  { path: '/terms',                changefreq: 'monthly', priority: '0.5' },
  { path: '/security',             changefreq: 'monthly', priority: '0.5' },
  { path: '/support',              changefreq: 'monthly', priority: '0.5' },
]

const toLoc = (path) => `${SITE_URL}${path === '/' ? '/' : path}`

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes
  .map(
    (route) => `  <url>
    <loc>${toLoc(route.path)}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>
`

writeFileSync(OUTPUT_PATH, xml, 'utf8')
console.log(`Generated sitemap with ${routes.length} routes at ${OUTPUT_PATH}`)
