import { useState } from "react";

type Status = "idle" | "loading" | "success" | "error";

interface Comment {
  comment_id: string;
  username: string;
  nickname: string;
  comment: string;
  create_time: string;
  avatar: string;
  total_reply: number;
  replies: Comment[];
}

interface ScrapeResult {
  caption: string;
  video_url: string;
  comments: Comment[];
  has_more: number;
}

export function App() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [error, setError] = useState("");

  const extractVideoId = (input: string): string | null => {
    // Direct ID input
    if (/^\d+$/.test(input.trim())) {
      return input.trim();
    }

    // URL patterns
    const patterns = [
      /tiktok\.com\/@[^/]+\/video\/(\d+)/,
      /tiktok\.com\/.*?\/video\/(\d+)/,
      /vm\.tiktok\.com\/(\w+)/,
      /tiktok\.com\/t\/(\w+)/,
    ];

    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  };

  const handleScrape = async () => {
    const videoId = extractVideoId(url);
    if (!videoId) {
      setError("Please enter a valid TikTok video URL or ID");
      return;
    }

    setStatus("loading");
    setProgress("Initializing browser...");
    setError("");
    setResult(null);

    try {
      const eventSource = new EventSource(`/api/scrape?id=${videoId}`);

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "progress") {
          setProgress(data.message);
        } else if (data.type === "complete") {
          setResult(data.result);
          setStatus("success");
          eventSource.close();
        } else if (data.type === "error") {
          setError(data.message);
          setStatus("error");
          eventSource.close();
        }
      };

      eventSource.onerror = () => {
        setError("Connection lost. Please try again.");
        setStatus("error");
        eventSource.close();
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setStatus("error");
    }
  };

  const handleDownloadJson = () => {
    if (!result) return;

    const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tiktok-comments-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadZip = async () => {
    if (!result) return;

    setProgress("Generating comment images...");
    setStatus("loading");

    try {
      const response = await fetch("/api/generate-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result),
      });

      if (!response.ok) {
        throw new Error("Failed to generate ZIP file");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tiktok-comments-${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate ZIP");
      setStatus("error");
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-white/10 backdrop-blur-xl bg-white/5">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 via-red-500 to-yellow-500 flex items-center justify-center shadow-lg shadow-pink-500/25">
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-pink-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
                TikTok Comment Scraper
              </h1>
              <p className="text-xs text-slate-400">
                Extract and download video comments
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-6 py-12">
        <div className="max-w-3xl mx-auto">
          {/* Input Section */}
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-pink-500/20 via-purple-500/20 to-cyan-500/20 rounded-3xl blur-xl"></div>
            <div className="relative bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
              <h2 className="text-2xl font-bold text-white mb-2">
                Enter TikTok Video
              </h2>
              <p className="text-slate-400 mb-6">
                Paste a TikTok video URL or video ID to extract all comments
              </p>

              <div className="flex gap-4">
                <div className="flex-1 relative group">
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://www.tiktok.com/@user/video/7581857692432583991"
                    className="w-full px-5 py-4 bg-slate-800/50 border border-white/10 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500/50 transition-all duration-300"
                    disabled={status === "loading"}
                  />
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 opacity-0 group-focus-within:opacity-20 transition-opacity duration-300 pointer-events-none"></div>
                </div>
                <button
                  onClick={handleScrape}
                  disabled={status === "loading" || !url.trim()}
                  className="px-8 py-4 bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 rounded-2xl font-semibold text-white shadow-lg shadow-pink-500/25 hover:shadow-pink-500/40 hover:scale-105 active:scale-95 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  {status === "loading" ? (
                    <div className="flex items-center gap-2">
                      <svg
                        className="animate-spin h-5 w-5"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      <span>Scraping...</span>
                    </div>
                  ) : (
                    "Scrape"
                  )}
                </button>
              </div>

              {/* Progress */}
              {status === "loading" && (
                <div className="mt-6 p-4 bg-slate-800/50 rounded-xl border border-white/5">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
                    <span className="text-slate-300 text-sm">{progress}</span>
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <div className="flex items-center gap-3 text-red-400">
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span className="text-sm">{error}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Results Section */}
          {result && (
            <div className="mt-8 space-y-6">
              {/* Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
                  <div className="text-3xl font-bold bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text text-transparent">
                    {result.comments.length}
                  </div>
                  <div className="text-slate-400 text-sm mt-1">
                    Total Comments
                  </div>
                </div>
                <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
                  <div className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
                    {result.comments.reduce(
                      (acc, c) => acc + c.replies.length,
                      0
                    )}
                  </div>
                  <div className="text-slate-400 text-sm mt-1">
                    Total Replies
                  </div>
                </div>
                <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
                  <div className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-green-400 bg-clip-text text-transparent">
                    {new Set(result.comments.map((c) => c.username)).size}
                  </div>
                  <div className="text-slate-400 text-sm mt-1">
                    Unique Users
                  </div>
                </div>
              </div>

              {/* Caption */}
              {result.caption && (
                <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
                  <h3 className="text-sm font-medium text-slate-400 mb-2">
                    Video Caption
                  </h3>
                  <p className="text-white">{result.caption}</p>
                </div>
              )}

              {/* Download Buttons */}
              <div className="flex flex-wrap gap-4">
                <button
                  onClick={handleDownloadJson}
                  className="flex-1 sm:flex-none px-6 py-4 bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 rounded-2xl font-medium text-white flex items-center justify-center gap-3 transition-all duration-300 hover:scale-105 active:scale-95"
                >
                  <svg
                    className="w-5 h-5 text-emerald-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  Download JSON
                </button>
                <button
                  onClick={handleDownloadZip}
                  disabled={status === "loading"}
                  className="flex-1 sm:flex-none px-6 py-4 bg-gradient-to-r from-pink-500/20 to-purple-500/20 hover:from-pink-500/30 hover:to-purple-500/30 border border-pink-500/20 rounded-2xl font-medium text-white flex items-center justify-center gap-3 transition-all duration-300 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg
                    className="w-5 h-5 text-pink-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  Download as Images (ZIP)
                </button>
              </div>

              {/* Comments Preview */}
              <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-white/10 flex items-center justify-between">
                  <h3 className="font-semibold text-white">Comments Preview</h3>
                  <span className="text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded-full">
                    Showing first 10
                  </span>
                </div>
                <div className="divide-y divide-white/5 max-h-96 overflow-y-auto">
                  {result.comments.slice(0, 10).map((comment) => (
                    <div key={comment.comment_id} className="p-4 hover:bg-white/5 transition-colors">
                      <div className="flex items-start gap-3">
                        <img
                          src={comment.avatar}
                          alt={comment.username}
                          className="w-10 h-10 rounded-full object-cover bg-slate-700"
                          loading="lazy"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white truncate">
                              {comment.nickname}
                            </span>
                            <span className="text-slate-500 text-xs">
                              @{comment.username}
                            </span>
                          </div>
                          <p className="text-slate-300 text-sm mt-1">
                            {comment.comment}
                          </p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                            <span>{comment.create_time}</span>
                            {comment.total_reply > 0 && (
                              <span>{comment.total_reply} replies</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-6">
        <div className="container mx-auto px-6 text-center text-sm text-slate-500">
          Built with Bun + React + Tailwind CSS
        </div>
      </footer>
    </div>
  );
}
