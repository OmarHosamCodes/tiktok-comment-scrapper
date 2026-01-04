import { useCallback, useState } from "react";

export type Platform =
	| "tiktok"
	| "facebook"
	| "instagram"
	| "youtube"
	| "unknown";

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
	platform: Platform;
	needs_auth?: boolean;
	auth_message?: string;
}

export type ScraperStatus = "idle" | "loading" | "success" | "error";

interface UseScraperReturn {
	status: ScraperStatus;
	result: ScrapeResult | null;
	error: string;
	platform: Platform;
	scrape: (url: string) => Promise<void>;
	reset: () => void;
}

/**
 * Detect platform from URL
 */
function detectPlatform(url: string): Platform {
	const normalizedUrl = url.toLowerCase().trim();

	if (
		/tiktok\.com/.test(normalizedUrl) ||
		/vm\.tiktok\.com/.test(normalizedUrl) ||
		/vt\.tiktok\.com/.test(normalizedUrl)
	) {
		return "tiktok";
	}

	if (/youtube\.com/.test(normalizedUrl) || /youtu\.be/.test(normalizedUrl)) {
		return "youtube";
	}

	if (/instagram\.com/.test(normalizedUrl)) {
		return "instagram";
	}

	if (/facebook\.com/.test(normalizedUrl) || /fb\.watch/.test(normalizedUrl)) {
		return "facebook";
	}

	return "unknown";
}

/**
 * Validate URL for supported platforms
 */
function isValidUrl(input: string): boolean {
	const platform = detectPlatform(input);
	return platform !== "unknown";
}

export function useScraper(): UseScraperReturn {
	const [status, setStatus] = useState<ScraperStatus>("idle");
	const [result, setResult] = useState<ScrapeResult | null>(null);
	const [error, setError] = useState("");
	const [platform, setPlatform] = useState<Platform>("unknown");

	const scrape = useCallback(async (url: string) => {
		const detectedPlatform = detectPlatform(url);
		setPlatform(detectedPlatform);

		if (!isValidUrl(url)) {
			setError(
				"Please enter a valid TikTok, YouTube, Instagram, or Facebook URL",
			);
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
				body: JSON.stringify({ url }),
			});

			if (!response.ok) {
				const errorData = (await response.json()) as { error?: string };
				throw new Error(errorData.error || "Scraping failed");
			}

			const data = (await response.json()) as ScrapeResult;
			setResult(data);
			setPlatform(data.platform || detectedPlatform);
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
		setPlatform("unknown");
	}, []);

	return {
		status,
		result,
		error,
		platform,
		scrape,
		reset,
	};
}
