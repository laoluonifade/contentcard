// Demo data shown to logged-out visitors so the dashboard isn't an empty shell.
// All actions on demo data are intercepted by the auth gate in DashboardLayout
// and redirected to /signup, so nothing here ever hits the API.

export const DEMO_WORKSPACE = {
  id: 'demo-workspace',
  name: 'Acme Coffee (Demo)',
  effective_plan: 'pro',
  plan: 'pro',
  brand_count: 1,
}

export const DEMO_BRAND = {
  id: 'demo-brand',
  workspace_id: DEMO_WORKSPACE.id,
  name: 'Acme Coffee',
  industry: 'Food & Beverage',
  voice: 'Warm, friendly, a little playful',
  description: 'A neighborhood specialty coffee roaster in Brooklyn.',
  target_audience: 'Coffee enthusiasts in NYC, ages 25-45',
  brand_colors: ['#6F4E37', '#D2B48C', '#FFF8E7'],
}

export const DEMO_TRENDS = [
  { id: 't1', title: 'Cozy fall lattes', summary: 'Pumpkin spice + maple cinnamon are trending again.', score: 92, source: 'TikTok' },
  { id: 't2', title: '"What I drink in a day" reels', summary: 'Day-in-the-life cafe content is up 38% this week.', score: 87, source: 'Instagram' },
  { id: 't3', title: 'Latte art tutorials', summary: 'Beginner-friendly tutorials get 3x the saves.', score: 81, source: 'YouTube' },
  { id: 't4', title: 'Local roaster spotlight', summary: 'Behind-the-scenes from indie cafes are resonating.', score: 76, source: 'Instagram' },
  { id: 't5', title: 'Morning routine carousels', summary: 'Aesthetic morning routines featuring coffee shops.', score: 71, source: 'Pinterest' },
]

const DEMO_TEMPLATES_BASE = [
  { id: 'tpl-1', name: 'Product Spotlight', description: 'Square post highlighting a single product with brand colors.' },
  { id: 'tpl-2', name: 'Behind the Counter', description: '4-slide carousel telling a short story from the cafe.' },
  { id: 'tpl-3', name: 'Customer Quote', description: 'Bold typography over a brand-color background.' },
  { id: 'tpl-4', name: 'Weekly Special', description: 'Promotional post for limited-time menu items.' },
]
export const DEMO_TEMPLATES = DEMO_TEMPLATES_BASE.map((t) => ({
  ...t,
  brand_id: DEMO_BRAND.id,
  workspace_id: DEMO_WORKSPACE.id,
  created_at: new Date().toISOString(),
}))

const PLATFORMS = ['instagram', 'instagram', 'instagram', 'facebook', 'twitter', 'linkedin']

const POST_IDEAS = [
  { idea: 'Morning ritual: pour-over walkthrough', caption: "There's no better way to start the day. Pour-over takes 4 minutes and transforms your morning. ☕", hashtags: ['pourover', 'morningroutine', 'specialtycoffee'], slides: 1 },
  { idea: 'New seasonal: maple cinnamon latte', caption: 'It\'s here. Maple cinnamon, all October long. Stop by before noon and your second drink is half off.', hashtags: ['fall', 'newdrink', 'brooklyncoffee'], slides: 1 },
  { idea: 'Behind the bar: meet our head barista', caption: 'Meet Jamie — 6 years pulling the perfect shot. Ask them about their favorite single-origin.', hashtags: ['baristalife', 'specialtycoffee'], slides: 4 },
  { idea: 'Customer love: weekend regulars', caption: 'Saturday mornings hit different when our regulars roll in. Tag your weekend coffee crew.', hashtags: ['communitycoffee', 'weekend'], slides: 1 },
  { idea: 'Behind the roast: this week\'s beans', caption: 'Fresh batch of Ethiopia Yirgacheffe in. Notes of blueberry, jasmine, and a clean finish.', hashtags: ['roaster', 'singleorigin'], slides: 1 },
  { idea: 'Latte art tutorial: the rosetta', caption: 'The rosetta is the gateway to latte art. Pour low, tilt the cup, and let the foam do the work.', hashtags: ['latteart', 'tutorial'], slides: 4 },
  { idea: 'Open mic night Thursday', caption: 'Acoustic sets, open mic, free espresso for performers. Doors at 7pm Thursday.', hashtags: ['brooklynevents', 'openmic'], slides: 1 },
  { idea: 'Weekend brunch menu drop', caption: 'New brunch menu starts Saturday: avocado toast, miso eggs, and our famous cardamom buns.', hashtags: ['brunch', 'newmenu'], slides: 3 },
  { idea: 'Sustainability: where our beans come from', caption: 'We trace every bag back to the farm. This is our partnership with Finca La Esperanza in Colombia.', hashtags: ['sustainability', 'directtrade'], slides: 1 },
  { idea: 'Quick tip: storing coffee at home', caption: 'Pro tip: keep beans in an airtight container at room temp. Skip the freezer — it kills the oils.', hashtags: ['coffeetips'], slides: 1 },
]

