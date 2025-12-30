import {
	chromium,
	type Browser,
	type BrowserContext,
	type Page,
} from "playwright";
import { Comment, Comments } from "../types";
import { logger } from "../utils";

interface RawCommentData {
	cid: string;
	user: {
		unique_id: string;
		nickname: string;
		avatar_thumb: {
			url_list: string[];
		};
	};
	text: string;
	create_time: number;
	reply_comment_total: number;
	reply_id?: string; // Parent comment ID if this is a reply
}

interface CommentListResponse {
	comments: (RawCommentData & {
		share_info: {
			title: string;
			url: string;
		};
	})[];
	has_more: number;
	cursor: number; // Cursor for next page from API
	status_code?: number;
}

interface ReplyListResponse {
	comments?: RawCommentData[];
	has_more: number;
	cursor: number; // Cursor for next page from API
	status_code?: number;
}

// Retry configuration
const RETRY_CONFIG = {
	maxRetries: 3,
	baseDelay: 1000, // 1 second
	maxDelay: 4000, // 4 seconds
};

export class TiktokComment {
	private static readonly BASE_URL = "https://www.tiktok.com";
	private static readonly API_URL = `${TiktokComment.BASE_URL}/api`;

	private id = "";
	private browser: Browser | null = null;
	private context: BrowserContext | null = null;
	private page: Page | null = null;

	private parseComment(
		data: RawCommentData,
		replies: Comment[] = [],
		parentCommentId?: string,
	): Comment {
		const parsedData = {
			comment_id: data.cid,
			username: data.user.unique_id,
			nickname: data.user.nickname,
			comment: data.text,
			create_time: data.create_time,
			avatar: data.user.avatar_thumb?.url_list?.[0] ?? "",
			total_reply: data.reply_comment_total,
			parent_comment_id:
				parentCommentId ||
				(data.reply_id && data.reply_id !== "0" ? data.reply_id : undefined),
		};

		const comment = new Comment(
			parsedData.comment_id,
			parsedData.username,
			parsedData.nickname,
			parsedData.comment,
			parsedData.create_time,
			parsedData.avatar,
			parsedData.total_reply,
			replies,
			parsedData.parent_comment_id,
		);

		logger.info(
			`${comment.create_time} - ${comment.username} : ${comment.comment}`,
		);

		return comment;
	}

	private async initBrowser(): Promise<void> {
		if (this.browser) return;

		logger.info("Launching browser...");
		this.browser = await chromium.launch({
			executablePath: "/usr/bin/chromium",
			headless: true,
		});

		this.context = await this.browser.newContext({
			userAgent:
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			viewport: { width: 1920, height: 1080 },
			locale: "en-US",
		});

		this.page = await this.context.newPage();

		// Navigate to TikTok to get cookies and session
		logger.info("Initializing TikTok session...");
		await this.page.goto(TiktokComment.BASE_URL, {
			waitUntil: "domcontentloaded",
			timeout: 60000,
		});

		// Wait a bit for cookies to be set
		await this.page.waitForTimeout(2000);
		logger.info("Browser initialized successfully");
	}

	private async closeBrowser(): Promise<void> {
		if (this.browser) {
			await this.browser.close();
			this.browser = null;
			this.context = null;
			this.page = null;
		}
	}

	/**
	 * Fetch with exponential backoff retry logic
	 */
	private async fetchWithRetry<T>(
		url: string,
		retryCount = 0,
	): Promise<T | null> {
		if (!this.page) {
			throw new Error("Browser not initialized");
		}

		try {
			const response = await this.page.evaluate(async (fetchUrl: string) => {
				const res = await fetch(fetchUrl, {
					credentials: "include",
					headers: {
						Accept: "application/json",
						"Content-Type": "application/json",
					},
				});
				return res.json();
			}, url);

			return response as T;
		} catch (error) {
			if (retryCount < RETRY_CONFIG.maxRetries) {
				const delay = Math.min(
					RETRY_CONFIG.baseDelay * 2 ** retryCount,
					RETRY_CONFIG.maxDelay,
				);
				logger.warn(
					`Fetch failed, retrying in ${delay}ms (attempt ${retryCount + 1}/${RETRY_CONFIG.maxRetries
					})...`,
				);
				await new Promise((resolve) => setTimeout(resolve, delay));
				return this.fetchWithRetry<T>(url, retryCount + 1);
			}
			logger.error(
				`Fetch failed after ${RETRY_CONFIG.maxRetries} retries: ${error}`,
			);
			return null;
		}
	}

