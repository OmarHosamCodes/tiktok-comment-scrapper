import { useCallback, useRef, useState } from "react";

export interface Comment {
    comment_id: string;
    username: string;
    nickname: string;
    comment: string;
    create_time: string;
    avatar: string;
    total_reply: number;
    replies: Comment[];
}

export interface ScrapeResult {
    caption: string;
    video_url: string;
    comments: Comment[];
    has_more: number;
}

export type ScraperStatus = "idle" | "loading" | "streaming" | "success" | "error";

interface UseScraperReturn {
    status: ScraperStatus;
    progress: string;
    result: ScrapeResult | null;
    streamingComments: Comment[];
    error: string;
    scrape: (url: string) => void;
    reset: () => void;
}

export function useScraper(): UseScraperReturn {
    const [status, setStatus] = useState<ScraperStatus>("idle");
    const [progress, setProgress] = useState("");
    const [result, setResult] = useState<ScrapeResult | null>(null);
    const [streamingComments, setStreamingComments] = useState<Comment[]>([]);
    const [error, setError] = useState("");
    const eventSourceRef = useRef<EventSource | null>(null);

    const extractVideoId = (input: string): string | null => {
        if (/^\d+$/.test(input.trim())) {
            return input.trim();
        }

        const patterns = [
            /tiktok\.com\/@[^/]+\/video\/(\d+)/,
            /tiktok\.com\/.*?\/video\/(\d+)/,
            /vm\.tiktok\.com\/(\w+)/,
            /vt\.tiktok\.com\/(\w+)/,
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

    const isShortUrl = (input: string): boolean => {
        return (
            /(?:vm|vt)\.tiktok\.com\/\w+/.test(input) ||
            /tiktok\.com\/t\/\w+/.test(input)
        );
    };

    const scrape = useCallback((url: string) => {
        const videoIdOrShortCode = extractVideoId(url);
        if (!videoIdOrShortCode) {
            setError("Please enter a valid TikTok video URL or ID");
            return;
        }

        // Cleanup previous EventSource
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
        }

        setStatus("loading");
        setProgress("Initializing...");
        setError("");
        setResult(null);
        setStreamingComments([]);

        const needsResolve = isShortUrl(url);
        const endpoint = needsResolve
            ? `/api/scrape?url=${encodeURIComponent(url)}`
            : `/api/scrape?id=${videoIdOrShortCode}`;

        const eventSource = new EventSource(endpoint);
        eventSourceRef.current = eventSource;

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.type === "progress") {
                setProgress(data.message);
                if (data.message.includes("Fetching")) {
                    setStatus("streaming");
                }
            } else if (data.type === "comment") {
                // Stream individual comments as they arrive
                setStreamingComments((prev) => [...prev, data.comment]);
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
    }, []);

    const reset = useCallback(() => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
        }
        setStatus("idle");
        setProgress("");
        setResult(null);
        setStreamingComments([]);
        setError("");
    }, []);

    return {
        status,
        progress,
        result,
        streamingComments,
        error,
        scrape,
        reset,
    };
}
