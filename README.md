# Andale :runner:

**Clone any web page. Defer the bloat. Ship it fast.**

```bash
npx andale https://example.com/landing -o ./fast-clone
```

---

## The Problem

Marketing pages load in 4-8 seconds because of tracking scripts -- GTM, HotJar, Facebook Pixel, OneTrust, Amplitude -- all blocking paint before the user sees a single pixel. Every second costs you conversions. You shouldn't have to choose between analytics and speed.

## The Solution

- **Pixel-perfect clone** -- Captures the fully rendered page (including JS-hydrated SPAs) as a static HTML file
- **Defer, don't strip** -- Tracking scripts fire on first user interaction, not on page load. Zero TBT, full attribution
- **Deploy to edge** -- Output is a static directory ready for Cloudflare Pages, Vercel, Netlify, or any CDN

---

## Quick Start

```bash
# Install globally
npm install -g andale

# Clone a page
andale https://example.com/checkout -o ./checkout-fast

# Or run without installing
npx andale https://example.com -o ./output
```

Requires **Node.js 22+** and **Google Chrome** (or Chromium).

## How It Works

Andale runs an 11-stage optimization pipeline on every URL:

```
URL
 │
 ├─ 1. CAPTURE ........... Chrome headless renders the full page (JS/SPAs)
 ├─ 2. DEFER TRACKING .... 20+ vendor scripts fire on first interaction, not on load
 ├─ 3. EXTRACT IMAGES .... Embedded data URLs → WebP files (40-80% smaller)
 ├─ 4. IMAGE LOADING ..... lazy/eager/fetchpriority/decoding attributes
 ├─ 5. FONT DISPLAY ...... font-display: swap on all @font-face (no FOIT)
 ├─ 6. PRECONNECT ........ Hints for external CDN origins (-100-300ms each)
 ├─ 7. HERO PRELOAD ...... LCP image gets <link rel="preload">
 ├─ 8. FONT PRELOAD ...... WOFF2 fonts get <link rel="preload">
 ├─ 9. DNS PREFETCH ...... Third-party origins pre-resolved
 ├─ 10. MINIFY CSS ....... Inline styles compressed (clean-css level 2)
 ├─ 11. MINIFY HTML ...... Whitespace, comments, redundant attrs removed
 └─ +  PREFILL ........... URL param prefill JS (?email=&fname=&lname=)
 │
 v
./output/index.html   (static, deployable, sub-1-second)
```

---

## CLI Reference

| Flag | Default | Description |
|------|---------|-------------|
| `<url>` | *(required)* | URL to clone |
| `-o, --output <dir>` | `./output` | Output directory |
| `-w, --wait <ms>` | `8000` | Wait time for JS rendering (SPAs need more) |
| `--no-defer-tracking` | defer on | Keep tracking scripts inline (no deferral) |
| `--strip-tracking` | off | Remove tracking scripts entirely |
| `--no-prefill` | prefill on | Skip URL param prefill injection |
| `--no-optimize-images` | optimize on | Skip image extraction/WebP conversion |
| `--viewport <WxH>` | `1440x4000` | Browser viewport size for capture |
| `--chrome-path <path>` | auto-detect | Path to Chrome/Chromium executable |

### Examples

```bash
# Clone a heavy SPA with extra render wait
andale https://example.com/checkout -o ./checkout --wait=12000

# Strip tracking entirely (no deferral, just remove)
andale https://example.com -o ./output --strip-tracking

# Skip image optimization for speed
andale https://example.com -o ./output --no-optimize-images

# Custom viewport (mobile capture)
andale https://example.com -o ./mobile --viewport=390x844
```

---

## Tracking Deferral

This is the core innovation. Marketing pages are slow because tracking scripts block the main thread. GTM alone adds 1-3 seconds of Total Blocking Time.

**Andale defers tracking to first user interaction -- it doesn't strip it.** Tracking is important for attribution. Removing it kills your data. Deferring it gives you both speed and analytics.

### How it works

1. External scripts get rewritten:
   ```html
   <!-- Before -->
   <script src="https://www.googletagmanager.com/gtm.js?id=GTM-XXXX"></script>

   <!-- After -->
   <script data-deferred-src="https://www.googletagmanager.com/gtm.js?id=GTM-XXXX"
           type="text/deferred-tracking"></script>
   ```

2. A tiny loader (~400 bytes) fires all deferred scripts on the first real user interaction:
   - `click`, `touchstart`, `mousemove`, or `keydown`
   - Or after 15 seconds as a fallback

