#!/usr/bin/env node
import { Command } from 'commander'
import { resolve, join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import chalk from 'chalk'
import ora from 'ora'
import { capture } from './capture.js'
import { transform } from './transform.js'
import { deploy } from './deploy.js'
import { runLighthouse, buildComparison, renderComparisonTable, serveDirectory } from './report.js'
import { takeScreenshot } from './screenshot.js'
import type { EdgeCloneOptions } from './types.js'

const program = new Command()

program
  .name('andale')
  .description('Clone any web page into a speed-optimized static site. Sub-1-second loads. Andale!')
  .version('0.1.0')
  .argument('<url>', 'URL to clone')
  .option('-o, --output <dir>', 'Output directory', './output')
  .option('-w, --wait <ms>', 'Wait time for JS rendering (ms)', '8000')
  .option('--no-defer-tracking', 'Keep tracking scripts inline')
  .option('--strip-tracking', 'Remove tracking scripts entirely')
  .option('--no-prefill', 'Skip URL param prefill injection')
  .option('--no-optimize-images', 'Skip image optimization')
  .option('--viewport <WxH>', 'Browser viewport size', '1440x4000')
  .option('--chrome-path <path>', 'Path to Chrome/Chromium executable')
  .option('--report', 'Run Lighthouse and show before/after PageSpeed comparison')
  .option('--diff', 'Screenshot original vs clone side-by-side')
  .option('--delay-all-js', 'Delay ALL JavaScript execution to post-interaction (like WP Rocket). Drops TBT to 0ms.')
  .option('--deploy <platform>', 'Deploy after clone (cloudflare, vercel)')
  .option('--name <name>', 'Project name for deployment (auto-generated from URL if omitted)')
  .action(async (url: string, opts: Record<string, any>) => {
    const outputDir = resolve(opts.output)
    const [vw, vh] = (opts.viewport as string).split('x').map(Number)

    console.log(chalk.bold('\n🏃 andale!\n'))
    console.log(`  URL:    ${chalk.cyan(url)}`)
    console.log(`  Output: ${chalk.dim(outputDir)}`)
    console.log()

    mkdirSync(outputDir, { recursive: true })

    // Step 1: Capture
    const captureSpinner = ora('Capturing rendered page...').start()
    let captureResult
    try {
      captureResult = await capture(url, join(outputDir, '_raw.html'), {
        wait: parseInt(opts.wait),
        viewport: { width: vw, height: vh },
        chromePath: opts.chromePath,
      })
      captureSpinner.succeed(
        `Captured ${chalk.bold((captureResult.originalSize / 1024).toFixed(0) + 'KB')} in ${(captureResult.captureTimeMs / 1000).toFixed(1)}s`
      )
    } catch (err: any) {
      captureSpinner.fail(`Capture failed: ${err.message}`)
      process.exit(1)
    }

    // Step 2: Transform
    const transformSpinner = ora('Optimizing...').start()
    const start = Date.now()
    let transformResult
    try {
      transformResult = await transform(captureResult.html, outputDir, {
        deferTracking: opts.deferTracking !== false && !opts.stripTracking,
        stripTracking: !!opts.stripTracking,
        prefill: opts.prefill !== false,
        optimizeImages: opts.optimizeImages !== false,
        delayAllJs: !!opts.delayAllJs,
      })
      const transformTime = Date.now() - start
      transformSpinner.succeed(`Optimized in ${(transformTime / 1000).toFixed(1)}s`)
    } catch (err: any) {
      transformSpinner.fail(`Transform failed: ${err.message}`)
      process.exit(1)
    }

    // Step 3: Write output
    const indexPath = join(outputDir, 'index.html')
    writeFileSync(indexPath, transformResult.html, 'utf-8')

    // Summary
    const s = transformResult.stats
    console.log()
    console.log(chalk.bold('  Results:'))
    console.log(`  HTML:     ${chalk.green((s.originalHtmlSize / 1024).toFixed(0) + 'KB')} → ${chalk.bold.green((s.finalHtmlSize / 1024).toFixed(0) + 'KB')}`)

    if (s.trackingScriptsDeferred > 0) {
      console.log(`  Tracking: ${chalk.yellow(s.trackingScriptsDeferred + ' scripts deferred')} (fires on first interaction)`)
    }
    if (s.trackingScriptsStripped > 0) {
      console.log(`  Tracking: ${chalk.red(s.trackingScriptsStripped + ' scripts removed')}`)
    }
    if (s.imagesOptimized > 0) {
      const saved = transformResult.assets.reduce((sum, a) => sum + (a.originalSize - a.optimizedSize), 0)
      console.log(`  Images:   ${chalk.green(s.imagesOptimized + ' optimized')} (${(saved / 1024).toFixed(0)}KB saved)`)
    }
    if (s.fontsPreloaded > 0) {
      console.log(`  Fonts:    ${chalk.green(s.fontsPreloaded + ' preloaded')}`)
    }

    console.log()
    console.log(`  ${chalk.bold.green('✓')} ${chalk.bold(indexPath)}`)
    console.log(`  ${chalk.dim('Test prefill:')} ${chalk.cyan(url.split('?')[0] + '?email=test@example.com&fname=John&lname=Doe')}`)

    // Step 4: Visual diff (optional)
    if (opts.diff) {
      console.log(chalk.bold('  Visual Diff'))
      console.log()

      const originalScreenshot = join(outputDir, 'screenshot-original.png')
      const cloneScreenshot = join(outputDir, 'screenshot-clone.png')

      const diffSpinner = ora('Screenshotting original URL...').start()
      try {
        await takeScreenshot(url, originalScreenshot, {
          width: vw,
          height: 900,
          chromePath: opts.chromePath,
        })
        diffSpinner.text = 'Screenshotting optimized clone...'
        await takeScreenshot(indexPath, cloneScreenshot, {
          width: vw,
          height: 900,
          chromePath: opts.chromePath,
        })
        diffSpinner.succeed('Screenshots captured')

        console.log(`  Original: ${chalk.dim(originalScreenshot)}`)
        console.log(`  Clone:    ${chalk.dim(cloneScreenshot)}`)
        console.log()

        // Open both in the default image viewer (macOS)
        try {
          const { execSync: exec } = await import('node:child_process')
          exec(`open "${originalScreenshot}" "${cloneScreenshot}"`, { stdio: 'ignore' })
        } catch {
          // Non-macOS or `open` not available — no-op
        }
      } catch (err: any) {
        diffSpinner.fail(`Screenshot failed: ${err.message}`)
      }
    }

    // Step 5: Deploy (optional)
    if (opts.deploy) {
      const projectName = opts.name || new URL(url).pathname.replace(/\//g, '-').replace(/^-|-$/g, '') || 'andale-clone'
      const deploySpinner = ora(`Deploying to ${opts.deploy}...`).start()
      try {
        const result = await deploy(outputDir, opts.deploy, projectName)
        deploySpinner.succeed(`Deployed to ${chalk.bold(result.platform)}`)
        console.log(`  ${chalk.bold.cyan(result.url)}`)
      } catch (err: any) {
        deploySpinner.fail(`Deploy failed: ${err.message}`)
      }
    }

    // Step 6: Report (optional)
    if (opts.report) {
      console.log()
      console.log(chalk.bold('  PageSpeed Report'))
      console.log()

      // Run Lighthouse on original URL
      const originalSpinner = ora('Running Lighthouse on original URL...').start()
      let originalMetrics
      try {
        originalMetrics = await runLighthouse(url)
        originalSpinner.succeed(`Original: Performance ${chalk.bold(String(originalMetrics.performanceScore))}`)
      } catch (err: any) {
        originalSpinner.fail(`Lighthouse failed on original URL: ${err.message}`)
        console.log()
        process.exit(0)
      }

      // Serve the clone directory and run Lighthouse on it
      const cloneSpinner = ora('Running Lighthouse on optimized clone...').start()
      let cloneMetrics
      try {
        const { server, port } = await serveDirectory(outputDir)
        try {
          cloneMetrics = await runLighthouse(`http://127.0.0.1:${port}/`)
          cloneSpinner.succeed(`Clone:    Performance ${chalk.bold(String(cloneMetrics.performanceScore))}`)
        } finally {
          server.close()
        }
      } catch (err: any) {
        cloneSpinner.fail(`Lighthouse failed on clone: ${err.message}`)
        console.log()
        process.exit(0)
      }

      // Display comparison table
      const comparison = buildComparison(originalMetrics, cloneMetrics)
      const table = await renderComparisonTable(comparison)
      console.log()
      console.log(table)
    }

    console.log()
  })

program.parse()
