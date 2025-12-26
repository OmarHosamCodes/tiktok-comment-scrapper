import { useCallback, useState } from "react";

export interface Comment {
	comment_id: string;
	username: string;
	nickname: string;
	comment: string;
	create_time: string;
	avatar: string;
	total_reply: number;
	replies: Comment[];
	parent_comment_id?: string;
	is_orphan_reply?: boolean;
}

export interface ScrapeResult {
	caption: string;
	video_url: string;
	comments: Comment[];
	has_more: number;
}

export type ScraperStatus = "idle" | "loading" | "success" | "error";

interface UseScraperReturn {
	status: ScraperStatus;
	result: ScrapeResult | null;
	error: string;
	scrape: (url: string) => Promise<void>;
	reset: () => void;
}

export function useScraper(): UseScraperReturn {
	const [status, setStatus] = useState<ScraperStatus>("idle");
	const [result, setResult] = useState<ScrapeResult | null>(null);
	const [error, setError] = useState("");

	const scrape = useCallback(async (url: string) => {
		// Extract video ID or use URL directly
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

		const videoIdOrShortCode = extractVideoId(url);
		if (!videoIdOrShortCode && !isShortUrl(url)) {
			setError("Please enter a valid TikTok video URL or ID");
			setStatus("error");
			return;
		}

		setStatus("loading");
		setError("");
		setResult(null);

		try {
			const response = await fetch("/api/scrape", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(
					isShortUrl(url) ? { url } : { id: videoIdOrShortCode },
				),
			});

			if (!response.ok) {
				const errorData = (await response.json()) as { error?: string };
				throw new Error(errorData.error || "Scraping failed");
			}

			const data = (await response.json()) as ScrapeResult;
			setResult(data);
			setStatus("success");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Scraping failed");
			setStatus("error");
		}
	}, []);

	const reset = useCallback(() => {
		setStatus("idle");
		setResult(null);
		setError("");
	}, []);

	return {
		status,
		result,
		error,
		scrape,
		reset,
	};
}
