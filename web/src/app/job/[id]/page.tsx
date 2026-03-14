"use client";

import { useEffect, useState, useRef, use } from "react";
import Link from "next/link";

type JobStatus =
  | "queued"
  | "capturing"
  | "transforming"
  | "lighthouse"
  | "done"
  | "error";

interface LighthouseMetrics {
  performanceScore: number;
  fcp: number;
  lcp: number;
  tbt: number;
  cls: number;
  si: number;
}

interface MetricDelta {
  performanceScore: number;
  fcp: number;
  lcp: number;
  tbt: number;
  cls: number;
  si: number;
}

interface ChangeLogEntry {
  type: string;
  category: string;
  description: string;
  detail?: string;
}

interface ScriptProfile {
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

interface ScriptProfilingResult {
  profiles: ScriptProfile[];
  gtmContainerId?: string;
  totalEstimatedTbtMs: number;
  totalEstimatedSizeKb: number;
  recommendations: string[];
}

interface JobResult {
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

interface JobData {
  id: string;
  url: string;
  status: JobStatus;
  progress: number;
  message: string;
  result?: JobResult;
  error?: string;
}

const STAGES: { key: JobStatus; label: string }[] = [
  { key: "queued", label: "Queued" },
  { key: "capturing", label: "Capturing Page" },
  { key: "transforming", label: "Optimizing" },
  { key: "lighthouse", label: "Running Lighthouse" },
  { key: "done", label: "Complete" },
];

function stageIndex(status: JobStatus): number {
  if (status === "error") return -1;
  return STAGES.findIndex((s) => s.key === status);
}

export default function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [job, setJob] = useState<JobData | null>(null);
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource(`/api/clone/${id}/progress`);
    eventSourceRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setJob(data);
        if (data.status === "done" || data.status === "error") {
          es.close();
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
    };

