import { useEffect } from 'react'

function ensureMeta(attr, key, content) {
  if (!content) return
  const selector = `meta[${attr}="${key}"]`
  let node = document.head.querySelector(selector)
  if (!node) {
    node = document.createElement('meta')
    node.setAttribute(attr, key)
    document.head.appendChild(node)
  }
  node.setAttribute('content', content)
}

function ensureLink(rel, href) {
  if (!href) return
  let node = document.head.querySelector(`link[rel="${rel}"]`)
  if (!node) {
    node = document.createElement('link')
    node.setAttribute('rel', rel)
    document.head.appendChild(node)
  }
  node.setAttribute('href', href)
}

function absoluteUrl(path = '/') {
  const base = (import.meta.env.VITE_SITE_URL || 'https://www.contentcard.co').replace(/\/+$/, '')
  const clean = String(path || '/').startsWith('/') ? path : `/${path}`
  return `${base}${clean}`
}

export default function Seo({
  title,
  description,
  path = '/',
  image = '/og-image.svg',
  keywords = '',
  noindex = false,
  structuredData = null,
}) {
  useEffect(() => {
    if (title) document.title = title
    ensureMeta('name', 'description', description)
    ensureMeta('name', 'keywords', keywords)
    ensureMeta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow')
    ensureMeta('property', 'og:type', 'website')
    ensureMeta('property', 'og:site_name', 'ContentCard')
    ensureMeta('property', 'og:title', title)
    ensureMeta('property', 'og:description', description)
    ensureMeta('property', 'og:url', absoluteUrl(path))
    ensureMeta('property', 'og:image', absoluteUrl(image))
    ensureMeta('name', 'twitter:card', 'summary_large_image')
    ensureMeta('name', 'twitter:title', title)
    ensureMeta('name', 'twitter:description', description)
    ensureMeta('name', 'twitter:image', absoluteUrl(image))
    ensureLink('canonical', absoluteUrl(path))

    // Per-page JSON-LD lives in its own <script> id so the static
    // Organization + WebSite blocks in index.html stay untouched.
    const scriptId = 'contentcard-jsonld-page'
    let script = document.getElementById(scriptId)
    if (!structuredData) {
      if (script) script.remove()
      return
    }
    if (!script) {
      script = document.createElement('script')
      script.id = scriptId
      script.type = 'application/ld+json'
      document.head.appendChild(script)
    }
    script.textContent = JSON.stringify(structuredData)
  }, [title, description, path, image, keywords, noindex, structuredData])

  return null
}
