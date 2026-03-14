import * as cheerio from 'cheerio'
import { TRACKING_PATTERNS, type TrackingVendor, type ScriptProfile, type ScriptProfilingResult } from '../types.js'

interface VendorBenchmark {
  name: string
  estimatedTbtMs: number
  estimatedSizeKb: number
  idealTrigger: ScriptProfile['recommendedTrigger']
  recommendation: string
}

const VENDOR_PROFILES: Record<string, VendorBenchmark> = {
  gtm: { name: 'Google Tag Manager', estimatedTbtMs: 100, estimatedSizeKb: 80, idealTrigger: 'page-load', recommendation: 'GTM itself is lightweight — the tags inside it cause the real impact. See individual tag recommendations below.' },
  ga: { name: 'Google Analytics 4', estimatedTbtMs: 50, estimatedSizeKb: 30, idealTrigger: 'page-load', recommendation: 'GA4 is async and lightweight. Safe to keep on page load. Consider using GA4 measurement protocol for server-side events to reduce client load further.' },
  fbPixel: { name: 'Facebook Pixel', estimatedTbtMs: 400, estimatedSizeKb: 60, idealTrigger: 'dom-ready', recommendation: 'Move PageView to DOM Ready trigger. Fire conversion events (Purchase, Lead, AddToCart) only on relevant pages via event-specific triggers.' },
  hotjar: { name: 'HotJar', estimatedTbtMs: 800, estimatedSizeKb: 120, idealTrigger: 'window-loaded', recommendation: 'Session recording does not need to start at page load. Move to Window Loaded trigger. Use HotJar sampling (10-25%) to reduce load on most sessions.' },
  amplitude: { name: 'Amplitude', estimatedTbtMs: 500, estimatedSizeKb: 180, idealTrigger: 'window-loaded', recommendation: 'Replace with Amplitude\'s lightweight SDK (@amplitude/analytics-browser) which is 50KB vs 180KB. Load on Window Loaded or Timer (3s).' },
  onetrust: { name: 'OneTrust Cookie Consent', estimatedTbtMs: 300, estimatedSizeKb: 90, idealTrigger: 'dom-ready', recommendation: 'Load OneTrust script with async attribute. Consider lazy-loading the consent banner UI — show a minimal banner first, load full UI on interaction.' },
  ttd: { name: 'The Trade Desk Pixel', estimatedTbtMs: 100, estimatedSizeKb: 15, idealTrigger: 'timer-5s', recommendation: 'No need for instant load. Fire on a Timer trigger (3-5s delay) or Window Loaded. Only fire conversion pixel on purchase/signup pages.' },
  hubspot: { name: 'HubSpot Analytics', estimatedTbtMs: 350, estimatedSizeKb: 95, idealTrigger: 'dom-ready', recommendation: 'Load HubSpot tracking code on DOM Ready. If only using forms, load the forms embed script only on pages with forms.' },
  segment: { name: 'Segment', estimatedTbtMs: 300, estimatedSizeKb: 70, idealTrigger: 'dom-ready', recommendation: 'Segment loads all connected destinations client-side. Switch to Segment\'s server-side destinations to eliminate most client TBT.' },
  intercom: { name: 'Intercom', estimatedTbtMs: 600, estimatedSizeKb: 200, idealTrigger: 'timer-5s', recommendation: 'Intercom is heavy (200KB+). Load on Timer (5s) or scroll trigger. Users rarely need chat in the first 5 seconds.' },
  drift: { name: 'Drift', estimatedTbtMs: 500, estimatedSizeKb: 170, idealTrigger: 'timer-5s', recommendation: 'Same as Intercom — load chat widget on Timer or scroll. Consider showing a static "Chat with us" button that loads Drift on click.' },
  clarity: { name: 'Microsoft Clarity', estimatedTbtMs: 200, estimatedSizeKb: 40, idealTrigger: 'window-loaded', recommendation: 'Clarity is lighter than HotJar but still records sessions. Move to Window Loaded trigger. Already async by default.' },
  linkedin: { name: 'LinkedIn Insight Tag', estimatedTbtMs: 150, estimatedSizeKb: 35, idealTrigger: 'dom-ready', recommendation: 'Fire on DOM Ready. Only fire conversion tracking on thank-you/confirmation pages.' },
  twitter: { name: 'Twitter/X Pixel', estimatedTbtMs: 100, estimatedSizeKb: 20, idealTrigger: 'timer-5s', recommendation: 'Low priority pixel. Fire on Timer (5s) or Window Loaded.' },
  tiktok: { name: 'TikTok Pixel', estimatedTbtMs: 150, estimatedSizeKb: 40, idealTrigger: 'dom-ready', recommendation: 'Fire PageView on DOM Ready. Fire conversion events only on relevant pages.' },
  pinterest: { name: 'Pinterest Tag', estimatedTbtMs: 100, estimatedSizeKb: 25, idealTrigger: 'timer-5s', recommendation: 'Low priority. Fire on Timer or Window Loaded.' },
  reddit: { name: 'Reddit Pixel', estimatedTbtMs: 80, estimatedSizeKb: 15, idealTrigger: 'timer-5s', recommendation: 'Minimal impact but still unnecessary on page load. Fire on Timer.' },
  quora: { name: 'Quora Pixel', estimatedTbtMs: 80, estimatedSizeKb: 15, idealTrigger: 'timer-5s', recommendation: 'Minimal impact. Fire on Timer or Window Loaded.' },
}

