=== Andale Page Speed Optimizer ===
Contributors: andale
Tags: performance, pagespeed, core web vitals, tracking, optimization
Requires at least: 5.0
Tested up to: 6.7
Stable tag: 1.1.0
Requires PHP: 7.4
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Automatically optimize your WordPress pages for sub-1-second loads.

== Description ==

Andale defers tracking scripts (GTM, HotJar, Facebook Pixel, and 20+ others)
to post-interaction, lazy-loads images, and reports Core Web Vitals to your
Andale dashboard. One setting — instant results.

**What Andale does:**

* Defers 20+ tracking vendors (GTM tags, HotJar, Facebook Pixel, Amplitude, etc.)
* Adds lazy loading to all below-fold images
* Injects performance hints (preconnect, font-display: swap, fetchpriority)
* Reports before/after PageSpeed scores to your dashboard
* Zero configuration — works out of the box with your Site ID

**Server-Side Optimization (New in v1.1)**

The plugin now directly modifies WordPress HTML output to:

* Defer render-blocking JavaScript (saves 300-800ms)
* Load CSS asynchronously (eliminates render-blocking)
* Defer tracking scripts (GTM, HotJar, FB Pixel + 15 others)
* Add font-display: swap to all web fonts
* Optimize image loading with lazy/eager/fetchpriority
* Inject preconnect hints for external resources

No API calls, no external services required for basic optimization.
Add your Andale Site ID to also get performance monitoring.

**Compatible with all major caching plugins**, including WP Rocket, W3 Total
Cache, LiteSpeed Cache, and WP Super Cache. Andale outputs a single async
`<script>` tag which caches cleanly alongside your other static assets.

**Get your free Site ID at [andale.sh](https://andale.sh)**

== Installation ==

1. Upload the `andale` folder to `/wp-content/plugins/`
2. Activate through the **Plugins** menu in WordPress
3. Go to **Settings → Andale**
4. Enter your Site ID from [andale.sh/install](https://andale.sh/install)
5. That's it — Andale starts optimizing immediately.

Alternatively, install directly from the WordPress plugin directory:
**Plugins → Add New → search "Andale Page Speed"**

== Frequently Asked Questions ==

= Where do I get a Site ID? =

Visit [andale.sh/install](https://andale.sh/install). Site IDs are free.

= Will this slow down my site? =

No. The script tag uses the `async` attribute, so it never blocks page render.
For fastest LCP, keep the injection location set to **Head** (the default).

= Can I exclude specific pages? =

Yes. Under **Settings → Andale → Exclude Pages**, add one URL substring per
line. Any page whose URL contains that string will be skipped.

= Is it compatible with WP Rocket / W3TC / LiteSpeed Cache? =

Yes. Andale outputs a single `<script async>` tag. There are no filters,
no late HTML manipulation, and no JavaScript conflicts with caching plugins.

= Does Andale store any data? =

Andale stores only your Site ID, injection location, and excluded paths in
your WordPress options table. No personal data is collected or transmitted
from your WordPress database.

= Where can I view my Core Web Vitals data? =

Log in to your dashboard at [andale.sh/dashboard](https://andale.sh/dashboard).
A quick-access link is also available on your WordPress admin dashboard widget.

== Screenshots ==

1. Settings page — clean, single-screen configuration.
2. WordPress dashboard widget — quick link to Core Web Vitals report.
3. Admin notice — prompts you to add a Site ID if none is configured.

== Changelog ==

= 1.1.0 =
* New: Server-side HTML optimization via PHP output buffering.
* New: Defer render-blocking JavaScript with `defer` attribute injection.
* New: Non-blocking CSS loading via preload pattern (eliminates render-blocking stylesheets).
* New: Image optimization — lazy/eager loading, decoding="async", fetchpriority="high" on LCP image.
* New: font-display: swap injected into all inline @font-face blocks.
* New: Preconnect hints for safe external domains (Google Fonts, jsDelivr, etc.).
* New: Tracking script deferral (20+ vendors) via PHP regex — GTM, GA, FB Pixel, HotJar, and more.
* New: Settings section "Server-Side Optimization" with per-feature toggles.
* New: Skip optimization for logged-in users option (recommended, on by default).

= 1.0.0 =
* Initial release.
* Snippet injection via wp_head (default) or wp_footer.
* Settings page under Settings → Andale.
* Per-path exclusion rules.
* Admin notice when Site ID is missing.
* Dashboard widget with link to Andale reporting.

== Upgrade Notice ==

= 1.1.0 =
New server-side HTML optimization engine. Enable under Settings → Andale → Server-Side Optimization.
No breaking changes — existing settings are preserved.

= 1.0.0 =
Initial release. No upgrade steps required.
