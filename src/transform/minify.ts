import type { ChangeLogEntry } from '../types.js'

/**
 * Minify HTML — remove whitespace, comments, collapse attributes.
 * Uses html-minifier-terser loaded at runtime to avoid Turbopack issues.
 */
export async function minifyHtml(html: string): Promise<{ html: string; changelog: ChangeLogEntry[] }> {
  const changelog: ChangeLogEntry[] = []
  const originalSize = Buffer.byteLength(html, 'utf-8')

  try {
    // Runtime require to avoid Turbopack static analysis
    // eslint-disable-next-line no-eval
    const { minify } = eval('require')('html-minifier-terser')

    const minified = await minify(html, {
      collapseWhitespace: true,
      conservativeCollapse: true, // keep at least 1 space (safer for inline elements)
      removeComments: true,
      removeRedundantAttributes: true,
      removeEmptyAttributes: true,
      minifyCSS: true, // minifies inline <style> blocks
      minifyJS: false, // skip JS minification (can break deferred tracking)
      sortAttributes: true,
      sortClassName: true,
    })

    const newSize = Buffer.byteLength(minified, 'utf-8')
    const saved = originalSize - newSize
    const pct = originalSize > 0 ? Math.round((saved / originalSize) * 100) : 0

    if (saved > 0) {
      changelog.push({
        type: 'optimized',
        category: 'image', // reusing category for general size reduction
        description: `Minified HTML + inline CSS (${pct}% smaller)`,
        detail: `${Math.round(originalSize / 1024)}KB → ${Math.round(newSize / 1024)}KB — removed comments, whitespace, redundant attributes`
      })
    }

    return { html: minified, changelog }
  } catch (err) {
    // If minification fails, return original HTML unchanged
    console.warn('[andale] HTML minification failed, skipping:', (err as Error).message)
    return { html, changelog }
  }
}

/**
 * Minify inline CSS in <style> tags using clean-css.
 * More aggressive than html-minifier-terser's built-in CSS minification.
 */
export function minifyInlineCss(html: string): { html: string; changelog: ChangeLogEntry[] } {
  const changelog: ChangeLogEntry[] = []

  try {
    // eslint-disable-next-line no-eval
    const CleanCSS = eval('require')('clean-css')
    const cleanCss = new CleanCSS({ level: 2 }) // level 2 = advanced optimizations

    // eslint-disable-next-line no-eval
    const cheerio = eval('require')('cheerio')
    const $ = cheerio.load(html, { decodeEntities: false })

    let totalSaved = 0
    let stylesMinified = 0

    $('style').each((_: number, el: any) => {
      const original = $(el).html() || ''
      if (original.length < 50) return // skip tiny styles

      const result = cleanCss.minify(original)
      if (result.styles && result.styles.length < original.length) {
        totalSaved += original.length - result.styles.length
        $(el).html(result.styles)
        stylesMinified++
      }
    })

    if (stylesMinified > 0 && totalSaved > 100) {
      changelog.push({
        type: 'optimized',
        category: 'image',
        description: `Minified ${stylesMinified} inline CSS block(s)`,
        detail: `Saved ~${Math.round(totalSaved / 1024)}KB — merged rules, shortened values, removed duplicates`
      })
    }

    return { html: $.html(), changelog }
  } catch (err) {
    console.warn('[andale] CSS minification failed, skipping:', (err as Error).message)
    return { html, changelog }
  }
}

/**
 * Add dns-prefetch hints for third-party origins not covered by preconnect.
 * Lighter than preconnect — just resolves DNS, no TCP/TLS handshake.
 */
export function addDnsPrefetch(html: string): { html: string; changelog: ChangeLogEntry[] } {
  const changelog: ChangeLogEntry[] = []

  try {
    // eslint-disable-next-line no-eval
    const cheerio = eval('require')('cheerio')
    const $ = cheerio.load(html, { decodeEntities: false })

    const origins = new Set<string>()

    // Collect all external origins from scripts, links, iframes
    $('script[src], link[href], iframe[src]').each((_: number, el: any) => {
      const url = $(el).attr('src') || $(el).attr('href') || ''
      try {
        const parsed = new URL(url)
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
          origins.add(parsed.origin)
        }
      } catch {}
    })

    // Skip origins that already have preconnect or dns-prefetch
    const existing = new Set<string>()
    $('link[rel="preconnect"], link[rel="dns-prefetch"]').each((_: number, el: any) => {
      existing.add($(el).attr('href') || '')
    })

    const newOrigins = [...origins].filter(o => !existing.has(o) && !o.includes('localhost')).slice(0, 10)

    if (newOrigins.length > 0) {
      const tags = newOrigins.map(o => `<link rel="dns-prefetch" href="${o}">`).join('\n  ')
      const head = $('head')
      if (head.length) {
        head.prepend('\n  ' + tags)
      }

      changelog.push({
        type: 'optimized',
        category: 'font', // reusing for network optimization
        description: `Added dns-prefetch for ${newOrigins.length} third-party origin(s)`,
        detail: 'Pre-resolves DNS for faster subsequent resource loading'
      })
    }

    return { html: $.html(), changelog }
  } catch (err) {
    console.warn('[andale] DNS prefetch failed, skipping:', (err as Error).message)
    return { html, changelog }
  }
}
