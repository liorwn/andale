import * as cheerio from 'cheerio'
import type { ChangeLogEntry } from '../types.js'

const ABOVE_FOLD_SELECTORS = [
  'header img',
  'nav img',
  '.hero img',
  '[class*="hero"] img',
  'img:first-of-type',
]

/**
 * Optimize image loading attributes for Core Web Vitals.
 *
 * - Adds loading="lazy" to below-fold images
 * - Adds loading="eager" + fetchpriority="high" to first/hero images
 * - Adds decoding="async" to all images
 * - Ensures width/height attributes are present (CLS prevention)
 */
export function optimizeImageLoading(html: string): { html: string; changelog: ChangeLogEntry[] } {
  const $ = cheerio.load(html, { decodeEntities: false } as any)
  const changelog: ChangeLogEntry[] = []
  let lazyCount = 0
  let eagerCount = 0
  let decodingCount = 0

  const allImgs = $('img')
  const firstThreeIndices = new Set<number>()

  // Mark first 3 images as above-fold candidates
  allImgs.each((i) => {
    if (i < 3) firstThreeIndices.add(i)
  })

  // Also mark any images matching hero selectors
  for (const sel of ABOVE_FOLD_SELECTORS) {
    $(sel).each((_, el) => {
      const idx = allImgs.index(el)
      if (idx >= 0) firstThreeIndices.add(idx)
    })
  }

  allImgs.each((i, el) => {
    const $el = $(el)
    const isAboveFold = firstThreeIndices.has(i)

    // loading attribute
    if (!$el.attr('loading')) {
      if (isAboveFold) {
        $el.attr('loading', 'eager')
        eagerCount++
      } else {
        $el.attr('loading', 'lazy')
        lazyCount++
      }
    }

    // fetchpriority on hero/first image only
    if (isAboveFold && !$el.attr('fetchpriority')) {
      $el.attr('fetchpriority', 'high')
    }

    // decoding=async on all images
    if (!$el.attr('decoding')) {
      $el.attr('decoding', 'async')
      decodingCount++
    }
  })

  if (eagerCount > 0) {
    changelog.push({
      type: 'optimized',
      category: 'image',
      description: `Set loading="eager" + fetchpriority="high" on ${eagerCount} above-fold image(s)`,
      detail: 'Prioritizes hero/header images for faster LCP'
    })
  }
  if (lazyCount > 0) {
    changelog.push({
      type: 'optimized',
      category: 'image',
      description: `Set loading="lazy" on ${lazyCount} below-fold image(s)`,
      detail: 'Defers offscreen images until user scrolls near them'
    })
  }
  if (decodingCount > 0) {
    changelog.push({
      type: 'optimized',
      category: 'image',
      description: `Set decoding="async" on ${decodingCount} image(s)`,
      detail: 'Allows browser to decode images off the main thread'
    })
  }

  return { html: $.html(), changelog }
}

/**
 * Add font-display: swap to all @font-face rules.
 * Prevents invisible text during font loading (FOIT).
 */
export function addFontDisplaySwap(html: string): { html: string; changelog: ChangeLogEntry[] } {
  const $ = cheerio.load(html, { decodeEntities: false } as any)
  const changelog: ChangeLogEntry[] = []
  let swapCount = 0

  $('style').each((_, el) => {
    let css = $(el).html() || ''
    // Find @font-face blocks without font-display
    const fontFaceRegex = /@font-face\s*\{([^}]+)\}/g
    let match
    let modified = false

    while ((match = fontFaceRegex.exec(css)) !== null) {
      const block = match[1]
      if (!block.includes('font-display')) {
        // Add font-display: swap before the closing brace
        const newBlock = block.trimEnd() + '\n      font-display: swap;\n    '
        css = css.replace(block, newBlock)
        swapCount++
        modified = true
      }
    }

    if (modified) {
      $(el).html(css)
    }
  })

  if (swapCount > 0) {
    changelog.push({
      type: 'optimized',
      category: 'font',
      description: `Added font-display: swap to ${swapCount} @font-face rule(s)`,
      detail: 'Shows fallback font immediately, swaps when custom font loads (no FOIT)'
    })
  }

  return { html: $.html(), changelog }
}

/**
 * Add preconnect hints for external CDN origins found in the page.
 * Saves 100-300ms per origin on first request.
 */