// Tailwind brand-color CSS gradients used in lieu of remote images so demo
// state never depends on the network.
const GRADIENT_BACKGROUNDS = [
  'linear-gradient(135deg,#6F4E37 0%,#D2B48C 100%)',
  'linear-gradient(135deg,#3E2723 0%,#8D6E63 100%)',
  'linear-gradient(135deg,#FFF8E7 0%,#D2B48C 100%)',
  'linear-gradient(135deg,#A1887F 0%,#FFF8E7 100%)',
  'linear-gradient(135deg,#5D4037 0%,#FFCC80 100%)',
  'linear-gradient(135deg,#4E342E 0%,#A1887F 100%)',
]

function gradientToDataUri(gradient, label) {
  const safeLabel = label.replace(/[^A-Za-z0-9 ]/g, '').slice(0, 28)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">${
    gradient.match(/#[0-9A-Fa-f]{6}/g)?.map((c, i, arr) => `<stop offset="${(i / Math.max(1, arr.length - 1)) * 100}%" stop-color="${c}"/>`).join('') || ''
  }</linearGradient></defs><rect width="600" height="600" fill="url(#g)"/><text x="300" y="305" text-anchor="middle" dominant-baseline="middle" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="36" font-weight="700" fill="rgba(255,255,255,0.92)">${safeLabel}</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

// Build ~10 posts spread across the given month/year on weekdays.
export function buildDemoMonthContent(month, year) {
  const daysInMonth = new Date(year, month, 0).getDate()
  const targetDays = []
  for (let d = 2; d <= daysInMonth && targetDays.length < POST_IDEAS.length; d += 3) {
    targetDays.push(d)
  }
  return targetDays.map((day, i) => {
    const idea = POST_IDEAS[i % POST_IDEAS.length]
    const platform = PLATFORMS[i % PLATFORMS.length]
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const gradient = GRADIENT_BACKGROUNDS[i % GRADIENT_BACKGROUNDS.length]
    const imageUrl = gradientToDataUri(gradient, idea.idea.split(':')[0])
    return {
      id: `demo-post-${month}-${year}-${i}`,
      brand_id: DEMO_BRAND.id,
      workspace_id: DEMO_WORKSPACE.id,
      platform,
      scheduled_date: iso,
      content_idea: idea.idea,
      topic: idea.idea,
      caption: idea.caption,
      hashtags: idea.hashtags,
      image_url: imageUrl,
      image_urls: [imageUrl],
      slide_count: idea.slides,
      status: 'ready',
      is_demo: true,
    }
  })
}

export function buildDemoContentByMonth(refDate = new Date()) {
  const m = refDate.getMonth() + 1
  const y = refDate.getFullYear()
  const prevMonthDate = new Date(y, m - 2, 1)
  const nextMonthDate = new Date(y, m, 1)
  return {
    [`${y}-${m}`]: buildDemoMonthContent(m, y),
    [`${prevMonthDate.getFullYear()}-${prevMonthDate.getMonth() + 1}`]: buildDemoMonthContent(prevMonthDate.getMonth() + 1, prevMonthDate.getFullYear()),
    [`${nextMonthDate.getFullYear()}-${nextMonthDate.getMonth() + 1}`]: buildDemoMonthContent(nextMonthDate.getMonth() + 1, nextMonthDate.getFullYear()),
  }
}
