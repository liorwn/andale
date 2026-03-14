import { describe, it, expect } from 'vitest'
import { profileScripts } from '../src/transform/profile-scripts.js'

describe('profile-scripts', () => {
  describe('GTM container detection', () => {
    it('extracts GTM container ID from external script src', () => {
      const html = '<html><head><script src="https://www.googletagmanager.com/gtm.js?id=GTM-ABC123"></script></head><body></body></html>'
      const result = profileScripts(html)
      expect(result.gtmContainerId).toBe('GTM-ABC123')
    })

    it('extracts GTM container ID from inline script', () => {
      const html = `<html><head><script>
        (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
        new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
        j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
        'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
        })(window,document,'script','dataLayer','GTM-XYZ789');
      </script></head><body></body></html>`
      const result = profileScripts(html)
      expect(result.gtmContainerId).toBe('GTM-XYZ789')
    })

    it('returns undefined when no GTM present', () => {
      const html = '<html><head><script src="https://cdn.example.com/app.js"></script></head><body></body></html>'
      const result = profileScripts(html)
      expect(result.gtmContainerId).toBeUndefined()
    })
  })

  describe('vendor matching and profile generation', () => {
    it('profiles a single external tracking script', () => {
      const html = '<html><head><script src="https://static.hotjar.com/c/hotjar-123.js"></script></head><body></body></html>'
      const result = profileScripts(html)
      expect(result.profiles).toHaveLength(1)
      expect(result.profiles[0].vendor).toBe('hotjar')
      expect(result.profiles[0].vendorName).toBe('HotJar')
      expect(result.profiles[0].type).toBe('external')
      expect(result.profiles[0].estimatedTbtMs).toBe(800)
      expect(result.profiles[0].estimatedSizeKb).toBe(120)
      expect(result.profiles[0].recommendedTrigger).toBe('window-loaded')
      expect(result.profiles[0].priority).toBe('critical')
    })

    it('profiles inline tracking scripts', () => {
      const html = `<html><head><script>!function(f,b,e,v){n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)}; fbevents.js}</script></head><body></body></html>`
      const result = profileScripts(html)
      expect(result.profiles).toHaveLength(1)
      expect(result.profiles[0].vendor).toBe('fbPixel')
      expect(result.profiles[0].vendorName).toBe('Facebook Pixel')
      expect(result.profiles[0].type).toBe('inline')
    })

    it('detects blocking loading for scripts without async/defer', () => {
      const html = '<html><head><script src="https://static.hotjar.com/c/hotjar-123.js"></script></head><body></body></html>'
      const result = profileScripts(html)
      expect(result.profiles[0].currentLoading).toBe('blocking')
    })

    it('detects async loading attribute', () => {
      const html = '<html><head><script async src="https://www.googletagmanager.com/gtag/js?id=G-123"></script></head><body></body></html>'
      const result = profileScripts(html)
      expect(result.profiles[0].currentLoading).toBe('async')
    })

    it('detects defer loading attribute', () => {
      const html = '<html><head><script defer src="https://js.hs-scripts.com/123.js"></script></head><body></body></html>'
      const result = profileScripts(html)
      expect(result.profiles[0].currentLoading).toBe('defer')
    })

    it('assigns correct priority levels', () => {
      const html = `<html><head>
        <script src="https://static.hotjar.com/c/hotjar-123.js"></script>
        <script src="https://js.hs-scripts.com/123.js"></script>
        <script src="https://snap.licdn.com/li.lms-analytics/insight.min.js"></script>
        <script src="https://q.quora.com/_/ad/123/pixel"></script>
      </head><body></body></html>`
      const result = profileScripts(html)

      const hotjar = result.profiles.find(p => p.vendor === 'hotjar')
      const hubspot = result.profiles.find(p => p.vendor === 'hubspot')
      const linkedin = result.profiles.find(p => p.vendor === 'linkedin')
      const quora = result.profiles.find(p => p.vendor === 'quora')

      expect(hotjar?.priority).toBe('critical')    // 800ms
      expect(hubspot?.priority).toBe('high')        // 350ms
      expect(linkedin?.priority).toBe('medium')     // 150ms
      expect(quora?.priority).toBe('low')           // 80ms
    })
  })

  describe('recommendation generation', () => {
    it('generates recommendations for pages with tracking scripts', () => {
      const html = `<html><head>
        <script src="https://www.googletagmanager.com/gtm.js?id=GTM-TEST1"></script>
        <script src="https://static.hotjar.com/c/hotjar-123.js"></script>
        <script src="https://cdn.amplitude.com/libs/analytics.js"></script>
      </head><body></body></html>`
      const result = profileScripts(html)
      expect(result.recommendations.length).toBeGreaterThan(0)
      // Should mention TBT savings
      expect(result.recommendations.some(r => r.includes('TBT savings'))).toBe(true)
      // Should mention GTM container
      expect(result.recommendations.some(r => r.includes('GTM-TEST1'))).toBe(true)
    })

    it('generates trigger-grouped recommendations', () => {
      const html = `<html><head>
        <script src="https://www.googletagmanager.com/gtag/js?id=G-123"></script>
        <script src="https://static.hotjar.com/c/hotjar-123.js"></script>
        <script src="https://ct.pinterest.com/v3/"></script>
      </head><body></body></html>`
      const result = profileScripts(html)
      // Should have trigger groupings
      expect(result.recommendations.some(r => r.includes('Page Load'))).toBe(true)
      expect(result.recommendations.some(r => r.includes('Window Loaded'))).toBe(true)
      expect(result.recommendations.some(r => r.includes('Timer'))).toBe(true)
    })
  })

  describe('multiple tracking scripts', () => {
    it('profiles all detected tracking scripts', () => {
      const html = `<html><head>
        <script src="https://www.googletagmanager.com/gtm.js?id=GTM-MULTI"></script>
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-123"></script>
        <script src="https://static.hotjar.com/c/hotjar-123.js"></script>
        <script src="https://cdn.amplitude.com/libs/analytics.js"></script>
        <script src="https://js.hs-scripts.com/12345.js"></script>
        <script src="https://widget.intercom.io/widget/abc123"></script>
      </head><body></body></html>`
      const result = profileScripts(html)
      expect(result.profiles).toHaveLength(6)
      // gtag/js on googletagmanager.com matches gtm pattern (100ms) before ga pattern
      expect(result.totalEstimatedTbtMs).toBe(100 + 100 + 800 + 500 + 350 + 600)
      expect(result.totalEstimatedSizeKb).toBe(80 + 80 + 120 + 180 + 95 + 200)
      expect(result.gtmContainerId).toBe('GTM-MULTI')
    })

    it('computes correct totals', () => {
      const html = `<html><head>
        <script src="https://clarity.ms/tag/abc"></script>
        <script src="https://snap.licdn.com/li.lms-analytics/insight.min.js"></script>
      </head><body></body></html>`
      const result = profileScripts(html)
      expect(result.totalEstimatedTbtMs).toBe(200 + 150)
      expect(result.totalEstimatedSizeKb).toBe(40 + 35)
    })
  })

  describe('clean HTML (no tracking)', () => {
    it('returns empty profiles for clean HTML', () => {
      const html = '<html><head><script src="https://cdn.example.com/app.js"></script></head><body><p>Hello world</p></body></html>'
      const result = profileScripts(html)
      expect(result.profiles).toHaveLength(0)
      expect(result.totalEstimatedTbtMs).toBe(0)
      expect(result.totalEstimatedSizeKb).toBe(0)
      expect(result.gtmContainerId).toBeUndefined()
    })

    it('generates clean-page message for HTML without scripts', () => {
      const html = '<html><head></head><body><p>No scripts at all</p></body></html>'
      const result = profileScripts(html)
      expect(result.profiles).toHaveLength(0)
      expect(result.recommendations).toHaveLength(1)
      expect(result.recommendations[0]).toContain('clean')
    })

    it('generates clean-page message for non-tracking scripts', () => {
      const html = '<html><head><script src="https://cdn.example.com/bundle.js"></script><script>console.log("hello")</script></head><body></body></html>'
      const result = profileScripts(html)
      expect(result.profiles).toHaveLength(0)
      expect(result.recommendations[0]).toContain('No tracking scripts detected')
    })
  })
})
