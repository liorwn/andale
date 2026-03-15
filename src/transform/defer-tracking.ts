import * as cheerio from 'cheerio'
import { TRACKING_PATTERNS, type TrackingVendor } from '../types.js'

export interface TrackedScript {
  vendor: TrackingVendor | 'unknown'
  type: 'external' | 'inline' | 'noscript' | 'iframe'
  src?: string
  content?: string
}

export function identifyTrackingScripts($: cheerio.CheerioAPI): TrackedScript[] {
  const found: TrackedScript[] = []

  // Check external scripts
  $('script[src]').each((_, el) => {
    const src = $(el).attr('src') || ''
    for (const [vendor, pattern] of Object.entries(TRACKING_PATTERNS)) {
      if (pattern.test(src)) {
        found.push({ vendor: vendor as TrackingVendor, type: 'external', src })
        return
      }
    }
  })

  // Check inline scripts
  $('script:not([src])').each((_, el) => {
    const content = $(el).html() || ''
    for (const [vendor, pattern] of Object.entries(TRACKING_PATTERNS)) {
      if (pattern.test(content)) {
        found.push({ vendor: vendor as TrackingVendor, type: 'inline', content: content.slice(0, 200) })
        return
      }
    }
  })

  // Check noscript tracking pixels
  $('noscript').each((_, el) => {
    const content = $(el).html() || ''
    for (const [vendor, pattern] of Object.entries(TRACKING_PATTERNS)) {
      if (pattern.test(content)) {
        found.push({ vendor: vendor as TrackingVendor, type: 'noscript', content: content.slice(0, 200) })
        return
      }
    }
  })

  // Check tracking iframes (1x1 pixels)
  $('iframe').each((_, el) => {
    const src = $(el).attr('src') || ''
    const h = $(el).attr('height')
    const w = $(el).attr('width')
    if ((h === '0' || h === '1') && (w === '0' || w === '1')) {
      for (const [vendor, pattern] of Object.entries(TRACKING_PATTERNS)) {
        if (pattern.test(src)) {
          found.push({ vendor: vendor as TrackingVendor, type: 'iframe', src })
          return
        }
      }
    }
  })

  return found
}

const DEFERRED_LOADER = `
<script>
(function(){
  var loaded=false;
  function loadTracking(){
    if(loaded)return;
    loaded=true;
    document.querySelectorAll('script[type="text/deferred-tracking"]').forEach(function(el){
      var s=document.createElement('script');
      if(el.dataset.deferredSrc){s.src=el.dataset.deferredSrc;s.async=true}
      else{s.textContent=el.textContent}
      Array.from(el.attributes).forEach(function(a){
        if(a.name!=='type'&&a.name!=='data-deferred-src')s.setAttribute(a.name,a.value)
      });
      el.parentNode.replaceChild(s,el)
    });
    document.querySelectorAll('noscript[data-deferred-tracking]').forEach(function(el){
      var d=document.createElement('div');d.innerHTML=el.textContent;
      el.parentNode.replaceChild(d,el)
    });
  }
  ['click','touchstart','mousemove','keydown'].forEach(function(e){
    document.addEventListener(e,loadTracking,{once:true,passive:true})
  });
  setTimeout(loadTracking,15000);
})();
</script>`