/**
 * Determine priority based on estimated TBT impact.
 */
function getPriority(tbtMs: number): ScriptProfile['priority'] {
  if (tbtMs >= 500) return 'critical'
  if (tbtMs >= 300) return 'high'
  if (tbtMs >= 100) return 'medium'
  return 'low'
}

/**
 * Detect the current loading strategy of a script element.
 */
function detectCurrentLoading($el: cheerio.Cheerio<any>): ScriptProfile['currentLoading'] {
  if ($el.attr('type') === 'text/deferred-tracking') return 'deferred-by-andale'
  if ($el.attr('async') !== undefined) return 'async'
  if ($el.attr('defer') !== undefined) return 'defer'
  return 'blocking'
}

/**
 * Extract GTM container ID from a src URL or inline content.
 */
function extractGtmContainerId(src?: string, content?: string): string | undefined {
  const pattern = /GTM-[A-Z0-9]+/
  if (src) {
    const match = src.match(pattern)
    if (match) return match[0]
  }
  if (content) {
    const match = content.match(pattern)
    if (match) return match[0]
  }
  return undefined
}

/**
 * Analyze tracking scripts in raw HTML and generate profiling recommendations.
 * Call this BEFORE deferring so it analyzes the original state.
 */
export function profileScripts(html: string): ScriptProfilingResult {
  const $ = cheerio.load(html, { decodeEntities: false } as any)
  const profiles: ScriptProfile[] = []
  let gtmContainerId: string | undefined

  // Profile external scripts
  $('script[src]').each((_, el) => {
    const $el = $(el)
    const src = $el.attr('src') || ''
    for (const [vendor, pattern] of Object.entries(TRACKING_PATTERNS)) {
      if (pattern.test(src)) {
        const benchmark = VENDOR_PROFILES[vendor]
        if (!benchmark) break

        // Detect GTM container ID
        if (vendor === 'gtm') {
          gtmContainerId = extractGtmContainerId(src) || gtmContainerId
        }

        profiles.push({
          vendor,
          vendorName: benchmark.name,
          src,
          type: 'external',
          estimatedSizeKb: benchmark.estimatedSizeKb,
          estimatedTbtMs: benchmark.estimatedTbtMs,
          currentLoading: detectCurrentLoading($el),
          recommendedTrigger: benchmark.idealTrigger,
          priority: getPriority(benchmark.estimatedTbtMs),
          recommendation: benchmark.recommendation,
        })
        return // cheerio .each return = continue
      }
    }
  })

  // Profile inline scripts
  $('script:not([src])').each((_, el) => {
    const $el = $(el)
    const content = $el.html() || ''
    for (const [vendor, pattern] of Object.entries(TRACKING_PATTERNS)) {
      if (pattern.test(content)) {
        const benchmark = VENDOR_PROFILES[vendor]
        if (!benchmark) break

        // Detect GTM container ID from inline snippet
        if (vendor === 'gtm') {
          gtmContainerId = extractGtmContainerId(undefined, content) || gtmContainerId
        }

        profiles.push({
          vendor,
          vendorName: benchmark.name,
          type: 'inline',
          estimatedSizeKb: benchmark.estimatedSizeKb,
          estimatedTbtMs: benchmark.estimatedTbtMs,
          currentLoading: detectCurrentLoading($el),
          recommendedTrigger: benchmark.idealTrigger,
          priority: getPriority(benchmark.estimatedTbtMs),
          recommendation: benchmark.recommendation,
        })
        return
      }
    }
  })

  // Compute totals
  const totalEstimatedTbtMs = profiles.reduce((sum, p) => sum + p.estimatedTbtMs, 0)
  const totalEstimatedSizeKb = profiles.reduce((sum, p) => sum + p.estimatedSizeKb, 0)

  // Generate top-level recommendations
  const recommendations: string[] = []

  if (profiles.length === 0) {
    recommendations.push('No tracking scripts detected. Your page is clean.')
    return { profiles, gtmContainerId, totalEstimatedTbtMs, totalEstimatedSizeKb, recommendations }
  }

  // Summary: how many scripts can move off page load
  const blockingHighImpact = profiles.filter(p =>
    (p.currentLoading === 'blocking' || p.currentLoading === 'async') &&
    p.recommendedTrigger !== 'page-load'
  )
  if (blockingHighImpact.length > 0) {
    const savingsMs = blockingHighImpact.reduce((sum, p) => sum + p.estimatedTbtMs, 0)
    recommendations.push(
      `Move ${blockingHighImpact.length} script${blockingHighImpact.length > 1 ? 's' : ''} from page load to post-interaction triggers — estimated TBT savings: ${savingsMs}ms`
    )
  }

  // GTM-specific recommendation
  if (gtmContainerId) {
    const nonGtmCount = profiles.filter(p => p.vendor !== 'gtm').length
    if (nonGtmCount > 0) {
      recommendations.push(
        `Your GTM container (${gtmContainerId}) loads ${nonGtmCount} tracking tag${nonGtmCount > 1 ? 's' : ''}. Here's the optimal trigger configuration:`
      )
    }
  }

  // Group recommendations by trigger
  const triggerGroups: Record<string, ScriptProfile[]> = {}
  for (const profile of profiles) {
    const trigger = profile.recommendedTrigger
    if (!triggerGroups[trigger]) triggerGroups[trigger] = []
    triggerGroups[trigger].push(profile)
  }

  const triggerLabels: Record<string, string> = {
    'page-load': 'Page Load (keep as-is)',
    'dom-ready': 'DOM Ready',
    'window-loaded': 'Window Loaded',
    'timer-5s': 'Timer (5s delay)',
    'interaction-only': 'First Interaction Only',
    'conversion-only': 'Conversion Pages Only',
  }

  for (const [trigger, scripts] of Object.entries(triggerGroups)) {
    const label = triggerLabels[trigger] || trigger
    const names = scripts.map(s => s.vendorName).join(', ')
    recommendations.push(`${label}: ${names}`)
  }

  return {
    profiles,
    gtmContainerId,
    totalEstimatedTbtMs,
    totalEstimatedSizeKb,
    recommendations,
  }
}
