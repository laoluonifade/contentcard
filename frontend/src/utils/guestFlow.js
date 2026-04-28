const DEFAULT_MONTH = 'June 2026'

const PLATFORM_META = {
  instagram: {
    label: 'Instagram',
    accent: 'bg-pink-50 text-pink-700 border-pink-200',
    bestTime: 'Tue, 11:30 AM',
    cta: 'Save this carousel in your plan',
  },
  facebook: {
    label: 'Facebook',
    accent: 'bg-blue-50 text-blue-700 border-blue-200',
    bestTime: 'Wed, 1:00 PM',
    cta: 'Queue this offer post',
  },
  twitter: {
    label: 'Twitter/X',
    accent: 'bg-slate-100 text-slate-700 border-slate-200',
    bestTime: 'Thu, 9:10 AM',
    cta: 'Turn this into a thread',
  },
  linkedin: {
    label: 'LinkedIn',
    accent: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    bestTime: 'Fri, 8:45 AM',
    cta: 'Save this thought-leadership post',
  },
}

const ANGLES = [
  'founder story',
  'customer pain point',
  'product education',
  'offer spotlight',
  'social proof',
  'behind the scenes',
  'myth vs reality',
  'before and after',
]

function titleCase(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ')
}

function domainFromWebsite(website) {
  const raw = String(website || '').trim()
  if (!raw) return ''
  return raw.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0]
}

function sentenceFromDomain(domain) {
  if (!domain) return 'your website'
  const bits = domain.split('.').filter(Boolean)
  return bits[0] || domain
}

function hashtags(brandName) {
  const slug = String(brandName || 'contentcard')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 2)
    .map((part) => `#${part}`)
  return [...new Set([...slug, '#contentmarketing', '#socialmediatips'])]
}

export function buildGuestWorkspaceProfile({ brandName, website, goal }) {
  const cleanBrand = titleCase(brandName) || 'Your Brand'
  const domain = domainFromWebsite(website)
  const domainCue = sentenceFromDomain(domain)
  const cleanGoal = String(goal || '').trim() || 'Generate more awareness and leads this month'

  return {
    brandName: cleanBrand,
    website: domain ? `https://${domain}` : '',
    goal: cleanGoal,
    audience: `People discovering ${cleanBrand} for the first time and comparing options online.`,
    positioning: `${cleanBrand} helps customers move faster with clearer value and fewer decision points.`,
    domainCue,
    monthLabel: DEFAULT_MONTH,
  }
}

export function buildGuestSamplePosts(input) {
  const profile = buildGuestWorkspaceProfile(input)
  const tagList = hashtags(profile.brandName)
  const postBlueprints = [
    {
      platform: 'instagram',
      day: '03',
      title: `Why ${profile.brandName} feels easier from the first click`,
      hook: `Most brands talk features. ${profile.brandName} should open with the outcome customers want fastest.`,
      body: `Show a 3-slide carousel: the problem your audience feels, the simpler path on ${profile.domainCue}, and the result they get by choosing ${profile.brandName}.`,
      type: 'Carousel',
    },
    {
      platform: 'facebook',
      day: '06',
      title: `${profile.brandName} offer spotlight`,
      hook: `This is the kind of post that turns curiosity into action.`,
      body: `Lead with a direct benefit, mention the website as the place to explore the full experience, and close with one low-friction CTA built around ${profile.goal.toLowerCase()}.`,
      type: 'Promo post',
    },
    {
      platform: 'twitter',
      day: '11',
      title: `${profile.brandName} thread: what people misunderstand`,
      hook: `A strong X thread should sound like a founder explaining the space in plain English.`,
      body: `Start with the biggest misconception in your category, explain how ${profile.brandName} handles it differently, and end by pointing readers to ${profile.domainCue}.`,
      type: 'Thread',
    },
    {
      platform: 'linkedin',
      day: '18',
      title: `What ${profile.brandName} is really solving`,
      hook: `LinkedIn works best when the brand sounds useful, concrete, and experienced.`,
      body: `Frame a short insight post around the pain point your audience hits before finding ${profile.brandName}, then connect that to a better workflow or outcome.`,
      type: 'Insight post',
    },
  ]

  return postBlueprints.map((item, index) => {
    const meta = PLATFORM_META[item.platform]
    const angle = ANGLES[index % ANGLES.length]
    return {
      ...item,
      id: `${item.platform}-${index + 1}`,
      accent: meta.accent,
      platformLabel: meta.label,
      bestTime: meta.bestTime,
      cta: meta.cta,
      angle,
      caption: `${item.hook} ${item.body}`,
      hashtags: tagList,
    }
  })
}

export function buildGuestPlanSummary(input) {
  const profile = buildGuestWorkspaceProfile(input)
  return [
    {
      label: 'Brand',
      value: profile.brandName,
    },
    {
      label: 'Website read',
      value: profile.website || 'No website provided',
    },
    {
      label: 'Campaign goal',
      value: profile.goal,
    },
    {
      label: 'This sample month',
      value: '4 starter posts across Instagram, Facebook, X, and LinkedIn',
    },
  ]
}