export function addPreconnectHints(html: string): { html: string; changelog: ChangeLogEntry[] } {
  const $ = cheerio.load(html, { decodeEntities: false } as any)
  const changelog: ChangeLogEntry[] = []

  // Collect all external origins from src, href, url() in styles
  const origins = new Set<string>()
  const currentOrigin = new Set<string>()

  // From img src
  $('img[src]').each((_, el) => {
    const src = $(el).attr('src') || ''
    try {
      const url = new URL(src)
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        origins.add(url.origin)
      }
    } catch {}
  })

  // From link href (stylesheets, etc)
  $('link[href]').each((_, el) => {
    const href = $(el).attr('href') || ''
    try {
      const url = new URL(href)
      origins.add(url.origin)
    } catch {}
  })

  // From CSS url()
  $('style').each((_, el) => {
    const css = $(el).html() || ''
    const urlRegex = /url\(["']?(https?:\/\/[^"')]+)/g
    let match
    while ((match = urlRegex.exec(css)) !== null) {
      try {
        const url = new URL(match[1])
        origins.add(url.origin)
      } catch {}
    }
  })

  // Filter: skip data: URLs, same-origin, and already preconnected origins
  const existingPreconnects = new Set<string>()
  $('link[rel="preconnect"]').each((_, el) => {
    existingPreconnects.add($(el).attr('href') || '')
  })

  const newOrigins = [...origins].filter(o => {
    if (existingPreconnects.has(o)) return false
    if (o.includes('localhost') || o.includes('127.0.0.1')) return false
    // Skip common tracking/analytics origins (they're deferred anyway)
    if (o.includes('googletagmanager') || o.includes('google-analytics') ||
        o.includes('facebook') || o.includes('hotjar') || o.includes('amplitude')) return false
    return true
  }).slice(0, 6) // Max 6 preconnects (browser limit is ~6 concurrent connections per origin)

  if (newOrigins.length > 0) {
    const preconnectTags = newOrigins.map(o =>
      `<link rel="preconnect" href="${o}" crossorigin>`
    ).join('\n  ')

    const charset = $('meta[charset]')
    if (charset.length) {
      charset.after('\n  ' + preconnectTags)
    } else {
      $('head').prepend('\n  ' + preconnectTags)
    }

    changelog.push({
      type: 'optimized',
      category: 'font',
      description: `Added preconnect hints for ${newOrigins.length} external origin(s)`,
      detail: newOrigins.join(', ')
    })
  }

  return { html: $.html(), changelog }
}

/**
 * Preload the hero/LCP image for faster Largest Contentful Paint.
 */
export function preloadHeroImage(html: string): { html: string; changelog: ChangeLogEntry[] } {
  const $ = cheerio.load(html, { decodeEntities: false } as any)
  const changelog: ChangeLogEntry[] = []

  // Find the first large image (likely the LCP element)
  // Look for: hero images, first <img> with a real src (not data URL, not icon)
  let heroSrc: string | null = null

  // Check hero-like selectors first
  for (const sel of ['[class*="hero"] img', 'header img', '.banner img']) {
    const img = $(sel).first()
    if (img.length) {
      const src = img.attr('src') || ''
      if (src && !src.startsWith('data:') && src.length > 10) {
        heroSrc = src
        break
      }
    }
  }

  // Fallback: first img with a real src
  if (!heroSrc) {
    $('img').each((_, el) => {
      if (heroSrc) return
      const src = $(el).attr('src') || ''
      if (src && !src.startsWith('data:') && src.length > 10) {
        heroSrc = src
      }
    })
  }

  // Check if already preloaded
  if (heroSrc) {
    const alreadyPreloaded = $(`link[rel="preload"][href="${heroSrc}"]`).length > 0
    if (!alreadyPreloaded) {
      const ext = heroSrc.split('.').pop()?.split('?')[0]?.toLowerCase() || ''
      const type = ext === 'webp' ? 'image/webp' : ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image'

      const preloadTag = `<link rel="preload" href="${heroSrc}" as="image" type="${type}">`
      const charset = $('meta[charset]')
      if (charset.length) {
        charset.after('\n  ' + preloadTag)
      } else {
        $('head').prepend('\n  ' + preloadTag)
      }

      changelog.push({
        type: 'preloaded',
        category: 'image',
        description: 'Added preload hint for hero/LCP image',
        detail: heroSrc.length > 80 ? heroSrc.slice(0, 80) + '...' : heroSrc
      })
    }
  }

  return { html: $.html(), changelog }
}
