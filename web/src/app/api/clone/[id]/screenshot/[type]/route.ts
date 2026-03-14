import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/jobs";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; type: string }> }
) {
  const { id, type } = await params;

  if (type !== "original" && type !== "clone") {
    return NextResponse.json(
      { error: 'Type must be "original" or "clone"' },
      { status: 400 }
    );
  }

  const job = getJob(id);

  if (!job || job.status !== "done" || !job.result?.outputPath) {
    return NextResponse.json(
      { error: "Job not found or not complete" },
      { status: 404 }
    );
  }

  const filename = `screenshot-${type}.png`;
  const screenshotPath = join(job.result.outputPath, filename);

  if (!existsSync(screenshotPath)) {
    return NextResponse.json(
      { error: "Screenshot not available" },
      { status: 404 }
    );
  }

  const imageBuffer = readFileSync(screenshotPath);

  return new NextResponse(imageBuffer, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