    return () => {
      es.close();
    };
  }, [id]);

  if (!job) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="text-text-muted">Connecting to job...</p>
        </div>
      </div>
    );
  }

  const currentStage = stageIndex(job.status);
  const isError = job.status === "error";
  const isDone = job.status === "done";

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-16">
      <div className="w-full max-w-3xl flex flex-col gap-10">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="text-accent hover:text-accent-hover transition-colors text-sm font-medium"
          >
            &larr; New optimization
          </Link>
          {connected && !isDone && !isError && (
            <span className="flex items-center gap-2 text-xs text-text-muted">
              <span className="h-2 w-2 rounded-full bg-accent animate-pulse-glow" />
              Live
            </span>
          )}
        </div>

        {/* URL */}
        <div>
          <p className="text-text-muted text-sm mb-1">Optimizing</p>
          <p className="font-mono text-lg text-text break-all">{job.url}</p>
        </div>

        {/* Progress Stages */}
        <div className="flex flex-col gap-1">
          {STAGES.map((stage, i) => {
            const isActive = i === currentStage && !isDone && !isError;
            const isComplete = i < currentStage || isDone;
            const isPending = i > currentStage && !isDone;

            return (
              <div
                key={stage.key}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                  isActive
                    ? "bg-accent-dim border border-accent/20"
                    : isComplete
                    ? "opacity-60"
                    : "opacity-30"
                }`}
              >
                {/* Status icon */}
                <div className="w-6 h-6 flex items-center justify-center shrink-0">
                  {isComplete && (
                    <svg
                      className="w-5 h-5 text-accent"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                  {isActive && (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                  )}
                  {isPending && (
                    <div className="h-3 w-3 rounded-full border border-border" />
                  )}
                </div>

                <span
                  className={`text-sm font-medium ${
                    isActive ? "text-accent" : "text-text"
                  }`}
                >
                  {stage.label}
                </span>

                {isActive && job.message && (
                  <span className="text-xs text-text-muted ml-auto">
                    {job.message}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Progress bar */}
        {!isDone && !isError && (
          <div className="w-full h-1.5 rounded-full bg-bg-card overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-500 ease-out"
              style={{ width: `${job.progress}%` }}
            />
          </div>
        )}

        {/* Error state */}
        {isError && (
          <div className="rounded-lg border border-error/30 bg-error/5 p-6">
            <p className="text-error font-medium mb-2">Optimization failed</p>
            <p className="text-text-muted text-sm font-mono">{job.error}</p>
            <Link
              href="/"
              className="mt-4 inline-block text-sm text-accent hover:text-accent-hover transition-colors"
            >
              Try again
            </Link>
          </div>
        )}

        {/* Results */}
        {isDone && job.result && (
          <div className="flex flex-col gap-8">
            {/* Visual Comparison */}
            {job.result.hasScreenshots && (
              <VisualComparison jobId={id} />
            )}

            {/* Transform Stats */}
            {job.result.stats && <TransformStats stats={job.result.stats} />}

            {/* Changelog — what was modified */}
            {job.result.changelog && job.result.changelog.length > 0 && (
              <ChangeLog entries={job.result.changelog} />
            )}

            {/* Script Analysis */}
            {job.result.profiling && job.result.profiling.profiles.length > 0 && (
              <ScriptAnalysis profiling={job.result.profiling} />
            )}

            {/* Lighthouse Comparison */}
            {job.result.metrics && (
              <ComparisonTable metrics={job.result.metrics} />
            )}

            {/* Live Preview */}
            {job.result.outputPath && (
              <div className="rounded-lg border border-accent/30 bg-accent-dim p-6">
                <h3 className="text-sm font-semibold text-accent uppercase tracking-wider mb-3">
                  Live Preview
                </h3>
                <p className="text-text-muted text-sm mb-4">
                  Your optimized page is live. Share this URL or test it on PageSpeed Insights.
                </p>
                <div className="flex items-center gap-2 bg-bg rounded-lg px-4 py-3 font-mono text-sm text-text mb-4 border border-border">
                  <span className="flex-1 truncate">andale.sh/preview/{id}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`https://andale.sh/preview/${id}`);
                    }}
                    className="text-text-muted hover:text-accent transition-colors shrink-0"
                    title="Copy URL"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                    </svg>
                  </button>
                </div>
                <div className="flex gap-3">
                  <a
                    href={`/preview/${id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-bg transition-colors hover:bg-accent-hover"
                  >
                    Open Preview
                  </a>
                  <a
                    href={`https://pagespeed.web.dev/analysis?url=${encodeURIComponent(`https://andale.sh/preview/${id}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-accent/40 px-6 py-3 text-sm font-semibold text-accent transition-colors hover:bg-accent-dim"
                  >
                    Test on PageSpeed Insights
                  </a>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              {job.result.outputPath && (
                <a
                  href={`/api/clone/${id}/download`}
                  className="rounded-lg border border-border px-6 py-3 text-sm font-medium text-text transition-colors hover:bg-bg-card"
                >
                  Download HTML
                </a>
              )}
              <Link
                href="/"
                className="rounded-lg border border-border px-6 py-3 text-sm font-medium text-text transition-colors hover:bg-bg-card"
              >
                Optimize Another
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function VisualComparison({ jobId }: { jobId: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg-card">
      <div className="px-6 py-4 border-b border-border">
        <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider">
          Visual Comparison
        </h3>
        <p className="text-xs text-text-muted/60 mt-1">
          Above-the-fold screenshot at 1440px viewport
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
        <div>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2 text-center">
            Original
          </p>
          <div className="rounded-lg border border-border overflow-hidden bg-bg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/clone/${jobId}/screenshot/original`}
              alt="Original page screenshot"
              className="w-full h-auto"
              loading="lazy"
            />
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-accent uppercase tracking-wider mb-2 text-center">
            Optimized Clone
          </p>
          <div className="rounded-lg border border-accent/30 overflow-hidden bg-bg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/clone/${jobId}/screenshot/clone`}
              alt="Optimized clone screenshot"
              className="w-full h-auto"
              loading="lazy"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function TransformStats({
  stats,
}: {
  stats: NonNullable<JobResult["stats"]>;
}) {
  const htmlSaved = stats.originalHtmlSize - stats.finalHtmlSize;
  const htmlPct =
    stats.originalHtmlSize > 0
      ? Math.round((htmlSaved / stats.originalHtmlSize) * 100)
      : 0;

  return (
    <div className="rounded-lg border border-border bg-bg-card p-6">
      <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">
        Optimization Summary
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="HTML Size"
          value={`${formatBytes(stats.finalHtmlSize)}`}
          detail={htmlSaved > 0 ? `${htmlPct}% smaller` : undefined}
        />
        <StatCard
          label="Tracking Deferred"
          value={String(stats.trackingScriptsDeferred)}
          detail="scripts"
        />
        <StatCard
          label="Images Optimized"
          value={String(stats.imagesOptimized)}
          detail="to WebP"
        />
        <StatCard
          label="Fonts Preloaded"
          value={String(stats.fontsPreloaded)}
        />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div>
      <p className="text-xs text-text-muted mb-1">{label}</p>
      <p className="text-2xl font-bold text-text">{value}</p>
      {detail && <p className="text-xs text-text-muted">{detail}</p>}
    </div>
  );
}

function ComparisonTable({
  metrics,
}: {
  metrics: NonNullable<JobResult["metrics"]>;
}) {
  const rows: {
    label: string;
    key: keyof LighthouseMetrics;
    format: (v: number) => string;
    lowerIsBetter: boolean;
  }[] = [
    {
      label: "Performance Score",
      key: "performanceScore",
      format: (v) => String(v),
      lowerIsBetter: false,
    },
    {
      label: "LCP",
      key: "lcp",
      format: formatMs,
      lowerIsBetter: true,
    },
    {
      label: "TBT",
      key: "tbt",
      format: formatMs,
      lowerIsBetter: true,
    },
    {
      label: "CLS",
      key: "cls",
      format: (v) => v.toFixed(2),
      lowerIsBetter: true,
    },
    {
      label: "Speed Index",
      key: "si",
      format: formatMs,
      lowerIsBetter: true,
    },
    {
      label: "FCP",
      key: "fcp",
      format: formatMs,
      lowerIsBetter: true,
    },
  ];

  return (
    <div className="rounded-lg border border-border bg-bg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border">
        <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider">
          PageSpeed Comparison
        </h3>
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-border text-xs text-text-muted uppercase tracking-wider">
            <th className="text-left px-6 py-3 font-medium">Metric</th>
            <th className="text-right px-6 py-3 font-medium">Original</th>
            <th className="text-right px-6 py-3 font-medium">Clone</th>
            <th className="text-right px-6 py-3 font-medium">Delta</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const orig = metrics.original[row.key];
            const clone = metrics.clone[row.key];
            const delta = metrics.deltas[row.key];

            const improved = row.lowerIsBetter ? delta < 0 : delta > 0;
            const regressed = row.lowerIsBetter ? delta > 0 : delta < 0;

            const deltaStr = row.key === "cls"
              ? `${delta > 0 ? "+" : ""}${delta.toFixed(2)}`
              : row.key === "performanceScore"
              ? `${delta > 0 ? "+" : ""}${delta}`
              : `${delta > 0 ? "+" : ""}${formatMs(delta)}`;

            return (
              <tr key={row.key} className="border-b border-border/50 last:border-0">
                <td className="px-6 py-3 text-sm text-text">{row.label}</td>
                <td className="px-6 py-3 text-sm text-text-muted text-right font-mono">
                  {row.format(orig)}
                </td>
                <td className="px-6 py-3 text-sm text-text font-bold text-right font-mono">
                  {row.format(clone)}
                </td>
                <td
                  className={`px-6 py-3 text-sm font-medium text-right font-mono ${
                    improved
                      ? "text-improvement"
                      : regressed
                      ? "text-regression"
                      : "text-text-muted"
                  }`}
                >
                  {deltaStr}
                  {improved ? " \u2191" : regressed ? " \u2193" : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const PRIORITY_STYLES: Record<string, { border: string; bg: string; text: string; label: string }> = {
  critical: { border: "border-red-500/40", bg: "bg-red-500/10", text: "text-red-400", label: "Critical" },
  high: { border: "border-orange-500/40", bg: "bg-orange-500/10", text: "text-orange-400", label: "High" },
  medium: { border: "border-yellow-500/40", bg: "bg-yellow-500/10", text: "text-yellow-400", label: "Medium" },
  low: { border: "border-green-500/40", bg: "bg-green-500/10", text: "text-green-400", label: "Low" },
};

const LOADING_LABELS: Record<string, string> = {
  blocking: "Blocking",
  async: "Async",
  defer: "Defer",
  "deferred-by-andale": "Deferred by Andale",
};

const TRIGGER_LABELS: Record<string, string> = {
  "page-load": "Page Load",
  "dom-ready": "DOM Ready",
  "window-loaded": "Window Loaded",
  "timer-5s": "Timer (5s)",
  "interaction-only": "First Interaction",
  "conversion-only": "Conversion Pages Only",
};

function ScriptAnalysis({ profiling }: { profiling: ScriptProfilingResult }) {
  return (
    <div className="rounded-lg border border-border bg-bg-card">
      <div className="px-6 py-4 border-b border-border">
        <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider">
          Script Analysis
        </h3>
        <p className="text-xs text-text-muted/60 mt-1">
          Tracking script profiling and GTM trigger recommendations
        </p>
      </div>

      {/* Summary bar */}
      <div className="px-6 py-4 border-b border-border/50 flex flex-wrap items-center gap-4">
        <div>
          <p className="text-xs text-text-muted">Estimated Total TBT</p>
          <p className="text-xl font-bold text-red-400">{profiling.totalEstimatedTbtMs}ms</p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Total Script Size</p>
          <p className="text-xl font-bold text-text">{profiling.totalEstimatedSizeKb}KB</p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Scripts Detected</p>
          <p className="text-xl font-bold text-text">{profiling.profiles.length}</p>
        </div>
        {profiling.gtmContainerId && (
          <div>
            <p className="text-xs text-text-muted">GTM Container</p>
            <p className="text-sm font-bold text-accent font-mono">{profiling.gtmContainerId}</p>
          </div>
        )}
      </div>

      {/* Top-level recommendations */}
      {profiling.recommendations.length > 0 && (
        <div className="px-6 py-4 border-b border-border/50">
          <p className="text-xs font-semibold text-accent uppercase tracking-wider mb-2">
            Recommendations
          </p>
          <ul className="space-y-1.5">
            {profiling.recommendations.map((rec, i) => (
              <li key={i} className="text-sm text-text-muted flex items-start gap-2">
                <span className="text-accent shrink-0 mt-0.5">-</span>
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Individual script profiles */}
      <div className="divide-y divide-border/50">
        {profiling.profiles.map((profile, i) => {
          const style = PRIORITY_STYLES[profile.priority] || PRIORITY_STYLES.low;
          return (
            <div key={i} className={`px-6 py-4 ${style.bg}`}>
              <div className="flex items-center gap-3 mb-2">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${style.border} ${style.text} border`}>
                  {style.label}
                </span>
                <span className="text-sm font-semibold text-text">{profile.vendorName}</span>
                <span className="text-xs text-text-muted font-mono">
                  ~{profile.estimatedTbtMs}ms TBT / ~{profile.estimatedSizeKb}KB
                </span>
              </div>
              {profile.src && (
                <p className="text-xs text-text-muted/60 font-mono mb-1.5 truncate">
                  {profile.src}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3 mb-2 text-xs">
                <span className="text-text-muted">
                  Current: <span className={profile.currentLoading === "blocking" ? "text-red-400 font-semibold" : "text-text"}>
                    {LOADING_LABELS[profile.currentLoading] || profile.currentLoading}
                  </span>
                </span>
                <span className="text-text-muted">
                  Recommended: <span className="text-accent font-semibold">
                    {TRIGGER_LABELS[profile.recommendedTrigger] || profile.recommendedTrigger}
                  </span>
                </span>
              </div>
              <p className="text-sm text-text-muted">{profile.recommendation}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const CHANGE_ICONS: Record<string, string> = {
  deferred: "⏸",
  stripped: "🗑",
  optimized: "🖼",
  preloaded: "⚡",
  injected: "💉",
  removed: "✂️",
};

const CATEGORY_COLORS: Record<string, string> = {
  tracking: "text-yellow-400",
  image: "text-blue-400",
  font: "text-purple-400",
  prefill: "text-cyan-400",
  consent: "text-orange-400",
};

function ChangeLog({ entries }: { entries: ChangeLogEntry[] }) {
  return (
    <div className="rounded-lg border border-border bg-bg-card">
      <div className="px-6 py-4 border-b border-border">
        <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider">
          Changes Made
        </h3>
        <p className="text-xs text-text-muted/60 mt-1">
          Every modification Andale made to the page
        </p>
      </div>
      <div className="divide-y divide-border/50">
        {entries.map((entry, i) => (
          <div key={i} className="px-6 py-3 flex items-start gap-3">
            <span className="text-base shrink-0 mt-0.5" title={entry.type}>
              {CHANGE_ICONS[entry.type] || "•"}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${CATEGORY_COLORS[entry.category] || "text-text-muted"}`}>
                  {entry.category}
                </span>
                <span className="text-sm text-text">{entry.description}</span>
              </div>
              {entry.detail && (
                <p className="text-xs text-text-muted/60 mt-0.5 font-mono">
                  {entry.detail}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatMs(ms: number): string {
  const abs = Math.abs(ms);
  if (abs >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${Math.round(ms)}ms`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }
  return `${Math.round(bytes / 1024)}KB`;
}
