import { describe, it, expect } from 'vitest'
import { deferTracking, deferAllScripts, identifyTrackingScripts } from '../src/transform/defer-tracking.js'
import * as cheerio from 'cheerio'

describe('defer-tracking', () => {
  describe('identifyTrackingScripts', () => {
    it('detects GTM scripts', () => {
      const html = '<html><head><script src="https://www.googletagmanager.com/gtm.js?id=GTM-ABC123"></script></head><body></body></html>'
      const $ = cheerio.load(html)
      const found = identifyTrackingScripts($)
      expect(found).toHaveLength(1)
      expect(found[0].vendor).toBe('gtm')
    })

    it('detects Facebook Pixel', () => {
      const html = '<html><head><script>!function(f,b,e,v){fbevents.js};</script></head><body><noscript><img height="1" width="1" src="https://www.facebook.com/tr?id=123&ev=PageView"/></noscript></body></html>'
      const $ = cheerio.load(html)
      const found = identifyTrackingScripts($)
      expect(found.length).toBeGreaterThanOrEqual(1)
    })

    it('detects multiple vendors', () => {
      const html = `<html><head>
        <script src="https://www.googletagmanager.com/gtm.js"></script>
        <script src="https://static.hotjar.com/c/hotjar-123.js"></script>
        <script src="https://cdn.amplitude.com/libs/analytics.js"></script>
      </head><body></body></html>`
      const $ = cheerio.load(html)
      const found = identifyTrackingScripts($)
      expect(found.length).toBe(3)
    })

    it('ignores non-tracking scripts', () => {
      const html = '<html><head><script src="https://cdn.example.com/app.js"></script></head><body></body></html>'
      const $ = cheerio.load(html)
      const found = identifyTrackingScripts($)
      expect(found).toHaveLength(0)
    })
  })

  describe('deferTracking', () => {
    it('converts tracking script src to data-deferred-src', () => {
      const html = '<html><head><script src="https://www.googletagmanager.com/gtm.js?id=GTM-ABC"></script></head><body></body></html>'
      const result = deferTracking(html)
      expect(result.html).toContain('data-deferred-src')
      expect(result.html).toContain('type="text/deferred-tracking"')
      // Verify original src attribute is removed (data-deferred-src is expected to remain)
      expect(result.html).not.toMatch(/ src="https:\/\/www\.googletagmanager\.com/)
      expect(result.deferredCount).toBe(1)
    })

    it('injects the deferred loader script', () => {
      const html = '<html><head><script src="https://www.googletagmanager.com/gtm.js"></script></head><body></body></html>'
      const result = deferTracking(html)
      expect(result.html).toContain('function loadTracking()')
      expect(result.html).toContain('click')
      expect(result.html).toContain('touchstart')
      expect(result.html).toContain('setTimeout(loadTracking,15000)')
    })

    it('removes OneTrust consent banner', () => {
      const html = '<html><body><div id="onetrust-consent-sdk"><div class="ot-sdk-container">Cookie banner</div></div><div>Real content</div></body></html>'
      const result = deferTracking(html)
      expect(result.html).not.toContain('onetrust-consent-sdk')
      expect(result.html).toContain('Real content')
    })

    it('handles inline tracking scripts', () => {
      const html = '<html><head><script>!function(f,b,e,v){n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)}; fbevents.js}</script></head><body></body></html>'
      const result = deferTracking(html)
      expect(result.html).toContain('type="text/deferred-tracking"')
    })

    it('returns 0 deferred when no tracking found', () => {
      const html = '<html><head></head><body><p>Hello</p></body></html>'
      const result = deferTracking(html)
      expect(result.deferredCount).toBe(0)
      expect(result.html).not.toContain('loadTracking')
    })
  })

  describe('deferAllScripts', () => {
    it('defers a regular external script', () => {
      const html = '<html><head></head><body><script src="https://cdn.example.com/app.js"></script></body></html>'
      const result = deferAllScripts(html)
      expect(result.deferredCount).toBe(1)
      expect(result.html).toContain('data-deferred-src="https://cdn.example.com/app.js"')
      expect(result.html).toContain('type="text/deferred-tracking"')
      expect(result.html).not.toContain(' src="https://cdn.example.com/app.js"')
    })

    it('skips scripts with async attribute', () => {
      const html = '<html><head></head><body><script src="https://cdn.example.com/async.js" async></script></body></html>'
      const result = deferAllScripts(html)
      expect(result.deferredCount).toBe(0)
      expect(result.html).toContain('src="https://cdn.example.com/async.js"')
    })

    it('skips scripts with defer attribute', () => {
      const html = '<html><head></head><body><script src="https://cdn.example.com/deferred.js" defer></script></body></html>'
      const result = deferAllScripts(html)
      expect(result.deferredCount).toBe(0)
      expect(result.html).toContain('src="https://cdn.example.com/deferred.js"')
    })

    it('skips scripts already deferred by deferTracking', () => {
      const html = '<html><head></head><body><script type="text/deferred-tracking" data-deferred-src="https://www.googletagmanager.com/gtm.js"></script></body></html>'
      const result = deferAllScripts(html)
      expect(result.deferredCount).toBe(0)
    })

    it('injects the loader script when scripts are deferred', () => {
      const html = '<html><head></head><body><script src="https://cdn.example.com/app.js"></script></body></html>'
      const result = deferAllScripts(html)
      expect(result.deferredCount).toBe(1)
      expect(result.html).toContain('function loadTracking()')
    })
  })
})