3. Inline scripts, noscript pixels, and tracking iframes are all handled

### Before/After

| Metric | Before (typical) | After (andale) |
|--------|:-:|:-:|
| Total Blocking Time | 2,000-5,000ms | **0ms** |
| First Contentful Paint | 2.5-4.0s | **0.4-0.8s** |
| PageSpeed Score | 30-55 | **95-100** |
| Tracking data | Full | **Full** (fires on interaction) |

---

## Supported Vendors

Andale identifies and defers scripts from **18 tracking vendors** out of the box:

| Vendor | Patterns |
|--------|----------|
| **Google Tag Manager** | `googletagmanager.com` |
| **Google Analytics** | `google-analytics.com`, `gtag/js` |
| **Facebook Pixel** | `facebook.com/tr`, `fbevents.js`, `connect.facebook.net` |
| **HotJar** | `hotjar.com`, `static.hotjar.com` |
| **Amplitude** | `cdn.amplitude.com` |
| **OneTrust** | `cdn.cookielaw.org`, `onetrust` |
| **The Trade Desk** | `adsrvr.org`, `insight.adsrvr.org` |
| **HubSpot** | `js.hs-scripts.com`, `js.hs-analytics.net`, `js.hsforms.net` |
| **Segment** | `cdn.segment.com`, `analytics.js` |
| **Intercom** | `widget.intercom.io` |
| **Drift** | `js.driftt.com` |
| **Microsoft Clarity** | `clarity.ms` |
| **LinkedIn Insight** | `snap.licdn.com`, `px.ads.linkedin.com` |
| **Twitter/X Pixel** | `static.ads-twitter.com`, `analytics.twitter.com` |
| **TikTok Pixel** | `analytics.tiktok.com` |
| **Pinterest Tag** | `ct.pinterest.com`, `pintrk` |
| **Reddit Pixel** | `alb.reddit.com` |
| **Quora Pixel** | `q.quora.com` |

OneTrust consent banners are also removed (the consent UI itself, not just the script).

---

## Use Cases

**Marketing landing pages** -- Your agency just built a gorgeous Next.js landing page. It scores 35 on PageSpeed because of 8 tracking scripts. Clone it, defer the tracking, deploy to Cloudflare. Score: 98. Same page, same analytics.

**Checkout pages** -- Checkout abandonment spikes when load time exceeds 3 seconds. Clone your checkout flow into a static page that loads in under 1 second. Form prefill via URL params still works.

**Event pages** -- Time-sensitive campaign pages (launches, webinars, flash sales) where every millisecond of load time converts to revenue. Clone once, deploy to edge, done.

**Speed audits** -- Show clients what their page *could* score. Clone their page, run Lighthouse on the clone, present the before/after. Instant proof of concept for optimization projects.

---

## Roadmap

### v0.2 -- CLI Polish
- `--deploy cloudflare` -- auto-deploy to Cloudflare Pages
- `--deploy vercel` -- auto-deploy to Vercel
- `--report` -- run Lighthouse and output PageSpeed score before/after
- `--diff` -- screenshot original vs clone side-by-side
- npm publish as `andale`
- GitHub Actions CI

### v0.3 -- Web App (andale.sh)
- Web frontend -- paste a URL, get an optimized clone + PageSpeed report
- Hosted output -- each clone gets a subdomain (`yoursite.andale.sh`)
- Before/after comparison with side-by-side Lighthouse scores
- Queue system for async clone jobs

### v1.0 -- SaaS
- User accounts + API keys
- Custom domains for cloned pages
- Scheduled re-clones (keep clone in sync with source)
- Team workspaces
- Usage-based pricing

---

## Development

```bash
git clone https://github.com/liorwn/andale.git
cd andale
npm install

# Run in dev mode
npx tsx src/cli.ts https://example.com -o ./test-output

# Build
npm run build

# Run tests (23 tests)
npm test

# Watch mode
npm run test:watch

# Link for global use
npm link
andale https://example.com
```

### Stack

- **TypeScript** + Node.js 22+ (ESM)
- **single-file-cli** -- Chromium-based page capture
- **cheerio** -- HTML parsing and manipulation
- **sharp** -- Image optimization (WebP)
- **commander** -- CLI framework
- **chalk + ora** -- Terminal UI
- **vitest** -- Testing

---

## Contributing

Contributions are welcome. Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Write tests for new functionality
4. Ensure all tests pass (`npm test`)
5. Submit a pull request

For bugs, please open an issue with the URL that failed and the error output.

---

## License

MIT
