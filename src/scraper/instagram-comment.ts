import type { Browser, BrowserContext, Page } from "playwright";
import { Comment, Comments } from "../types";
import { logger } from "../utils";
import { sessionManager } from "./session-manager";

export class InstagramComment {
	private browser: Browser | null = null;
	private context: BrowserContext | null = null;
	private page: Page | null = null;
	private hasSession = false;

	private async initBrowser(): Promise<void> {
		if (this.browser) return;

		logger.info("Launching browser for Instagram...");

		// Try to use authenticated session
		const result = await sessionManager.createAuthenticatedContext("instagram");
		this.browser = result.browser;
		this.context = result.context;
		this.hasSession = result.hasSession;

		if (this.hasSession) {
			logger.info("Using saved Instagram session");
		} else {
			logger.info(
				"No Instagram session found, scraping as guest (may have limited access)",
			);
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

	private async scrollToLoadComments(maxScrolls: number = 15): Promise<void> {
		if (!this.page) return;

		logger.info("Scrolling to load comments...");

		// Try to click "View all comments" button if present
		try {
			const viewAllButton = await this.page.$(
				'button:has-text("View all"), span:has-text("View all")',
			);
			if (viewAllButton) {
				await viewAllButton.click();
				await this.page.waitForTimeout(2000);
			}
		} catch {
			// No view all button
		}

		// Find and scroll within comment section
		for (let i = 0; i < maxScrolls; i++) {
			const previousHeight = await this.page.evaluate(() => {
				const commentSection =
					document.querySelector("ul._a9ym") ||
					document.querySelector('div[class*="Comments"]') ||
					document.querySelector("article");

				if (commentSection) {
					const prevHeight = commentSection.scrollHeight;
					commentSection.scrollTop = commentSection.scrollHeight;
					return prevHeight;
				}

				// Fallback: scroll the page
				const prevHeight = document.body.scrollHeight;
				window.scrollBy(0, 800);
				return prevHeight;
			});

			await this.page.waitForTimeout(1500);

			// Check if we loaded more content
			const newHeight = await this.page.evaluate(() => {
				const commentSection =
					document.querySelector("ul._a9ym") ||
					document.querySelector('div[class*="Comments"]') ||
					document.querySelector("article");
				return commentSection?.scrollHeight || document.body.scrollHeight;
			});

			if (newHeight === previousHeight) {
				logger.info(`No new content loaded after scroll ${i + 1}, stopping`);
				break;
			}

			// Try to click "Load more comments" if present
			try {
				const loadMoreButton = await this.page.$(
					'button:has-text("Load more"), button:has-text("View more")',
				);
				if (loadMoreButton) {
					await loadMoreButton.click();
					await this.page.waitForTimeout(1500);
				}
			} catch {
				// No load more button
			}
		}
	}

	private async parseComments(): Promise<Comment[]> {
		if (!this.page) return [];

		const comments: Comment[] = [];

		try {
			// Wait for comments to appear
			await this.page
				.waitForSelector('ul._a9ym li, div[class*="Comment"]', {
					timeout: 10000,
				})
				.catch(() => {
					logger.warn(
						"Comment selector not found, trying alternative approach",
					);
				});

			const commentData = await this.page.evaluate(() => {
				const results: Array<{
					username: string;
					text: string;
					avatar: string;
					timestamp: string;
				}> = [];

				// Try multiple selector strategies
				const selectors = [
					// Modern Instagram selectors
					'ul._a9ym > div[role="button"]',
					"ul._a9ym li",
					// Alternative selectors
					'div[class*="C4VMK"] > span',
					"article div ul li",
					// Generic comment patterns
					'[data-testid="post-comment"]',
				];

				for (const selector of selectors) {
					const elements = document.querySelectorAll(selector);
					if (elements.length === 0) continue;

					elements.forEach((el) => {
						// Find username - usually a link to profile
						const usernameEl =
							el.querySelector('a[href^="/"][role="link"]') ||
							el.querySelector('a[href^="/"]') ||
							el.querySelector("h3 a, h2 a, span a");

						// Find comment text
						const textEl =
							el.querySelector('span[class*="_a9zs"], span[dir="auto"]') ||
							el.querySelector("span:not(:empty)");

						// Find avatar
						const avatarEl =
							el.querySelector('img[alt*="profile picture"]') ||
							el.querySelector('img[crossorigin="anonymous"]');

						// Find timestamp
						const timeEl = el.querySelector("time");

						if (usernameEl && textEl) {
							const username = usernameEl.textContent?.trim() || "";
							const text = textEl.textContent?.trim() || "";
							const avatar = avatarEl?.getAttribute("src") || "";
							const timestamp = timeEl?.getAttribute("datetime") || "";

							// Filter out non-comments
							if (
								username &&
								text &&
								text.length > 0 &&
								!text.includes("Log in") &&
								!text.includes("Sign up") &&
								!text.includes("liked by") &&
								username !== text // Avoid caption duplicates
							) {
								// Avoid duplicates
								const exists = results.some(
									(r) => r.username === username && r.text === text,
								);
								if (!exists) {
									results.push({ username, text, avatar, timestamp });
								}
							}
						}
					});

					if (results.length > 0) break; // Found comments with this selector
				}

				return results;
			});

			let index = 0;
			for (const data of commentData) {
				const createTime = data.timestamp
					? Math.floor(new Date(data.timestamp).getTime() / 1000)
					: Math.floor(Date.now() / 1000);

				comments.push(
					new Comment(
						`ig_${Date.now()}_${index}`,
						data.username.replace(/\s+/g, "_").toLowerCase(),
						data.username,
						data.text,
						createTime,
						data.avatar,
						0,
						[],
						undefined,
						false,
					),
				);
				index++;
			}
		} catch (err) {
			logger.error(`Failed to parse Instagram comments: ${err}`);
		}

		return comments;
	}

	async scrape(url: string): Promise<Comments> {
		try {
			await this.initBrowser();

			if (!this.page) {
				throw new Error("Browser not initialized");
			}

			logger.info(`Navigating to Instagram: ${url}`);
			await this.page.goto(url, {
				waitUntil: "domcontentloaded",
				timeout: 60000,
			});

			// Wait for content to load
			await this.page.waitForTimeout(3000);

			// Check if we hit a login wall
			const loginWall = await this.page.$(
				'input[name="username"], form[id="loginForm"]',
			);
			if (loginWall && !this.hasSession) {
				logger.warn(
					"Instagram login wall detected. Session required for full access.",
				);
				await this.closeBrowser();
				return new Comments(
					"Instagram Post",
					url,
					[],
					0,
					true, // needsAuth flag
					"Instagram requires authentication to view comments. Please log in using /api/session/login?platform=instagram",
				);
			}

			// Try to close login modal if it appears
			try {
				const closeButton = await this.page.$(
					'[aria-label="Close"], button:has-text("Not Now")',
				);
				if (closeButton) {
					await closeButton.click();
					await this.page.waitForTimeout(1000);
				}
			} catch {
				// No modal to close
			}

			// Scroll to load more comments
			await this.scrollToLoadComments();

			// Parse comments
			const comments = await this.parseComments();

			// Try to get post caption
			let caption = "";
			try {
				caption = await this.page.$eval(
					'h1, span[class*="_a9zs"]:first-of-type, article header + div span',
					(el) => el.textContent || "",
				);
			} catch {
				// Caption extraction failed
			}

			logger.info(`Scraped ${comments.length} comments from Instagram`);

			// If we got 0 comments without a session, suggest authentication
			if (comments.length === 0 && !this.hasSession) {
				return new Comments(
					caption || "Instagram Post",
					url,
					[],
					0,
					true,
					"No comments found. Instagram may require authentication. Try logging in via /api/session/login?platform=instagram",
				);
			}

			return new Comments(caption || "Instagram Post", url, comments, 0);
		} finally {
			await this.closeBrowser();
		}
	}
}
