import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/jobs";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Serve the cloned page as a live preview.
 * Accessible at /preview/<jobId> — users can share this URL
 * and run PageSpeed Insights against it.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const job = getJob(id);

  if (!job || job.status !== "done" || !job.result?.outputPath) {
    return new NextResponse(
      `<!DOCTYPE html><html><body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;background:#0a0a0f;color:#999">
        <div style="text-align:center">
          <h1 style="color:#3ceba0;font-size:2em">andale</h1>
          <p>This preview is not available.</p>
          <p style="font-size:0.8em;margin-top:1em">The clone may still be processing or has expired.</p>
          <a href="/" style="color:#3ceba0;margin-top:2em;display:inline-block">Optimize a page &rarr;</a>
        </div>
      </body></html>`,
      { status: 404, headers: { "Content-Type": "text/html" } }
    );
  }

  const outputDir = job.result.outputPath;
  const indexPath = join(outputDir, "index.html");

  if (!existsSync(indexPath)) {
    return new NextResponse("Clone output not found", { status: 404 });
  }

  const html = readFileSync(indexPath, "utf-8");

  // Inject a small banner at the top so viewers know this is an Andale preview
  const banner = `
<div id="andale-preview-bar" style="position:fixed;top:0;left:0;right:0;z-index:999999;background:#0a0a0f;color:#fff;font-family:system-ui,-apple-system,sans-serif;font-size:13px;padding:8px 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #222;">
  <div style="display:flex;align-items:center;gap:12px;">
    <span style="color:#3ceba0;font-weight:700;">andale</span>
    <span style="color:#666;">Speed-optimized clone of</span>
    <span style="color:#999;font-family:monospace;font-size:12px;max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${job.url}</span>
  </div>
  <div style="display:flex;align-items:center;gap:12px;">
    <a href="https://pagespeed.web.dev/analysis?url=${encodeURIComponent(`https://andale.sh/preview/${id}`)}" target="_blank" rel="noopener" style="color:#3ceba0;text-decoration:none;font-weight:500;">Test on PageSpeed Insights &rarr;</a>
    <button onclick="document.getElementById('andale-preview-bar').remove()" style="background:none;border:none;color:#666;cursor:pointer;font-size:16px;">&times;</button>
  </div>
</div>
<div style="height:37px;"></div>`;

  // Inject noindex meta tag in <head>
  const withNoIndex = html.replace(
    /(<head[^>]*>)/i,
    `$1\n<meta name="robots" content="noindex, nofollow">`
  );

  // Rewrite external image URLs to use the proxy endpoint
  // This fixes hotlink-protected images (Sanity CDN, etc.) that block
  // cross-origin loading when served from andale.sh
  const proxyBase = `/preview/${id}/proxy?url=`
  const withProxiedImages = withNoIndex
    // Rewrite img src attributes pointing to external https URLs
    .replace(
      /(<img[^>]+src=["'])(https?:\/\/(?!andale\.sh)[^"']+)(["'])/gi,
      (_match, before, url, after) => `${before}${proxyBase}${encodeURIComponent(url)}${after}`
    )
    // Rewrite srcset attributes
    .replace(
      /(<img[^>]+srcset=["'])([^"']+)(["'])/gi,
      (_match, before, srcset, after) => {
        const rewritten = srcset.replace(
          /(https?:\/\/(?!andale\.sh)[^\s,]+)/g,
          (url: string) => `${proxyBase}${encodeURIComponent(url)}`
        )
        return `${before}${rewritten}${after}`
      }
    )
    // Rewrite CSS background-image: url(...) pointing to external URLs
    .replace(
      /(background(?:-image)?:\s*url\(["']?)(https?:\/\/(?!andale\.sh)[^"')]+)(["']?\))/gi,
      (_match, before, url, after) => `${before}${proxyBase}${encodeURIComponent(url)}${after}`
    )

  // Inject banner after <body> tag
  const injectedHtml = withProxiedImages.replace(
    /(<body[^>]*>)/i,
    `$1${banner}`
  );

  return new NextResponse(injectedHtml, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
