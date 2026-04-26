// Demo data shown to logged-out visitors so the dashboard isn't an empty shell.
// All actions on demo data are intercepted by the auth gate in DashboardLayout
// and redirected to /signup, so nothing here ever hits the API.

export const GUEST_PROFILE_KEY = 'cc:guest:profile:v1'

export const DEFAULT_GUEST_PROFILE = {
  brandName: 'Acme Coffee',
  website: 'acmecoffee.com',
  logoDataUrl: '',
  intent: null,
}

export function loadGuestProfile() {
  try {
    const raw = localStorage.getItem(GUEST_PROFILE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return { ...DEFAULT_GUEST_PROFILE, ...parsed }
  } catch {
    return null
  }
}

export function saveGuestProfile(profile) {
  try {
    localStorage.setItem(GUEST_PROFILE_KEY, JSON.stringify(profile))
  } catch {
    /* ignore storage errors */
  }
}

export function clearGuestProfile() {
  try {
    localStorage.removeItem(GUEST_PROFILE_KEY)
  } catch { /* ignore */ }
}

export const INTENT_OPTIONS = [
  {
    id: 'promote',
    label: 'Promote a product',
    description: 'Drive sales with focused product spotlights and offers.',
    emoji: '🛍️',
  },
  {
    id: 'announce',
    label: 'Announce something',
    description: 'Launch news, events, or updates with high-impact posts.',
    emoji: '📣',
  },
  {
    id: 'educate',
    label: 'Educate your audience',
    description: 'Tutorials, tips, and explainers that build authority.',
    emoji: '🎓',
  },
  {
    id: 'story',
    label: 'Tell your story',
    description: 'Behind-the-scenes, founder voice, and brand narrative.',
    emoji: '✨',
  },
]

const INTENT_POSTS = {
  promote: [
    { idea: 'Featured product: signature blend', caption: 'Our most-loved product is back in stock. Tap to grab yours before it sells out.', hashtags: ['newdrop', 'featured'], slides: 1 },
    { idea: 'Limited-time bundle deal', caption: 'Save 20% when you bundle this week\'s favorites. Through Sunday only.', hashtags: ['sale', 'bundle'], slides: 1 },
    { idea: 'Customer review carousel', caption: 'Real words from real customers. Swipe through five recent 5-star reviews.', hashtags: ['testimonials', 'happycustomers'], slides: 4 },
    { idea: 'Before / after results', caption: 'Three weeks. Real results. Tap to see the difference.', hashtags: ['results', 'transformation'], slides: 2 },
    { idea: 'Bestsellers of the month', caption: 'Top three sellers this month — and the stories behind why people love them.', hashtags: ['bestsellers'], slides: 3 },
    { idea: 'Flash sale: today only', caption: 'Today only. 30% off everything in the new collection. Use code FLASH30.', hashtags: ['flashsale', 'promo'], slides: 1 },
    { idea: 'Bundle and save', caption: 'Pair these two and save instantly at checkout. No code needed.', hashtags: ['deal'], slides: 1 },
    { idea: 'Free shipping weekend', caption: 'Free shipping on all orders this weekend. Time to restock.', hashtags: ['freeshipping'], slides: 1 },
    { idea: 'Featured in press', caption: 'Featured in this month\'s lineup. Tap to read why we made the list.', hashtags: ['press', 'asfeaturedin'], slides: 1 },
    { idea: 'Gift guide carousel', caption: 'Five gift-worthy picks under $50 — perfect for anyone on your list.', hashtags: ['giftguide'], slides: 5 },
  ],
  announce: [
    { idea: 'Big news coming Monday', caption: 'Something exciting drops Monday. Hit follow so you don\'t miss it.', hashtags: ['announcement', 'comingsoon'], slides: 1 },
    { idea: 'New product launch teaser', caption: 'After 8 months in the making — it\'s almost here. Are you ready?', hashtags: ['launch', 'newproduct'], slides: 1 },
    { idea: 'Event: open house this Saturday', caption: 'Open house Saturday from 10-4. Free samples, live music, no RSVP needed.', hashtags: ['event', 'openhouse'], slides: 1 },
    { idea: 'New location announcement', caption: 'We\'re opening a second spot. Tap for the new address and grand-opening details.', hashtags: ['expansion', 'newstore'], slides: 2 },
    { idea: 'Hiring announcement', caption: 'We\'re hiring. Three new roles open this week — tap to see who we\'re looking for.', hashtags: ['hiring', 'joinourteam'], slides: 1 },
    { idea: 'Partnership reveal', caption: 'A collab we\'ve been waiting to share. Stay tuned for next week\'s drop.', hashtags: ['collab', 'partnership'], slides: 1 },
    { idea: 'Award win', caption: 'We were just named Best in Class — thank you for voting and supporting us.', hashtags: ['award', 'thankyou'], slides: 1 },
    { idea: 'Holiday hours', caption: 'Updated hours for the upcoming holiday week. Save this post.', hashtags: ['hours', 'holidayhours'], slides: 1 },
    { idea: 'New feature drop', caption: 'A feature you\'ve been asking for is live. Here\'s what changed and how to use it.', hashtags: ['update', 'newfeature'], slides: 3 },
    { idea: 'Milestone: thank you', caption: 'We just hit a huge milestone — and it\'s because of you. Here\'s what\'s next.', hashtags: ['milestone', 'thankyou'], slides: 1 },
  ],
  educate: [
    { idea: 'How to choose the right product', caption: 'Three quick questions to help you pick the right one for you.', hashtags: ['guide', 'tips'], slides: 4 },
    { idea: 'Common mistake to avoid', caption: 'The #1 mistake we see beginners make — and what to do instead.', hashtags: ['tip', 'beginner'], slides: 1 },
    { idea: 'Industry myth busted', caption: 'You\'ve probably heard this. Here\'s why it\'s not true.', hashtags: ['mythbusting'], slides: 1 },
    { idea: 'Step-by-step tutorial', caption: 'Save this for later: a five-step walkthrough you can do in 10 minutes.', hashtags: ['tutorial', 'howto'], slides: 5 },
    { idea: 'Quick tip Tuesday', caption: 'A 30-second tip that will change how you think about this. Try it today.', hashtags: ['quicktip', 'tuesdaytip'], slides: 1 },
    { idea: 'Glossary: 5 terms you should know', caption: 'Five terms every new customer should understand. Bookmark this.', hashtags: ['education', 'glossary'], slides: 5 },
    { idea: 'Behind the science', caption: 'The why behind the how. A quick look at what makes this work.', hashtags: ['science', 'explainer'], slides: 3 },
    { idea: 'Before you buy: a checklist', caption: 'Save this 6-point checklist before your next purchase.', hashtags: ['checklist', 'guide'], slides: 1 },
    { idea: 'FAQ Friday', caption: 'The five questions we get asked most often, answered in one post.', hashtags: ['faq'], slides: 5 },
    { idea: 'Compare: option A vs option B', caption: 'A side-by-side breakdown of the two options people ask us about most.', hashtags: ['comparison'], slides: 2 },
  ],
  story: [
    { idea: 'How we got started', caption: 'The whole story, from a kitchen-table idea to where we are now.', hashtags: ['founderstory', 'origin'], slides: 4 },
    { idea: 'A day in the life', caption: 'Take a look at what an average Tuesday looks like behind the scenes.', hashtags: ['behindthescenes', 'dayinthelife'], slides: 1 },
    { idea: 'Meet the team', caption: 'The faces behind everything we do. Swipe to meet them.', hashtags: ['meettheteam'], slides: 4 },
    { idea: 'Our values in one post', caption: 'Three values that shape every decision we make. This is what we stand for.', hashtags: ['values', 'culture'], slides: 3 },
    { idea: 'Founder Q&A', caption: 'Five questions, five real answers from our founder.', hashtags: ['founder', 'qa'], slides: 5 },
    { idea: 'The hardest year', caption: 'A short look back at the year that almost broke us — and what we learned.', hashtags: ['lessonslearned', 'foundership'], slides: 1 },
    { idea: 'Where we make things', caption: 'A peek inside the workshop where everything you see here gets made.', hashtags: ['behindthescenes', 'maker'], slides: 1 },
    { idea: 'Customer spotlight', caption: 'Meet a customer whose story made our day. This is why we do this.', hashtags: ['customerspotlight'], slides: 1 },
    { idea: 'Why we chose this name', caption: 'The story behind our name — and what it means to us.', hashtags: ['storytime', 'branding'], slides: 1 },
    { idea: 'Our promise to you', caption: 'A short list of things we will always do, no matter how big we get.', hashtags: ['promise', 'values'], slides: 1 },
  ],
  default: [
    { idea: 'Morning ritual: pour-over walkthrough', caption: 'There\'s no better way to start the day. Pour-over takes 4 minutes and transforms your morning.', hashtags: ['morningroutine'], slides: 1 },
    { idea: 'New seasonal: maple cinnamon', caption: 'Maple cinnamon, all season long. Stop by before noon and your second drink is half off.', hashtags: ['fall', 'newdrink'], slides: 1 },
    { idea: 'Behind the bar', caption: 'Meet the team that makes the magic happen every morning.', hashtags: ['baristalife'], slides: 4 },
    { idea: 'Customer love: weekend regulars', caption: 'Saturday mornings hit different. Tag your weekend coffee crew.', hashtags: ['community'], slides: 1 },
    { idea: 'Behind the roast', caption: 'Fresh batch of single-origin in. Notes of blueberry, jasmine, and a clean finish.', hashtags: ['roaster'], slides: 1 },
    { idea: 'Latte art tutorial', caption: 'The rosetta is the gateway to latte art. Pour low, tilt the cup, and let the foam do the work.', hashtags: ['latteart', 'tutorial'], slides: 4 },
    { idea: 'Open mic Thursday', caption: 'Acoustic sets, open mic, free espresso for performers. Doors at 7pm Thursday.', hashtags: ['events'], slides: 1 },
    { idea: 'Weekend brunch menu drop', caption: 'New brunch menu starts Saturday. Three new dishes you\'ll want to try first.', hashtags: ['brunch', 'newmenu'], slides: 3 },
    { idea: 'Sustainability spotlight', caption: 'We trace every bag back to the farm. Here\'s how that partnership works.', hashtags: ['sustainability'], slides: 1 },
    { idea: 'Quick tip: storing coffee at home', caption: 'Keep beans in an airtight container at room temp. Skip the freezer — it kills the oils.', hashtags: ['coffeetips'], slides: 1 },
  ],
}

const PLATFORMS = ['instagram', 'instagram', 'instagram', 'facebook', 'twitter', 'linkedin']

const GRADIENT_BACKGROUNDS = [
  ['#6F4E37', '#D2B48C'],
  ['#3E2723', '#8D6E63'],
  ['#FFF8E7', '#D2B48C'],
  ['#A1887F', '#FFF8E7'],
  ['#5D4037', '#FFCC80'],
  ['#4E342E', '#A1887F'],
]

function gradientToDataUri([from, to], label) {
  const safeLabel = label.replace(/[^A-Za-z0-9 ]/g, '').slice(0, 28)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/></linearGradient></defs><rect width="600" height="600" fill="url(#g)"/><text x="300" y="305" text-anchor="middle" dominant-baseline="middle" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="36" font-weight="700" fill="rgba(255,255,255,0.92)">${safeLabel}</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

function brandSlug(name) {
  return (name || 'demo')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'demo'
}

function buildBrand(profile) {
  const p = { ...DEFAULT_GUEST_PROFILE, ...(profile || {}) }
  return {
    id: `demo-brand-${brandSlug(p.brandName)}`,
    workspace_id: `demo-ws-${brandSlug(p.brandName)}`,
    name: p.brandName,
    website: p.website,
    logo_url: p.logoDataUrl || '',
    industry: 'Demo',
    voice: 'Confident, warm, and a little playful',
    description: `${p.brandName} — a guest demo brand.`,
    target_audience: 'Demo audience',
    brand_colors: ['#6F4E37', '#D2B48C', '#FFF8E7'],
  }
}

function buildWorkspace(profile) {
  const p = { ...DEFAULT_GUEST_PROFILE, ...(profile || {}) }
  return {
    id: `demo-ws-${brandSlug(p.brandName)}`,
    name: `${p.brandName} (Demo)`,
    effective_plan: 'pro',
    plan: 'pro',
    brand_count: 1,
  }
}

export function buildDemoTrends(profile) {
  const name = profile?.brandName || DEFAULT_GUEST_PROFILE.brandName
  return [
    { id: 't1', title: 'Short-form video is winning the feed', summary: `Reels and Shorts are getting 2-3x the reach for accounts in ${name}'s space.`, score: 92, source: 'TikTok' },
    { id: 't2', title: '"What I do in a day" content', summary: 'Day-in-the-life style posts continue to outperform polished promo content.', score: 87, source: 'Instagram' },
    { id: 't3', title: 'Carousel posts beat single image', summary: 'Carousels are getting ~1.4x the saves of single-image posts this quarter.', score: 81, source: 'Instagram' },
    { id: 't4', title: 'Founder-led content', summary: 'Posts featuring the founder voice get higher comment rates than brand-only posts.', score: 76, source: 'LinkedIn' },
    { id: 't5', title: 'Hook-first captions', summary: 'Captions that lead with a question or strong opinion outperform list-style posts.', score: 71, source: 'Instagram' },
  ]
}

export function buildDemoTemplates(profile) {
  const name = profile?.brandName || DEFAULT_GUEST_PROFILE.brandName
  const base = [
    { id: 'tpl-1', name: 'Product Spotlight', description: `Square post highlighting a product in ${name}'s brand colors.` },
    { id: 'tpl-2', name: 'Behind the Counter', description: '4-slide carousel telling a short story.' },
    { id: 'tpl-3', name: 'Customer Quote', description: 'Bold typography over a brand-color background.' },
    { id: 'tpl-4', name: 'Weekly Special', description: 'Promotional post for limited-time menu items.' },
  ]
  return base.map((t) => ({
    ...t,
    brand_id: buildBrand(profile).id,
    workspace_id: buildWorkspace(profile).id,
    created_at: new Date().toISOString(),
  }))
}

function postsForIntent(intent) {
  if (intent && INTENT_POSTS[intent]) return INTENT_POSTS[intent]
  return INTENT_POSTS.default
}

// Personalize a caption / idea with the guest's brand name when it makes sense.
function personalize(text, brandName) {
  if (!brandName || !text) return text
  // Replace generic "we / our" openings sometimes; leave most copy alone.
  return text
}

// Build ~10 posts spread across the given month/year on every-3rd-day cadence.
export function buildDemoMonthContent(month, year, profile) {
  const brand = buildBrand(profile)
  const intent = profile?.intent || null
  const ideas = postsForIntent(intent)
  const daysInMonth = new Date(year, month, 0).getDate()
  const targetDays = []
  for (let d = 2; d <= daysInMonth && targetDays.length < ideas.length; d += 3) {
    targetDays.push(d)
  }
  return targetDays.map((day, i) => {
    const idea = ideas[i % ideas.length]
    const platform = PLATFORMS[i % PLATFORMS.length]
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const gradient = GRADIENT_BACKGROUNDS[i % GRADIENT_BACKGROUNDS.length]
    const imageUrl = gradientToDataUri(gradient, idea.idea.split(':')[0])
    return {
      id: `demo-post-${month}-${year}-${i}`,
      brand_id: brand.id,
      workspace_id: brand.workspace_id,
      platform,
      scheduled_date: iso,
      content_idea: idea.idea,
      topic: idea.idea,
      caption: personalize(idea.caption, brand.name),
      hashtags: idea.hashtags,
      image_url: imageUrl,
      image_urls: [imageUrl],
      slide_count: idea.slides,
      status: 'ready',
      is_demo: true,
    }
  })
}

export function buildDemoContentByMonth(profile, refDate = new Date()) {
  const m = refDate.getMonth() + 1
  const y = refDate.getFullYear()
  const prev = new Date(y, m - 2, 1)
  const next = new Date(y, m, 1)
  return {
    [`${y}-${m}`]: buildDemoMonthContent(m, y, profile),
    [`${prev.getFullYear()}-${prev.getMonth() + 1}`]: buildDemoMonthContent(prev.getMonth() + 1, prev.getFullYear(), profile),
    [`${next.getFullYear()}-${next.getMonth() + 1}`]: buildDemoMonthContent(next.getMonth() + 1, next.getFullYear(), profile),
  }
}

// Convenience: full state slice for the appStore seed.
export function buildDemoState(profile) {
  const ws = buildWorkspace(profile)
  const brand = buildBrand(profile)
  return {
    workspaces: [ws],
    activeWorkspaceId: ws.id,
    activeWorkspace: ws,
    brands: [brand],
    activeBrandId: brand.id,
    contentByMonth: buildDemoContentByMonth(profile),
    trends: buildDemoTrends(profile),
    templates: buildDemoTemplates(profile),
  }
}

// Backwards-compat exports used elsewhere.
export const DEMO_WORKSPACE = buildWorkspace(DEFAULT_GUEST_PROFILE)
export const DEMO_BRAND = buildBrand(DEFAULT_GUEST_PROFILE)
export const DEMO_TRENDS = buildDemoTrends(DEFAULT_GUEST_PROFILE)
export const DEMO_TEMPLATES = buildDemoTemplates(DEFAULT_GUEST_PROFILE)
