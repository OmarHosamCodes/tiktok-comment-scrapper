import {
  AlertCircle,
  Clock,
  ExternalLink,
  FileJson,
  Image,
  Loader2,
  MessageCircle,
  MessageSquare,
  Sparkles,
  Users,
  Zap
} from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "./components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "./components/ui/avatar";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./components/ui/card";
import { Input } from "./components/ui/input";
import { ScrollArea } from "./components/ui/scroll-area";
import { Separator } from "./components/ui/separator";

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
    if (/^\d+$/.test(input.trim())) {
      return input.trim();
    }

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

  const totalReplies = result?.comments.reduce((acc, c) => acc + c.replies.length, 0) ?? 0;
  const uniqueUsers = result ? new Set(result.comments.map((c) => c.username)).size : 0;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Animated background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-500/5 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 md:px-6 h-16 flex items-center">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-pink-500 via-purple-500 to-cyan-500">
              <MessageCircle className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold gradient-text">
                TikTok Comment Scraper
              </h1>
              <p className="text-xs text-muted-foreground">
                Extract and download video comments
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 md:px-6 py-8 md:py-12 relative z-10">
        <div className="max-w-3xl mx-auto space-y-8">
          {/* Hero Section */}
          <div className="text-center space-y-4">
            <Badge variant="gradient" className="mb-2">
              <Sparkles className="h-3 w-3 mr-1" />
              Powered by Playwright
            </Badge>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight">
              Scrape TikTok Comments{" "}
              <span className="gradient-text">in Seconds</span>
            </h2>
            <p className="text-muted-foreground text-base md:text-lg max-w-2xl mx-auto">
              Enter any TikTok video URL and extract all comments with their replies.
              Download as JSON data or beautiful SVG images.
            </p>
          </div>

          {/* Input Card */}
          <Card className="relative overflow-hidden gradient-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ExternalLink className="h-5 w-5 text-pink-500" />
                Enter TikTok Video
              </CardTitle>
              <CardDescription>
                Paste a TikTok video URL or video ID to extract all comments
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <Input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://www.tiktok.com/@user/video/7581857692432583991"
                  disabled={status === "loading"}
                  className="flex-1 h-11"
                  onKeyDown={(e) => e.key === "Enter" && handleScrape()}
                />
                <Button
                  onClick={handleScrape}
                  disabled={status === "loading" || !url.trim()}
                  variant="gradient"
                  size="xl"
                  className="w-full sm:w-auto"
                >
                  {status === "loading" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Scraping...
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4" />
                      Scrape
                    </>
                  )}
                </Button>
              </div>

              {/* Progress */}
              {status === "loading" && (
                <Alert variant="info" className="animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center gap-3">
                    <div className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
                    </div>
                    <AlertDescription>{progress}</AlertDescription>
                  </div>
                </Alert>
              )}

              {/* Error */}
              {error && (
                <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Results Section */}
          {result && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="hover:border-pink-500/50 transition-colors">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-pink-500/10">
                        <MessageSquare className="h-6 w-6 text-pink-500" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold">{result.comments.length}</div>
                        <div className="text-sm text-muted-foreground">Comments</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="hover:border-purple-500/50 transition-colors">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-500/10">
                        <MessageCircle className="h-6 w-6 text-purple-500" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold">{totalReplies}</div>
                        <div className="text-sm text-muted-foreground">Replies</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="hover:border-cyan-500/50 transition-colors">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-cyan-500/10">
                        <Users className="h-6 w-6 text-cyan-500" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold">{uniqueUsers}</div>
                        <div className="text-sm text-muted-foreground">Users</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Caption */}
              {result.caption && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Video Caption
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-foreground">{result.caption}</p>
                  </CardContent>
                </Card>
              )}

              {/* Download Buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={handleDownloadJson}
                  variant="outline"
                  size="lg"
                  className="flex-1 sm:flex-none"
                >
                  <FileJson className="h-4 w-4 text-emerald-500" />
                  Download JSON
                </Button>
                <Button
                  onClick={handleDownloadZip}
                  disabled={status === "loading"}
                  variant="secondary"
                  size="lg"
                  className="flex-1 sm:flex-none"
                >
                  <Image className="h-4 w-4 text-pink-500" />
                  Download Images (ZIP)
                </Button>
              </div>

              {/* Comments Preview */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <MessageSquare className="h-5 w-5 text-purple-500" />
                      Comments Preview
                    </CardTitle>
                    <Badge variant="secondary">First 10</Badge>
                  </div>
                </CardHeader>
                <Separator />
                <ScrollArea maxHeight="480px">
                  <div className="divide-y divide-border">
                    {result.comments.slice(0, 10).map((comment) => (
                      <div
                        key={comment.comment_id}
                        className="p-4 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex gap-4">
                          <Avatar className="h-10 w-10">
                            <AvatarImage
                              src={comment.avatar}
                              alt={comment.username}
                            />
                            <AvatarFallback>
                              {comment.nickname.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-foreground">
                                {comment.nickname}
                              </span>
                              <span className="text-muted-foreground text-sm">
                                @{comment.username}
                              </span>
                            </div>
                            <p className="text-foreground/90 text-sm">
                              {comment.comment}
                            </p>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {comment.create_time}
                              </span>
                              {comment.total_reply > 0 && (
                                <Badge variant="secondary" className="text-xs">
                                  {comment.total_reply} replies
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </Card>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-6">
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Built with <span className="text-pink-500">Bun</span> +{" "}
              <span className="text-cyan-500">React</span> +{" "}
              <span className="text-purple-500">shadcn/ui</span>
            </p>
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Sparkles className="h-4 w-4 text-yellow-500" />
              Powered by Playwright
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