export function deferTracking(html: string): { html: string; deferredCount: number; vendors: string[] } {
  const $ = cheerio.load(html, { decodeEntities: false } as any)
  let deferredCount = 0
  const vendors: Set<string> = new Set()

  // Defer external tracking scripts
  $('script[src]').each((_, el) => {
    const src = $(el).attr('src') || ''
    for (const [vendor, pattern] of Object.entries(TRACKING_PATTERNS)) {
      if (pattern.test(src)) {
        $(el).attr('data-deferred-src', src)
        $(el).removeAttr('src')
        $(el).attr('type', 'text/deferred-tracking')
        deferredCount++
        vendors.add(vendor)
        return
      }
    }
  })

  // Defer inline tracking scripts
  $('script:not([src]):not([type="text/deferred-tracking"])').each((_, el) => {
    const content = $(el).html() || ''
    for (const [vendor, pattern] of Object.entries(TRACKING_PATTERNS)) {
      if (pattern.test(content)) {
        $(el).attr('type', 'text/deferred-tracking')
        deferredCount++
        vendors.add(vendor)
        return
      }
    }
  })

  // Mark noscript tracking pixels
  $('noscript').each((_, el) => {
    const content = $(el).html() || ''
    for (const [, pattern] of Object.entries(TRACKING_PATTERNS)) {
      if (pattern.test(content)) {
        $(el).attr('data-deferred-tracking', '')
        deferredCount++
        return
      }
    }
  })

  // Remove OneTrust consent banner
  $('#onetrust-consent-sdk').remove()
  $('[class*="onetrust"]').remove()
  $('#ot-sdk-btn-floating').remove()

  // Remove tracking iframes (0x0 or 1x1 pixels)
  $('iframe').each((_, el) => {
    const src = $(el).attr('src') || ''
    const h = $(el).attr('height')
    const w = $(el).attr('width')
    if ((h === '0' || h === '1') && (w === '0' || w === '1')) {
      for (const [, pattern] of Object.entries(TRACKING_PATTERNS)) {
        if (pattern.test(src)) {
          $(el).remove()
          deferredCount++
          return
        }
      }
    }
  })

  // Inject loader only if we deferred something
  if (deferredCount > 0) {
    $('body').append(DEFERRED_LOADER)
  }

  return { html: $.html(), deferredCount, vendors: [...vendors] }
}

/**
 * Defer ALL external scripts to post-interaction.
 * Like WP Rocket's "Delay JavaScript Execution" — drops TBT to 0ms.
 * Excludes: scripts with async/defer already, type=module, data-no-defer,
 * and scripts already deferred by deferTracking().
 */
export function deferAllScripts(html: string): { html: string; deferredCount: number } {
  const $ = cheerio.load(html, { decodeEntities: false } as any)
  let deferredCount = 0

  $('script[src]').each((_, el) => {
    const $el = $(el)
    const src = $el.attr('src') || ''

    // Skip if already async, defer, or type=module
    if ($el.attr('async') !== undefined || $el.attr('defer') !== undefined) return
    if (($el.attr('type') || '').includes('module')) return
    // Skip if already deferred by tracking deferral
    if ($el.attr('type') === 'text/deferred-tracking') return
    // Skip if explicitly opted out
    if ($el.attr('data-no-defer') !== undefined) return
    // Skip empty src
    if (!src) return

    $el.attr('data-deferred-src', src)
    $el.removeAttr('src')
    $el.attr('type', 'text/deferred-tracking')
    deferredCount++
  })

  // Inject loader if we deferred anything and it's not already there
  if (deferredCount > 0 && !html.includes('function loadTracking()')) {
    $('body').append(DEFERRED_LOADER)
  }

  return { html: $.html(), deferredCount }
}

export function stripTracking(html: string): { html: string; strippedCount: number; vendors: string[] } {
  const $ = cheerio.load(html, { decodeEntities: false } as any)
  let strippedCount = 0
  const vendors: Set<string> = new Set()

  // Remove external tracking scripts
  $('script[src]').each((_, el) => {
    const src = $(el).attr('src') || ''
    for (const [vendor, pattern] of Object.entries(TRACKING_PATTERNS)) {
      if (pattern.test(src)) {
        $(el).remove()
        strippedCount++
        vendors.add(vendor)
        return
      }
    }
  })

  // Remove inline tracking scripts
  $('script:not([src])').each((_, el) => {
    const content = $(el).html() || ''
    for (const [vendor, pattern] of Object.entries(TRACKING_PATTERNS)) {
      if (pattern.test(content)) {
        $(el).remove()
        strippedCount++
        vendors.add(vendor)
        return
      }
    }
  })

  // Remove noscript tracking pixels
  $('noscript').each((_, el) => {
    const content = $(el).html() || ''
    for (const [, pattern] of Object.entries(TRACKING_PATTERNS)) {
      if (pattern.test(content)) {
        $(el).remove()
        strippedCount++
        return
      }
    }
  })

  // Remove OneTrust
  $('#onetrust-consent-sdk').remove()
  $('[class*="onetrust"]').remove()

  // Remove tracking iframes
  $('iframe').each((_, el) => {
    const src = $(el).attr('src') || ''
    const h = $(el).attr('height')
    const w = $(el).attr('width')
    if ((h === '0' || h === '1') && (w === '0' || w === '1')) {
      $(el).remove()
      strippedCount++
    }
  })

  return { html: $.html(), strippedCount, vendors: [...vendors] }
}
