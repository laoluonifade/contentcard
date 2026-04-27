function pickFirstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value || '').trim()
    if (text) return text
  }
  return ''
}

function normalizeList(values, limit = 6) {
  if (!Array.isArray(values)) return []
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))].slice(0, limit)
}

function transcriptHighlights(messages, role, limit = 4) {
  return (Array.isArray(messages) ? messages : [])
    .filter((row) => row?.role === role)
    .map((row) => String(row?.content || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(-limit)
}

export function buildCampaignBrief({ brand, messages, topicOverride, platform, monthLabel }) {
  const kit = brand?.brand_kit || {}
  const userHighlights = transcriptHighlights(messages, 'user', 4)
  const assistantHighlights = transcriptHighlights(messages, 'assistant', 2)
  const contentGoals = normalizeList(kit?.content_goals, 4)
  const proofPoints = normalizeList([
    ...(Array.isArray(kit?.key_messages) ? kit.key_messages : []),
    ...(Array.isArray(kit?.value_pillars) ? kit.value_pillars : []),
  ], 5)

  return {
    objective: pickFirstNonEmpty(
      topicOverride,
      contentGoals[0],
      kit?.campaign_theme,
      `Create high-conviction ${platform} content for ${monthLabel || 'this month'}`
    ),
    primary_offer: pickFirstNonEmpty(
      kit?.value_proposition,
      assistantHighlights.find((line) => /offer|launch|promo|sale|product|service/i.test(line)),
      brand?.description
    ),
    audience_focus: pickFirstNonEmpty(
      brand?.target_audience,
      kit?.psychographics?.[0],
      kit?.aspirations?.[0]
    ),
    campaign_angle: pickFirstNonEmpty(
      kit?.campaign_angle,
      kit?.strategy_note,
      userHighlights.find((line) => /launch|promo|sale|campaign|focus|goal|this month/i.test(line)),
      assistantHighlights.find((line) => /plan|focus|theme|angle/i.test(line))
    ),
    key_proof_points: proofPoints,
    content_themes: normalizeList([
      ...(Array.isArray(kit?.brand_narratives) ? kit.brand_narratives : []),
      ...(Array.isArray(kit?.content_goals) ? kit.content_goals : []),
      ...(Array.isArray(kit?.funnel_stages) ? kit.funnel_stages : []),
      topicOverride,
    ], 6),
    asset_notes: normalizeList([
      ...(Array.isArray(brand?.brand_photos) && brand.brand_photos.length ? ['Brand photos available'] : []),
      ...(Array.isArray(kit?.good_examples) ? kit.good_examples : []),
      ...userHighlights.filter((line) => /screenshot|recording|flyer|asset|photo|video|logo/i.test(line)),
    ], 5),
    tone_overrides: normalizeList([
      ...(Array.isArray(brand?.tone_tags) ? brand.tone_tags : []),
      kit?.writing_style,
      kit?.communication_style,
      kit?.emotional_tone,
    ], 5),
    cta_goal: pickFirstNonEmpty(
      kit?.cta_style,
      kit?.seasonal_context,
      userHighlights.find((line) => /cta|book|buy|order|signup|dm|call|visit/i.test(line)),
      'Drive the clearest next action for the audience'
    ),
  }
}
