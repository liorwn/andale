export interface EdgeCloneOptions {
  url: string
  output: string
  wait: number
  deferTracking: boolean
  stripTracking: boolean
  prefill: boolean
  optimizeImages: boolean
  deploy?: 'cloudflare' | 'vercel'
  deployName?: string
  viewport: { width: number; height: number }
  chromePath?: string
}

export interface CaptureResult {
  html: string
  filePath: string
  originalSize: number
  captureTimeMs: number
}

export interface ChangeLogEntry {
  type: 'deferred' | 'stripped' | 'optimized' | 'preloaded' | 'injected' | 'removed'
  category: 'tracking' | 'image' | 'font' | 'prefill' | 'consent'
  description: string
  detail?: string
}

export interface TransformResult {
  html: string
  assets: ExtractedAsset[]
  stats: TransformStats
  changelog: ChangeLogEntry[]
  profilingResult?: ScriptProfilingResult
}

export interface ExtractedAsset {
  originalUrl: string
  localPath: string
  type: 'image' | 'font' | 'other'
  originalSize: number
  optimizedSize: number
  format: string
}

export interface TransformStats {
  trackingScriptsDeferred: number
  trackingScriptsStripped: number
  imagesOptimized: number
  fontsPreloaded: number
  originalHtmlSize: number
  finalHtmlSize: number
  totalAssetSize: number
  estimatedLoadTimeMs: number
}

export interface EdgeCloneResult {
  outputDir: string
  indexPath: string
  stats: TransformStats
  captureTimeMs: number
  transformTimeMs: number
  deployUrl?: string
}

// Known tracking script patterns
export const TRACKING_PATTERNS = {
  gtm: /googletagmanager\.com/,
  ga: /google-analytics\.com|gtag\/js/,
  fbPixel: /facebook\.com\/tr|fbevents\.js|connect\.facebook\.net/,
  hotjar: /hotjar\.com|static\.hotjar\.com/,
  amplitude: /cdn\.amplitude\.com/,
  onetrust: /cdn\.cookielaw\.org|onetrust/,
  ttd: /adsrvr\.org|insight\.adsrvr\.org/,
  hubspot: /js\.hs-scripts\.com|js\.hs-analytics\.net|js\.hsforms\.net/,
  segment: /cdn\.segment\.com|analytics\.js/,
  intercom: /widget\.intercom\.io/,
  drift: /js\.driftt\.com/,
  clarity: /clarity\.ms/,
  linkedin: /snap\.licdn\.com|px\.ads\.linkedin\.com/,
  twitter: /static\.ads-twitter\.com|analytics\.twitter\.com/,
  tiktok: /analytics\.tiktok\.com/,
  pinterest: /ct\.pinterest\.com|pintrk/,
  reddit: /alb\.reddit\.com/,
  quora: /q\.quora\.com/,
} as const

export type TrackingVendor = keyof typeof TRACKING_PATTERNS

// Script profiling types
export interface ScriptProfile {
  vendor: string
  vendorName: string
  src?: string
  type: 'external' | 'inline' | 'gtm-child'
  estimatedSizeKb: number
  estimatedTbtMs: number
  currentLoading: 'blocking' | 'async' | 'defer' | 'deferred-by-andale'
  recommendedTrigger: 'page-load' | 'dom-ready' | 'window-loaded' | 'timer-5s' | 'interaction-only' | 'conversion-only'
  priority: 'critical' | 'high' | 'medium' | 'low'
  recommendation: string
  detail?: string
}

export interface ScriptProfilingResult {
  profiles: ScriptProfile[]
  gtmContainerId?: string
  totalEstimatedTbtMs: number
  totalEstimatedSizeKb: number
  recommendations: string[]  // top-level summary recommendations
}

// Lighthouse report types
export interface LighthouseMetrics {
  performanceScore: number  // 0-100
  fcp: number               // First Contentful Paint (ms)
  lcp: number               // Largest Contentful Paint (ms)
  tbt: number               // Total Blocking Time (ms)
  cls: number               // Cumulative Layout Shift (unitless)
  si: number                // Speed Index (ms)
}

export interface ReportComparison {
  original: LighthouseMetrics
  clone: LighthouseMetrics
  deltas: LighthouseMetricDeltas
}

export interface LighthouseMetricDeltas {
  performanceScore: number
  fcp: number
  lcp: number
  tbt: number
  cls: number
  si: number
}
