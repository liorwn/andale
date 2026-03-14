"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to start optimization");
      }

      const { jobId } = await res.json();
      router.push(`/job/${jobId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <main className="flex w-full max-w-2xl flex-col items-center gap-12">
        {/* Logo / Brand */}
        <div className="flex flex-col items-center gap-4">
          <h1 className="text-6xl font-bold tracking-tight text-accent">
            andale
          </h1>
          <p className="text-xl text-text-muted">Your page, but faster.</p>
        </div>

        {/* Description */}
        <div className="text-center max-w-lg">
          <p className="text-text-muted leading-relaxed">
            Paste any URL. Andale captures the fully rendered page, defers
            tracking scripts, optimizes images, and outputs a static clone that
            loads in under a second. Same pixels, zero bloat.
          </p>
        </div>

        {/* URL Input Form */}
        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
          <div className="flex gap-3">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/landing-page"
              required
              className="flex-1 rounded-lg border border-border bg-bg-input px-5 py-4 text-lg text-text placeholder:text-text-muted/50 outline-none transition-colors focus:border-border-focus focus:ring-1 focus:ring-accent/30 font-mono"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-accent px-8 py-4 text-lg font-semibold text-bg transition-colors hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg
                    className="animate-spin h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Starting...
                </span>
              ) : (
                "Optimize"
              )}
            </button>
          </div>

          {error && (
            <p className="text-error text-sm px-1">{error}</p>
          )}
        </form>

        {/* Features */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 w-full mt-4">
          <Feature
            title="Defer Tracking"
            description="GTM, GA, Facebook Pixel, HotJar, and 20+ vendors deferred to post-interaction. Zero TBT."
          />
          <Feature
            title="Optimize Assets"
            description="Inline images extracted and converted to WebP. Fonts preloaded. Critical path cleared."
          />
          <Feature
            title="Lighthouse Report"
            description="Before/after PageSpeed comparison. See the exact improvement in every Core Web Vital."
          />
        </div>

        {/* Footer */}
        <div className="flex flex-col items-center gap-3 mt-8">
          <p className="text-text-muted/40 text-sm">
            Built for marketing teams that need speed without rebuilding.
          </p>
          <div className="flex items-center gap-4 text-sm">
            <a
              href="https://github.com/liorwn/andale"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-text-muted/50 hover:text-accent transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
              Open Source
            </a>
            <span className="text-text-muted/20">·</span>
            <a
              href="https://www.npmjs.com/package/andale-cli"
              target="_blank"
              rel="noopener noreferrer"
              className="text-text-muted/50 hover:text-accent transition-colors font-mono"
            >
              npx andale-cli
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}

function Feature({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-bg-card p-5">
      <h3 className="text-sm font-semibold text-accent mb-2">{title}</h3>
      <p className="text-sm text-text-muted leading-relaxed">{description}</p>
    </div>
  );
}
