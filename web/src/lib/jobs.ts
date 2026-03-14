export type JobStatus =
  | "queued"
  | "capturing"
  | "transforming"
  | "lighthouse"
  | "done"
  | "error";

export interface LighthouseMetrics {
  performanceScore: number;
  fcp: number;
  lcp: number;
  tbt: number;
  cls: number;
  si: number;
}

export interface MetricDelta {
  performanceScore: number;
  fcp: number;
  lcp: number;
  tbt: number;
  cls: number;
  si: number;
}

export interface ChangeLogEntry {
  type: string;
  category: string;
  description: string;
  detail?: string;
}

export interface ScriptProfile {
  vendor: string;
  vendorName: string;
  src?: string;
  type: "external" | "inline" | "gtm-child";
  estimatedSizeKb: number;
  estimatedTbtMs: number;
  currentLoading: "blocking" | "async" | "defer" | "deferred-by-andale";
  recommendedTrigger:
    | "page-load"
    | "dom-ready"
    | "window-loaded"
    | "timer-5s"
    | "interaction-only"
    | "conversion-only";
  priority: "critical" | "high" | "medium" | "low";
  recommendation: string;
  detail?: string;
}

export interface ScriptProfilingResult {
  profiles: ScriptProfile[];
  gtmContainerId?: string;
  totalEstimatedTbtMs: number;
  totalEstimatedSizeKb: number;
  recommendations: string[];
}

export interface JobResult {
  metrics?: {
    original: LighthouseMetrics;
    clone: LighthouseMetrics;
    deltas: MetricDelta;
  };
  stats?: {
    trackingScriptsDeferred: number;
    trackingScriptsStripped: number;
    imagesOptimized: number;
    fontsPreloaded: number;
    originalHtmlSize: number;
    finalHtmlSize: number;
    totalAssetSize: number;
  };
  changelog?: ChangeLogEntry[];
  profiling?: ScriptProfilingResult;
  outputPath?: string;
  deployUrl?: string;
  hasScreenshots?: boolean;
}

export interface Job {
  id: string;
  url: string;
  status: JobStatus;
  progress: number; // 0-100
  message: string;
  result?: JobResult;
  error?: string;
  createdAt: Date;
}

// In-memory store. Fine for single-instance MVP.
const jobs = new Map<string, Job>();

// SSE listeners per job
const listeners = new Map<string, Set<(job: Job) => void>>();

export function createJob(url: string): Job {
  const id = crypto.randomUUID();
  const job: Job = {
    id,
    url,
    status: "queued",
    progress: 0,
    message: "Queued...",
    createdAt: new Date(),
  };
  jobs.set(id, job);
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function updateJob(
  id: string,
  update: Partial<Pick<Job, "status" | "progress" | "message" | "result" | "error">>
): Job | undefined {
  const job = jobs.get(id);
  if (!job) return undefined;

  Object.assign(job, update);

  // Notify listeners
  const jobListeners = listeners.get(id);
  if (jobListeners) {
    for (const fn of jobListeners) {
      fn(job);
    }
  }

  return job;
}

export function subscribe(id: string, fn: (job: Job) => void): () => void {
  if (!listeners.has(id)) {
    listeners.set(id, new Set());
  }
  listeners.get(id)!.add(fn);

  return () => {
    const set = listeners.get(id);
    if (set) {
      set.delete(fn);
      if (set.size === 0) listeners.delete(id);
    }
  };
}

// === CLEANUP ===

const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // check every hour

/**
 * Remove jobs older than 24 hours and delete their output directories.
 */
function cleanupExpiredJobs() {
  const now = Date.now();
  let cleaned = 0;

  for (const [id, job] of jobs) {
    const age = now - job.createdAt.getTime();
    if (age > MAX_AGE_MS) {
      // Delete output directory
      if (job.result?.outputPath) {
        try {
          const { rmSync } = require("node:fs");
          rmSync(job.result.outputPath, { recursive: true, force: true });
        } catch {
          // directory may already be gone
        }
      }

      // Remove from maps
      jobs.delete(id);
      listeners.delete(id);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`[andale] Cleanup: removed ${cleaned} expired jobs`);
  }
}

// Start cleanup interval (runs in the Node.js process)
if (typeof globalThis !== "undefined") {
  // Avoid duplicate intervals on hot reload
  const key = "__andale_cleanup_interval__";
  const g = globalThis as Record<string, unknown>;
  if (!g[key]) {
    g[key] = setInterval(cleanupExpiredJobs, CLEANUP_INTERVAL_MS);
    console.log("[andale] Cleanup scheduler started (24h TTL, hourly check)");
  }
}
