import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'
import type { LighthouseMetrics, ReportComparison, LighthouseMetricDeltas } from './types.js'
import { findChromePath } from './capture.js'

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
}

/**
 * Serve a directory on a random available port. Returns the server and the port.
 */
export function serveDirectory(dir: string): Promise<{ server: ReturnType<typeof createServer>; port: number }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      let urlPath = req.url ?? '/'
      // Strip query string
      urlPath = urlPath.split('?')[0]
      if (urlPath === '/') urlPath = '/index.html'

      const filePath = join(dir, urlPath)
      if (!existsSync(filePath)) {
        res.writeHead(404)
        res.end('Not found')
        return
      }

      const ext = extname(filePath).toLowerCase()
      const contentType = MIME_TYPES[ext] || 'application/octet-stream'

      try {
        const content = readFileSync(filePath)
        res.writeHead(200, { 'Content-Type': contentType })
        res.end(content)
      } catch {
        res.writeHead(500)
        res.end('Internal server error')
      }
    })

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (addr && typeof addr === 'object') {
        resolve({ server, port: addr.port })
      } else {
        reject(new Error('Failed to get server address'))
      }
    })

    server.on('error', reject)
  })
}

/**
 * Run Lighthouse on a URL and extract key performance metrics.
 */
export async function runLighthouse(url: string, chromePort?: number): Promise<LighthouseMetrics> {
  // Dynamic imports — lighthouse and chrome-launcher are large ESM modules
  const { default: lighthouse } = await import('lighthouse')
  const chromeLauncher = await import('chrome-launcher')

  let chrome: Awaited<ReturnType<typeof chromeLauncher.launch>> | undefined
  let port = chromePort

  // Launch Chrome if no port provided
  if (!port) {
    chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] })
    port = chrome.port
  }

  try {
    const result = await lighthouse(url, {
      port,
      onlyCategories: ['performance'],
      output: 'json',
      logLevel: 'error',
    })

    if (!result || !result.lhr) {
      throw new Error('Lighthouse returned no results')
    }

    const { audits, categories } = result.lhr

    return {
      performanceScore: Math.round((categories.performance?.score ?? 0) * 100),
      fcp: audits['first-contentful-paint']?.numericValue ?? 0,
      lcp: audits['largest-contentful-paint']?.numericValue ?? 0,
      tbt: audits['total-blocking-time']?.numericValue ?? 0,
      cls: audits['cumulative-layout-shift']?.numericValue ?? 0,
      si: audits['speed-index']?.numericValue ?? 0,
    }
  } finally {
    if (chrome) {
      await chrome.kill()
    }
  }
}

/**
 * Calculate deltas between original and clone metrics.
 * Negative deltas mean improvement for time-based metrics (lower is better).
 * Positive delta means improvement for performance score (higher is better).
 */
export function calculateDeltas(original: LighthouseMetrics, clone: LighthouseMetrics): LighthouseMetricDeltas {
  return {
    performanceScore: clone.performanceScore - original.performanceScore,
    fcp: clone.fcp - original.fcp,
    lcp: clone.lcp - original.lcp,
    tbt: clone.tbt - original.tbt,
    cls: clone.cls - original.cls,
    si: clone.si - original.si,
  }
}

/**
 * Build a full comparison object from original and clone metrics.
 */
export function buildComparison(original: LighthouseMetrics, clone: LighthouseMetrics): ReportComparison {
  return {
    original,
    clone,
    deltas: calculateDeltas(original, clone),
  }
}

/**
 * Format a time value in ms to a human-readable string.
 * Values >= 1000ms shown as seconds (e.g., "4.2s"), otherwise as ms (e.g., "850ms").
 */
