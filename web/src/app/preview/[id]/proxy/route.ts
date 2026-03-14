import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/jobs";

/**
 * Proxy external images for preview pages.
 *
 * When a cloned page references external images (e.g. cdn.sanity.io),
 * those URLs may be blocked by hotlink protection or CORS when served
 * from andale.sh. This endpoint fetches and proxies them.
 *
 * Usage: /preview/<jobId>/proxy?url=https://cdn.sanity.io/...
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Verify job exists and is done
  const job = getJob(id);
  if (!job || job.status !== "done") {
    return new NextResponse("Not found", { status: 404 });
  }

  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return new NextResponse("Missing url param", { status: 400 });
  }

  // Security: only allow http/https URLs, no local/private IPs
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return new NextResponse("Invalid URL", { status: 400 });
  }

  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    return new NextResponse("Only http/https allowed", { status: 400 });
  }

  // Block private IP ranges
  const blocked = ["localhost", "127.", "192.168.", "10.", "172.16.", "0.0.0.0"];
  if (blocked.some((b) => parsedUrl.hostname.startsWith(b))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Andale/1.0; +https://andale.sh)",
        "Accept": "image/*,*/*;q=0.8",
      },
      // 10 second timeout
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return new NextResponse(`Upstream error: ${response.status}`, { status: 502 });
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const buffer = await response.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
        "X-Andale-Proxy": "true",
      },
    });
  } catch (err: unknown) {
    console.error("[andale] Image proxy error:", err);
    return new NextResponse("Proxy error", { status: 502 });
  }
}
