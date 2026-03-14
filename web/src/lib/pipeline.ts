import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { updateJob } from "./jobs";

/**
 * Load a module from the andale core library at runtime.
 * Uses createRequire to avoid Turbopack static analysis of dynamic imports.
 * At runtime (in Docker or local dev), the core library lives at ../../src/ or ../../dist/.
 */
function loadCoreModule(moduleName: string) {
  // Search multiple possible locations for the compiled core library:
  // - Local dev: ../dist/ relative to web/
  // - Docker standalone: various paths depending on copy strategy
  // - Docker /app root: where Dockerfile builds core
  const cwd = process.cwd();
  const searchPaths = [
    resolve(cwd, "..", "dist", `${moduleName}.js`),           // local dev (web/ -> ../dist/)
    resolve(cwd, "..", "..", "dist", `${moduleName}.js`),      // standalone (web/.next/standalone/web -> ../../dist/)
    resolve("/app", "dist", `${moduleName}.js`),               // Docker /app/dist/
    resolve("/app", "web", ".next", "standalone", "dist", `${moduleName}.js`), // Docker standalone copy
    resolve(cwd, "dist", `${moduleName}.js`),                  // dist in cwd
  ];

  console.log(`[andale] Loading core module "${moduleName}", CWD: ${cwd}`);
  console.log(`[andale] Search paths:`, searchPaths);

  for (const p of searchPaths) {
    const found = existsSync(p);
    console.log(`[andale]   ${found ? '✓' : '✗'} ${p}`);
    if (found) {
      const req = createRequire(import.meta.url);
      return req(p);
    }
  }

  throw new Error(
    `Could not find andale core module "${moduleName}". Searched: ${searchPaths.join(", ")}. ` +
    `Make sure to run "npm run build" in the andale root directory first. CWD: ${cwd}`
  );
}

/**
 * Run the full andale pipeline for a job.
 * Imports from the core library and streams progress via the job store.
 *
 * For the MVP, this runs in-process (no queue). Only one clone at a time.
 */
export async function runPipeline(
  jobId: string,
  url: string,
  _options?: Record<string, unknown>
) {
  const outputDir = join(tmpdir(), "andale", jobId);
  mkdirSync(outputDir, { recursive: true });

  try {
    // --- Stage 1: Capture ---
    updateJob(jobId, {
      status: "capturing",
      progress: 10,
      message: "Launching headless browser...",
    });

    const { capture } = loadCoreModule("capture");

    const captureResult = await capture(url, join(outputDir, "_raw.html"), {
      wait: 8000,
      viewport: { width: 1440, height: 4000 },
    });

    updateJob(jobId, {
      progress: 30,
      message: `Captured ${Math.round(captureResult.originalSize / 1024)}KB`,
    });

    // --- Stage 2: Transform ---
    updateJob(jobId, {
      status: "transforming",
      progress: 40,
      message: "Deferring tracking scripts...",
    });

    const { transform } = loadCoreModule("transform");

    const transformResult = await transform(captureResult.html, outputDir, {
      deferTracking: true,
      stripTracking: false,
      prefill: true,
      optimizeImages: true,
    });

    // Write final HTML
    const indexPath = join(outputDir, "index.html");
    writeFileSync(indexPath, transformResult.html, "utf-8");

    updateJob(jobId, {
      progress: 60,
      message: `Optimized: ${transformResult.stats.trackingScriptsDeferred} scripts deferred, ${transformResult.stats.imagesOptimized} images optimized`,
    });

    // --- Stage 3: Lighthouse ---
    updateJob(jobId, {
      status: "lighthouse",
      progress: 70,
      message: "Running Lighthouse on original URL...",
    });

    const { runLighthouse, buildComparison, serveDirectory } =
      loadCoreModule("report");

    let originalMetrics;
    try {
      originalMetrics = await runLighthouse(url);
    } catch (err) {
      // Lighthouse can fail on some pages - finish without comparison
      console.warn("Lighthouse failed on original URL:", err);
      updateJob(jobId, {
        status: "done",
        progress: 100,
        message: "Done (Lighthouse skipped for original URL)",
        result: {
          stats: {
            trackingScriptsDeferred:
              transformResult.stats.trackingScriptsDeferred,
            trackingScriptsStripped:
              transformResult.stats.trackingScriptsStripped,
            imagesOptimized: transformResult.stats.imagesOptimized,
            fontsPreloaded: transformResult.stats.fontsPreloaded,
            originalHtmlSize: transformResult.stats.originalHtmlSize,
            finalHtmlSize: transformResult.stats.finalHtmlSize,
            totalAssetSize: transformResult.stats.totalAssetSize,
          },
          outputPath: outputDir,
        },
      });
      return;
    }

    updateJob(jobId, {
      progress: 85,
      message: `Original score: ${originalMetrics.performanceScore}. Running on clone...`,
    });

    // Serve clone directory and run Lighthouse
    const { server, port } = await serveDirectory(outputDir);
    let cloneMetrics;
    try {
      cloneMetrics = await runLighthouse(`http://127.0.0.1:${port}/`);
    } finally {
      server.close();
    }

    const comparison = buildComparison(originalMetrics, cloneMetrics);

    // --- Done ---
    updateJob(jobId, {
      status: "done",
      progress: 100,
      message: `Done! Score: ${originalMetrics.performanceScore} → ${cloneMetrics.performanceScore}`,
      result: {
        metrics: {
          original: comparison.original,
          clone: comparison.clone,
          deltas: comparison.deltas,
        },
        stats: {
          trackingScriptsDeferred:
            transformResult.stats.trackingScriptsDeferred,
          trackingScriptsStripped:
            transformResult.stats.trackingScriptsStripped,
          imagesOptimized: transformResult.stats.imagesOptimized,
          fontsPreloaded: transformResult.stats.fontsPreloaded,
          originalHtmlSize: transformResult.stats.originalHtmlSize,
          finalHtmlSize: transformResult.stats.finalHtmlSize,
          totalAssetSize: transformResult.stats.totalAssetSize,
        },
        outputPath: outputDir,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    updateJob(jobId, {
      status: "error",
      progress: 0,
      message: "Pipeline failed",
      error: message,
    });
  }
}