export function formatTime(ms: number): string {
  const abs = Math.abs(ms)
  if (abs >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`
  }
  return `${Math.round(ms)}ms`
}

/**
 * Format a delta time value with sign prefix.
 */
export function formatTimeDelta(ms: number): string {
  const prefix = ms > 0 ? '+' : ''
  return `${prefix}${formatTime(ms)}`
}

/**
 * Format CLS value (unitless, 2 decimal places).
 */
export function formatCLS(value: number): string {
  return value.toFixed(2)
}

/**
 * Format CLS delta with sign prefix.
 */
export function formatCLSDelta(value: number): string {
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${value.toFixed(2)}`
}

/**
 * Determine if a delta represents an improvement.
 * For performance score: positive is better.
 * For all other metrics: negative is better (lower time/shift = faster).
 */
export function isImprovement(metricKey: keyof LighthouseMetricDeltas, delta: number): boolean {
  if (metricKey === 'performanceScore') {
    return delta > 0
  }
  // For time and CLS metrics, lower is better
  return delta < 0
}

/**
 * Determine if a delta represents a regression.
 */
export function isRegression(metricKey: keyof LighthouseMetricDeltas, delta: number): boolean {
  if (delta === 0) return false
  return !isImprovement(metricKey, delta)
}

// Metric display configuration
interface MetricConfig {
  label: string
  key: keyof LighthouseMetrics
  formatValue: (v: number) => string
  formatDelta: (v: number) => string
}

export const METRIC_CONFIGS: MetricConfig[] = [
  { label: 'Performance Score', key: 'performanceScore', formatValue: (v) => String(v), formatDelta: (v) => `${v > 0 ? '+' : ''}${v}` },
  { label: 'LCP', key: 'lcp', formatValue: formatTime, formatDelta: formatTimeDelta },
  { label: 'TBT', key: 'tbt', formatValue: formatTime, formatDelta: formatTimeDelta },
  { label: 'CLS', key: 'cls', formatValue: formatCLS, formatDelta: formatCLSDelta },
  { label: 'Speed Index', key: 'si', formatValue: formatTime, formatDelta: formatTimeDelta },
  { label: 'FCP', key: 'fcp', formatValue: formatTime, formatDelta: formatTimeDelta },
]

/**
 * Render the comparison table as a styled terminal string using chalk.
 */
export async function renderComparisonTable(comparison: ReportComparison): Promise<string> {
  const chalk = (await import('chalk')).default

  const rows = METRIC_CONFIGS.map(({ label, key, formatValue, formatDelta }) => {
    const origVal = comparison.original[key]
    const cloneVal = comparison.clone[key]
    const deltaVal = comparison.deltas[key]

    const origStr = formatValue(origVal)
    const cloneStr = formatValue(cloneVal)
    const deltaStr = formatDelta(deltaVal)

    const improved = isImprovement(key, deltaVal)
    const regressed = isRegression(key, deltaVal)

    let indicator: string
    if (deltaVal === 0) {
      indicator = '  '
    } else if (improved) {
      indicator = chalk.green(' \u2191')
    } else {
      indicator = chalk.red(' \u2193')
    }

    const coloredDelta = regressed
      ? chalk.red(deltaStr)
      : improved
        ? chalk.green(deltaStr)
        : chalk.dim(deltaStr)

    return { label, origStr, cloneStr, deltaDisplay: `${coloredDelta}${indicator}` }
  })

  // Calculate column widths
  const metricWidth = Math.max(19, ...rows.map(r => r.label.length))
  const origWidth = Math.max(8, ...rows.map(r => r.origStr.length))
  const cloneWidth = Math.max(7, ...rows.map(r => r.cloneStr.length))
  // Delta column needs extra room for ANSI escape codes; use raw delta string lengths for sizing
  const rawDeltaWidths = METRIC_CONFIGS.map(({ key, formatDelta }) => {
    const deltaVal = comparison.deltas[key]
    return formatDelta(deltaVal).length + 2 // +2 for indicator
  })
  const deltaWidth = Math.max(8, ...rawDeltaWidths)

  const pad = (s: string, w: number, stripAnsi = false) => {
    // For ANSI-colored strings, we need visible length
    const visLen = stripAnsi ? s.replace(/\x1b\[[0-9;]*m/g, '').length : s.length
    return s + ' '.repeat(Math.max(0, w - visLen))
  }

  const line = (char: string, ...widths: number[]) =>
    char + widths.map(w => char.repeat(w + 2)).join(char) + char

  const headerRow = [
    pad('Metric', metricWidth),
    pad('Original', origWidth),
    pad('Clone', cloneWidth),
    pad('\u0394 Delta', deltaWidth),
  ]

  const lines: string[] = []

  // Top border
  lines.push(chalk.dim(`  \u250c${'\u2500'.repeat(metricWidth + 2)}\u252c${'\u2500'.repeat(origWidth + 2)}\u252c${'\u2500'.repeat(cloneWidth + 2)}\u252c${'\u2500'.repeat(deltaWidth + 2)}\u2510`))

  // Header
  lines.push(chalk.dim('  \u2502 ') + chalk.bold(headerRow[0]) + chalk.dim(' \u2502 ') + chalk.bold(headerRow[1]) + chalk.dim(' \u2502 ') + chalk.bold(headerRow[2]) + chalk.dim(' \u2502 ') + chalk.bold(headerRow[3]) + chalk.dim(' \u2502'))

  // Header separator
  lines.push(chalk.dim(`  \u251c${'\u2500'.repeat(metricWidth + 2)}\u253c${'\u2500'.repeat(origWidth + 2)}\u253c${'\u2500'.repeat(cloneWidth + 2)}\u253c${'\u2500'.repeat(deltaWidth + 2)}\u2524`))

  // Data rows
  for (const row of rows) {
    const metricCell = pad(row.label, metricWidth)
    const origCell = pad(row.origStr, origWidth)
    const cloneCell = pad(row.cloneStr, cloneWidth)
    const deltaCell = pad(row.deltaDisplay, deltaWidth, true)

    lines.push(
      chalk.dim('  \u2502 ') + metricCell +
      chalk.dim(' \u2502 ') + origCell +
      chalk.dim(' \u2502 ') + chalk.bold(cloneCell) +
      chalk.dim(' \u2502 ') + deltaCell +
      chalk.dim(' \u2502')
    )
  }

  // Bottom border
  lines.push(chalk.dim(`  \u2514${'\u2500'.repeat(metricWidth + 2)}\u2534${'\u2500'.repeat(origWidth + 2)}\u2534${'\u2500'.repeat(cloneWidth + 2)}\u2534${'\u2500'.repeat(deltaWidth + 2)}\u2518`))

  return lines.join('\n')
}
