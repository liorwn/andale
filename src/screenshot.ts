import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { findChromePath } from './capture.js'

export interface ScreenshotOptions {
  width?: number
  height?: number
  fullPage?: boolean
  chromePath?: string
}

/**
 * Take a screenshot of a URL or local HTML file using Chrome headless.
 *
 * @param urlOrPath - A URL (https://...) or a local file path
 * @param outputPath - Where to save the PNG
 * @param options - viewport width/height, fullPage, chromePath
 */
export async function takeScreenshot(
  urlOrPath: string,
  outputPath: string,
  options: ScreenshotOptions = {}
): Promise<string> {
  const width = options.width ?? 1440
  const height = options.height ?? 900
  const chromePath = options.chromePath ?? findChromePath()

  // Convert local file paths to file:// URLs
  let target = urlOrPath
  if (!target.startsWith('http://') && !target.startsWith('https://') && !target.startsWith('file://')) {
    // Resolve to absolute path if needed
    const { resolve } = await import('node:path')
    target = `file://${resolve(target)}`
  }

  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    `--window-size=${width},${height}`,
    `--screenshot=${outputPath}`,
  ]

  // Full page captures via virtual-time-budget (renders full page height)
  if (options.fullPage) {
    args.push('--virtual-time-budget=5000')
  }

  args.push(target)

  const cmd = `"${chromePath}" ${args.join(' ')}`

  execSync(cmd, {
    stdio: 'pipe',
    timeout: 30_000, // 30s max
  })

  if (!existsSync(outputPath)) {
    throw new Error(`Screenshot failed: output file not created at ${outputPath}`)
  }

  return outputPath
}
