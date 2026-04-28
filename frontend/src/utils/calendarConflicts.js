/**
 * Calendar conflict detection (R2.6).
 *
 * Returns an array of conflict descriptors for a given list of posts:
 *   - { kind: 'cluster',     post_ids, platform, reason }   (same platform within 2h)
 *   - { kind: 'duplicate',   post_ids, reason }             (near-duplicate caption/visual within 7d)
 *
 * Pure functions — no I/O.
 */

const TWO_HOURS_MS = 2 * 60 * 60 * 1000
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

function parseScheduled(post) {
  if (!post?.scheduled_date) return null
  const [y, m, d] = String(post.scheduled_date).split('-').map(Number)
  if (!y || !m || !d) return null
  // Use 12:00 UTC as "noon" if no time field; the spec only references date-level slots.
  return new Date(y, m - 1, d, 12, 0, 0).getTime()
}

function normalizeCaption(c) {
  return String(c || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()
}

function captionSimilarity(a, b) {
  // Cheap Jaccard on tokenized captions.
  const ta = new Set(normalizeCaption(a).split(/\s+/).filter(Boolean))
  const tb = new Set(normalizeCaption(b).split(/\s+/).filter(Boolean))
  if (ta.size === 0 && tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter += 1
  const union = ta.size + tb.size - inter
  return union ? inter / union : 0
}

export function detectConflicts(posts) {
  const out = []
  if (!Array.isArray(posts)) return out

  // Cluster by platform within 2h
  const byPlatform = {}
  for (const p of posts) {
    const ts = parseScheduled(p)
    if (!ts) continue
    if (!byPlatform[p.platform]) byPlatform[p.platform] = []
    byPlatform[p.platform].push({ post: p, ts })
  }
  for (const platform of Object.keys(byPlatform)) {
    const arr = byPlatform[platform].sort((a, b) => a.ts - b.ts)
    for (let i = 1; i < arr.length; i++) {
      if (arr[i].ts - arr[i - 1].ts <= TWO_HOURS_MS) {
        out.push({
          kind: 'cluster',
          post_ids: [arr[i - 1].post.id, arr[i].post.id],
          platform,
          reason: `Two ${platform} posts scheduled within 2 hours`,
        })
      }
    }
  }

  // Near-duplicate captions within 7d
  for (let i = 0; i < posts.length; i++) {
    for (let j = i + 1; j < posts.length; j++) {
      const a = posts[i]
      const b = posts[j]
      const ta = parseScheduled(a)
      const tb = parseScheduled(b)
      if (ta == null || tb == null) continue
      if (Math.abs(ta - tb) > SEVEN_DAYS_MS) continue
      const sim = captionSimilarity(a.caption, b.caption)
      if (sim >= 0.65) {
        out.push({
          kind: 'duplicate',
          post_ids: [a.id, b.id],
          reason: `Captions are ${Math.round(sim * 100)}% similar within 7 days`,
        })
      }
    }
  }
  return out
}

export function conflictsForPost(postId, conflicts) {
  return conflicts.filter((c) => c.post_ids.includes(postId))
}
