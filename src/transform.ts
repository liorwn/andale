import { deferTracking, stripTracking } from './transform/defer-tracking.js'
import { profileScripts } from './transform/profile-scripts.js'
import { extractAndOptimizeImages } from './transform/optimize-images.js'
import { injectFontPreloads } from './transform/preload-fonts.js'
import { injectPrefill } from './transform/inject-prefill.js'
import { optimizeImageLoading, addFontDisplaySwap, addPreconnectHints, preloadHeroImage } from './transform/optimize-loading.js'
import { minifyHtml, minifyInlineCss, addDnsPrefetch } from './transform/minify.js'
import type { TransformResult, ExtractedAsset, TransformStats, ChangeLogEntry } from './types.js'

export interface TransformOptions {
  deferTracking: boolean
  stripTracking: boolean
  prefill: boolean
  optimizeImages: boolean
}

export async function transform(
  html: string,
  outputDir: string,
  options: TransformOptions
): Promise<TransformResult> {
  const originalSize = Buffer.byteLength(html, 'utf-8')
  let current = html
  let trackingDeferred = 0
  let trackingStripped = 0
  let vendors: string[] = []
  let assets: ExtractedAsset[] = []
  const changelog: ChangeLogEntry[] = []

  // Stage 0: Profile scripts BEFORE any modifications (analyzes original state)
  const profilingResult = profileScripts(current)

  // Stage 1: Handle tracking scripts
  if (options.stripTracking) {
    const result = stripTracking(current)
    current = result.html
    trackingStripped = result.strippedCount
    vendors = result.vendors
    for (const v of result.vendors) {
      changelog.push({ type: 'stripped', category: 'tracking', description: `Removed ${v} tracking script` })
    }
  } else if (options.deferTracking) {
    const result = deferTracking(current)
    current = result.html
    trackingDeferred = result.deferredCount
    vendors = result.vendors
    for (const v of result.vendors) {
      changelog.push({ type: 'deferred', category: 'tracking', description: `Deferred ${v} to post-interaction`, detail: 'Fires on first click/touch/mouse/key or after 15s' })
    }
    if (result.deferredCount > 0) {
      changelog.push({ type: 'injected', category: 'tracking', description: 'Injected deferred tracking loader script' })
    }
  }

  // OneTrust/consent banner removal is handled inside deferTracking/stripTracking
  // but we log it explicitly if vendors were found
  if (vendors.includes('onetrust')) {
    changelog.push({ type: 'removed', category: 'consent', description: 'Removed OneTrust cookie consent banner HTML' })
  }

  // Stage 2: Extract and optimize images
  if (options.optimizeImages) {
    const result = await extractAndOptimizeImages(current, outputDir)
    current = result.html
    assets = result.assets
    for (const asset of result.assets) {
      if (asset.type === 'image') {
        const saved = asset.originalSize - asset.optimizedSize
        const pct = asset.originalSize > 0 ? Math.round((saved / asset.originalSize) * 100) : 0
        changelog.push({
          type: 'optimized',
          category: 'image',
          description: `Extracted and converted to ${asset.format.toUpperCase()}`,
          detail: `${Math.round(asset.originalSize / 1024)}KB → ${Math.round(asset.optimizedSize / 1024)}KB (${pct}% smaller) → ${asset.localPath}`
        })
      }
    }
  }

  // Stage 3: Inject font preloads
  const fontResult = injectFontPreloads(current)
  current = fontResult.html
  if (fontResult.fontsPreloaded > 0) {
    changelog.push({ type: 'preloaded', category: 'font', description: `Added preload hints for ${fontResult.fontsPreloaded} WOFF2 font(s)`, detail: 'Eliminates font-loading flash (FOIT/FOUT)' })
  }

  // Stage 4: Optimize image loading attributes
  const loadingResult = optimizeImageLoading(current)
  current = loadingResult.html
  changelog.push(...loadingResult.changelog)

  // Stage 5: Add font-display: swap
  const fontDisplayResult = addFontDisplaySwap(current)
  current = fontDisplayResult.html
  changelog.push(...fontDisplayResult.changelog)

  // Stage 6: Add preconnect hints for external origins
  const preconnectResult = addPreconnectHints(current)
  current = preconnectResult.html
  changelog.push(...preconnectResult.changelog)

  // Stage 7: Preload hero/LCP image
  const heroResult = preloadHeroImage(current)
  current = heroResult.html
  changelog.push(...heroResult.changelog)

  // Stage 8: DNS prefetch for third-party origins
  const dnsResult = addDnsPrefetch(current)
  current = dnsResult.html
  changelog.push(...dnsResult.changelog)

  // Stage 9: Inject URL param prefill
  if (options.prefill) {
    current = injectPrefill(current)
    changelog.push({ type: 'injected', category: 'prefill', description: 'Injected URL parameter prefill script', detail: 'Supports ?email=&fname=&lname=&phone= for form pre-population' })
  }

  // Stage 10: Minify inline CSS (before HTML minification)
  const cssMinResult = minifyInlineCss(current)
  current = cssMinResult.html
  changelog.push(...cssMinResult.changelog)

  // Stage 11: Minify HTML (LAST — after all modifications)
  const htmlMinResult = await minifyHtml(current)
  current = htmlMinResult.html
  changelog.push(...htmlMinResult.changelog)

  const finalSize = Buffer.byteLength(current, 'utf-8')
  const totalAssetSize = assets.reduce((sum, a) => sum + a.optimizedSize, 0)

  const stats: TransformStats = {
    trackingScriptsDeferred: trackingDeferred,
    trackingScriptsStripped: trackingStripped,
    imagesOptimized: assets.filter(a => a.type === 'image').length,
    fontsPreloaded: fontResult.fontsPreloaded,
    originalHtmlSize: originalSize,
    finalHtmlSize: finalSize,
    totalAssetSize,
    estimatedLoadTimeMs: Math.round((finalSize + totalAssetSize) / 1000 * 8),
  }

  return { html: current, assets, stats, changelog, profilingResult }
}