	/**
	 * Get all replies for a comment using cursor-based pagination
	 */
	private async getAllReplies(
		commentId: string,
		parentCommentId: string,
	): Promise<Comment[]> {
		const replies: Comment[] = [];
		let cursor = 0;
		let hasMore = true;
		const size = 50;

		while (hasMore) {
			const url = new URL(`${TiktokComment.API_URL}/comment/list/reply/`);
			url.searchParams.set("aid", "1988");
			url.searchParams.set("comment_id", commentId);
			url.searchParams.set("item_id", this.id);
			url.searchParams.set("count", size.toString());
			url.searchParams.set("cursor", cursor.toString());

			const json = await this.fetchWithRetry<ReplyListResponse>(url.toString());

			if (!json) {
				logger.warn(`Failed to fetch replies for comment ${commentId}`);
				break;
			}

			if (json.status_code && json.status_code !== 0) {
				logger.warn(`Reply API returned status_code: ${json.status_code}`);
				break;
			}

			if (!json.comments || json.comments.length === 0) {
				break;
			}

			for (const replyData of json.comments) {
				replies.push(this.parseComment(replyData, [], parentCommentId));
			}

			// Use the cursor returned by API for next page
			hasMore = json.has_more === 1;
			cursor = json.cursor;

			// Safety check: if cursor didn't advance, break to avoid infinite loop
			if (hasMore && json.cursor <= cursor - size) {
				logger.warn("Cursor did not advance for replies, breaking loop");
				break;
			}
		}

		return replies;
	}

	/**
	 * Get all comments using cursor-based pagination
	 */
	async getAllComments(id: string): Promise<Comments> {
		this.id = id;
		const allComments: Comment[] = [];
		let cursor = 0;
		let hasMore = true;
		const size = 50;
		let caption = "";
		let videoUrl = "";
		let pageCount = 0;

		// Track seen comment IDs to avoid duplicates
		const seenCommentIds = new Set<string>();

		while (hasMore) {
			pageCount++;
			logger.info(`Fetching page ${pageCount} (cursor: ${cursor})...`);

			const url = new URL(`${TiktokComment.API_URL}/comment/list/`);
			url.searchParams.set("aid", "1988");
			url.searchParams.set("aweme_id", id);
			url.searchParams.set("count", size.toString());
			url.searchParams.set("cursor", cursor.toString());

			const json = await this.fetchWithRetry<CommentListResponse>(
				url.toString(),
			);

			if (!json) {
				logger.warn(`Failed to fetch page ${pageCount}, stopping`);
				break;
			}

			if (json.status_code && json.status_code !== 0) {
				logger.warn(`API returned status_code: ${json.status_code}`);
				break;
			}

			if (!json.comments || json.comments.length === 0) {
				logger.info(`No more comments on page ${pageCount}`);
				break;
			}

			// Get caption and video URL from first response
			if (!caption && json.comments[0]?.share_info) {
				caption = json.comments[0].share_info.title ?? "";
				videoUrl = json.comments[0].share_info.url ?? "";
			}

			for (const commentData of json.comments) {
				// Skip if we've already seen this comment (duplicate)
				if (seenCommentIds.has(commentData.cid)) {
					logger.warn(`Skipping duplicate comment ${commentData.cid}`);
					continue;
				}
				seenCommentIds.add(commentData.cid);

				// Fetch replies if any
				let replies: Comment[] = [];
				if (commentData.reply_comment_total > 0) {
					logger.info(
						`Fetching ${commentData.reply_comment_total} replies for comment ${commentData.cid}...`,
					);
					replies = await this.getAllReplies(commentData.cid, commentData.cid);
				}

				allComments.push(this.parseComment(commentData, replies));
			}

			// Use the cursor returned by API for next page
			hasMore = json.has_more === 1;
			const newCursor = json.cursor;

			// Safety check: if cursor didn't advance, break to avoid infinite loop
			if (hasMore && newCursor <= cursor) {
				logger.warn(
					`Cursor did not advance (${cursor} -> ${newCursor}), breaking loop`,
				);
				break;
			}
			cursor = newCursor;

			// Small delay between requests to avoid rate limiting
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		logger.info(
			`Finished scraping: ${allComments.length} comments across ${pageCount} pages`,
		);

		return new Comments(caption, videoUrl, allComments, 0);
	}

	async scrape(id: string): Promise<Comments> {
		try {
			await this.initBrowser();
			const result = await this.getAllComments(id);
			return result;
		} finally {
			await this.closeBrowser();
		}
	}
}
