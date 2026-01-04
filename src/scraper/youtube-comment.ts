import type { Browser, BrowserContext, Page } from "playwright";
import { Comment, Comments } from "../types";
import { logger } from "../utils";
import { sessionManager } from "./session-manager";

export class YoutubeComment {
	private browser: Browser | null = null;
	private context: BrowserContext | null = null;
	private page: Page | null = null;
	private hasSession = false;

	private async initBrowser(): Promise<void> {
		if (this.browser) return;

		logger.info("Launching browser for YouTube...");

		// Try to use authenticated session
		const result = await sessionManager.createAuthenticatedContext("youtube");
		this.browser = result.browser;
		this.context = result.context;
		this.hasSession = result.hasSession;

		if (this.hasSession) {
			logger.info("Using saved YouTube session");
		} else {
			logger.info("No YouTube session found, scraping as guest");
		}

		this.page = await this.context.newPage();
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
	 * Improved scrolling that ensures all comments are loaded
	 */
	private async scrollToLoadAllComments(): Promise<void> {
		if (!this.page) return;

		logger.info("Scrolling to load all comments...");

		// First, scroll down to trigger comment section loading
		await this.page.evaluate(() => {
			window.scrollTo(0, 600);
		});
		await this.page.waitForTimeout(2000);

		// Wait for comments section to appear
		try {
			await this.page.waitForSelector("ytd-comments, #comments", {
				timeout: 15000,
			});
		} catch {
			logger.warn("Comments section not found initially");
		}

		// Get the expected comment count if available
		let expectedCount = 0;
		try {
			const countText = await this.page.$eval(
				"#count yt-formatted-string, ytd-comments-header-renderer #count",
				(el) => el.textContent || "",
			);
			const match = countText.match(/([\d,]+)/);
			if (match?.[1]) {
				expectedCount = parseInt(match[1].replace(/,/g, ""), 10);
				logger.info(`Expected comment count: ${expectedCount}`);
			}
		} catch {
			logger.info("Could not determine expected comment count");
		}

		// Track loaded comments to detect when we've reached the end
		let lastCommentCount = 0;
		let noNewCommentsCount = 0;
		const maxNoNewAttempts = 5; // Stop after 5 scrolls with no new comments
		let scrollCount = 0;
		const maxScrolls = 100; // Safety limit

		while (scrollCount < maxScrolls) {
			scrollCount++;

			// Count current comments
			const currentCount = await this.page.evaluate(() => {
				return document.querySelectorAll("ytd-comment-thread-renderer").length;
			});

			logger.info(`Scroll ${scrollCount}: ${currentCount} comments loaded`);

			// Check if we've loaded enough
			if (expectedCount > 0 && currentCount >= expectedCount) {
				logger.info("Loaded all expected comments");
				break;
			}

			// Check if we're making progress
			if (currentCount === lastCommentCount) {
				noNewCommentsCount++;
				if (noNewCommentsCount >= maxNoNewAttempts) {
					logger.info(
						"No new comments loaded after multiple scrolls, stopping",
					);
					break;
				}
			} else {
				noNewCommentsCount = 0;
				lastCommentCount = currentCount;
			}

			// Scroll to load more
			await this.page.evaluate(() => {
				// Find the comments container
				const commentsSection = document.querySelector(
					"ytd-comments, #comments",
				);
				if (commentsSection) {
					// Scroll to the bottom of the current content
					const lastComment = document.querySelector(
						"ytd-comment-thread-renderer:last-child",
					);
					if (lastComment) {
						lastComment.scrollIntoView({
							behavior: "instant",
							block: "center",
						});
					}
				}

				// Also scroll the page
				window.scrollBy(0, window.innerHeight);
			});

			// Wait for new content to load
			await this.page.waitForTimeout(1500);

			// Try clicking "Show more replies" buttons occasionally
			if (scrollCount % 5 === 0) {
				try {
					const showMoreButtons = await this.page.$$(
						"#more-replies button, ytd-button-renderer#more-replies button, " +
							"ytd-continuation-item-renderer button",
					);
					for (const button of showMoreButtons.slice(0, 3)) {
						try {
							await button.click();
							await this.page.waitForTimeout(500);
						} catch {
							// Button might not be clickable
						}
					}
				} catch {
					// No show more buttons
				}
			}
		}

		// Final scroll to make sure everything is rendered
		await this.page.evaluate(() => window.scrollTo(0, 0));
		await this.page.waitForTimeout(500);
		await this.page.evaluate(() =>
			window.scrollTo(0, document.body.scrollHeight),
		);
		await this.page.waitForTimeout(1000);
	}

	private async parseComments(): Promise<Comment[]> {
		if (!this.page) return [];

		const comments: Comment[] = [];

		try {
			// Wait for comments section to appear
			await this.page.waitForSelector("ytd-comment-thread-renderer", {
				timeout: 15000,
			});

			const commentData = await this.page.evaluate(() => {
				const results: Array<{
					id: string;
					username: string;
					nickname: string;
					text: string;
					avatar: string;
					replyCount: number;
					timestamp: string;
				}> = [];

				const commentElements = document.querySelectorAll(
					"ytd-comment-thread-renderer",
				);

				commentElements.forEach((thread, index) => {
					const mainComment = thread.querySelector(
						"#comment, ytd-comment-view-model",
					);
					if (!mainComment) return;

					// Author info
					const authorEl = mainComment.querySelector(
						'#author-text, #author-text-content, a[href*="/@"], a[href*="/channel/"]',
					);
					const textEl = mainComment.querySelector(
						"#content-text, yt-attributed-string#content-text, #content",
					);
					const avatarEl = mainComment.querySelector(
						"#author-thumbnail img, #author-thumbnail yt-img-shadow img",
					);
					const replyCountEl = thread.querySelector(
						"#more-replies button, #replies #count, ytd-comment-replies-renderer #more-replies",
					);
					const timestampEl = mainComment.querySelector(
						"#published-time-text a, yt-formatted-string.published-time-text",
					);

					const username = authorEl?.textContent?.trim() || "";
					const text = textEl?.textContent?.trim() || "";
					const avatar = avatarEl?.getAttribute("src") || "";
					const timestamp = timestampEl?.textContent?.trim() || "";

					// Parse reply count
					let replyCount = 0;
					const replyText = replyCountEl?.textContent || "";
					const replyMatch = replyText.match(/(\d+)/);
					if (replyMatch?.[1]) {
						replyCount = parseInt(replyMatch[1], 10);
					}

					if (username && text) {
						results.push({
							id: `yt_${Date.now()}_${index}`,
							username: username.replace(/[@\s]/g, "").toLowerCase(),
							nickname: username.replace("@", "").trim(),
							text,
							avatar,
							replyCount,
							timestamp,
						});
					}
				});

				return results;
			});

			for (const data of commentData) {
				comments.push(
					new Comment(
						data.id,
						data.username,
						data.nickname,
						data.text,
						Math.floor(Date.now() / 1000),
						data.avatar,
						data.replyCount,
						[], // Could expand to fetch replies
						undefined,
						false,
					),
				);
			}
		} catch (err) {
			logger.error(`Failed to parse YouTube comments: ${err}`);
		}

		return comments;
	}

	async scrape(url: string): Promise<Comments> {
		try {
			await this.initBrowser();

			if (!this.page) {
				throw new Error("Browser not initialized");
			}

			logger.info(`Navigating to YouTube: ${url}`);
			await this.page.goto(url, {
				waitUntil: "domcontentloaded",
				timeout: 60000,
			});

			// Wait for video page to load
			await this.page.waitForTimeout(3000);

			// Accept cookies if prompted
			try {
				const acceptButton = await this.page.$(
					'button[aria-label*="Accept"], button:has-text("Accept all"), ' +
						'tp-yt-paper-button:has-text("Accept all"), ytd-button-renderer:has-text("Accept")',
				);
				if (acceptButton) {
					await acceptButton.click();
					await this.page.waitForTimeout(1000);
				}
			} catch {
				// No cookie prompt
			}

			// Scroll to load all comments
			await this.scrollToLoadAllComments();

			// Parse comments
			const comments = await this.parseComments();

			// Get video title
			let title = "";
			try {
				title = await this.page.$eval(
					"h1.ytd-video-primary-info-renderer, h1 yt-formatted-string, " +
						"ytd-watch-metadata h1 yt-formatted-string",
					(el) => el.textContent || "",
				);
			} catch {
				// Title extraction failed
			}

			logger.info(`Scraped ${comments.length} comments from YouTube`);

			return new Comments(title || "YouTube Video", url, comments, 0);
		} finally {
			await this.closeBrowser();
		}
	}
}
