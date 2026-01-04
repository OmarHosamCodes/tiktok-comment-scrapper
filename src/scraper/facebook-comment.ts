import type { Browser, BrowserContext, Page } from "playwright";
import { Comment, Comments } from "../types";
import { logger } from "../utils";
import { sessionManager } from "./session-manager";

export class FacebookComment {
	private browser: Browser | null = null;
	private context: BrowserContext | null = null;
	private page: Page | null = null;
	private hasSession = false;

	private async initBrowser(): Promise<void> {
		if (this.browser) return;

		logger.info("Launching browser for Facebook...");

		// Try to use authenticated session
		const result = await sessionManager.createAuthenticatedContext("facebook");
		this.browser = result.browser;
		this.context = result.context;
		this.hasSession = result.hasSession;

		if (this.hasSession) {
			logger.info("Using saved Facebook session");
		} else {
			logger.info(
				"No Facebook session found, scraping as guest (may have limited access)",
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

	private async scrollToLoadComments(maxScrolls: number = 20): Promise<void> {
		if (!this.page) return;

		logger.info("Scrolling to load comments...");

		// Try to click "View more comments" buttons
		for (let i = 0; i < maxScrolls; i++) {
			// Click on "View more comments" or similar buttons
			try {
				const moreCommentsButtons = await this.page.$$(
					'div[role="button"]:has-text("View more comments"), ' +
						'div[role="button"]:has-text("View all"), ' +
						'span:has-text("View more comments"), ' +
						'[data-testid="UFI2ViewMoreCommentsLink"]',
				);

				for (const button of moreCommentsButtons) {
					try {
						await button.click();
						await this.page.waitForTimeout(1500);
					} catch {
						// Button might have been removed
					}
				}
			} catch {
				// No more comments button
			}

			// Also scroll the page
			const previousHeight = await this.page.evaluate(() => {
				const prevHeight = document.body.scrollHeight;
				window.scrollBy(0, window.innerHeight);
				return prevHeight;
			});

			await this.page.waitForTimeout(1500);

			const newHeight = await this.page.evaluate(
				() => document.body.scrollHeight,
			);

			if (newHeight === previousHeight) {
				// Try one more time with "See more" clicks for replies
				try {
					const seeMoreReplies = await this.page.$$(
						'div[role="button"]:has-text("replies")',
					);
					for (const button of seeMoreReplies.slice(0, 5)) {
						try {
							await button.click();
							await this.page.waitForTimeout(500);
						} catch {
							// Ignore
						}
					}
				} catch {
					// Ignore
				}

				if (i > 5) {
					logger.info(`No new content after scroll ${i + 1}, stopping`);
					break;
				}
			}
		}
	}

	private async parseComments(): Promise<Comment[]> {
		if (!this.page) return [];

		const comments: Comment[] = [];

		try {
			// Wait for comments to appear
			await this.page
				.waitForSelector(
					'[aria-label*="Comment"], [data-testid*="UFI"], div[role="article"]',
					{
						timeout: 10000,
					},
				)
				.catch(() => {
					logger.warn(
						"Comment selector not found, trying alternative approach",
					);
				});

			const commentData = await this.page.evaluate(() => {
				const results: Array<{
					username: string;
					nickname: string;
					text: string;
					avatar: string;
				}> = [];

				// Try to find comment elements using various strategies
				const commentContainers = document.querySelectorAll(
					'[role="article"], ' +
						'div[data-testid="UFI2Comment/root_depth_0"], ' +
						'div[class*="UFIComment"]',
				);

				commentContainers.forEach((container) => {
					// Find the comment body - usually the text content
					const textEl =
						container.querySelector(
							'[data-ad-preview="message"], [data-ad-comet-preview="message"]',
						) ||
						container.querySelector('div[dir="auto"]:not([role])') ||
						container.querySelector('span[dir="auto"]');

					// Find username/author
					const authorLink =
						container.querySelector('a[role="link"][tabindex="0"]') ||
						container.querySelector(
							'a[href*="/user/"], a[href*="/profile.php"]',
						) ||
						container.querySelector('span[dir="auto"] > a');

					// Find avatar
					const avatarEl =
						container.querySelector("image, svg image") ||
						container.querySelector(
							'img[referrerpolicy="origin-when-cross-origin"]',
						);

					if (textEl && authorLink) {
						const text = textEl.textContent?.trim() || "";
						const nickname = authorLink.textContent?.trim() || "";

						// Skip if it looks like a page/post content rather than comment
						if (
							text &&
							nickname &&
							text.length < 5000 && // Likely not a post
							!text.includes("Suggested for you") &&
							!text.includes("People also liked")
						) {
							const username = nickname.replace(/\s+/g, "_").toLowerCase();
							const avatar =
								avatarEl?.getAttribute("xlink:href") ||
								avatarEl?.getAttribute("src") ||
								"";

							// Avoid duplicates
							const exists = results.some(
								(r) => r.username === username && r.text === text,
							);

							if (!exists) {
								results.push({ username, nickname, text, avatar });
							}
						}
					}
				});

				// Also try the newer Facebook comment structure
				if (results.length === 0) {
					const newStyleComments = document.querySelectorAll(
						'ul[class*="CommentList"] > li, div[class*="UFICommentContentBlock"]',
					);

					newStyleComments.forEach((el) => {
						const textEl = el.querySelector(
							'span[dir="auto"], div[dir="auto"]',
						);
						const authorEl = el.querySelector('a[role="link"], a[href*="/"]');
						const avatarEl = el.querySelector("img");

						if (textEl && authorEl) {
							const text = textEl.textContent?.trim() || "";
							const nickname = authorEl.textContent?.trim() || "";

							if (text && nickname) {
								const username = nickname.replace(/\s+/g, "_").toLowerCase();
								const avatar = avatarEl?.getAttribute("src") || "";

								const exists = results.some(
									(r) => r.username === username && r.text === text,
								);

								if (!exists) {
									results.push({ username, nickname, text, avatar });
								}
							}
						}
					});
				}

				return results;
			});

			let index = 0;
			for (const data of commentData) {
				comments.push(
					new Comment(
						`fb_${Date.now()}_${index}`,
						data.username,
						data.nickname,
						data.text,
						Math.floor(Date.now() / 1000),
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
			logger.error(`Failed to parse Facebook comments: ${err}`);
		}

		return comments;
	}

	async scrape(url: string): Promise<Comments> {
		try {
			await this.initBrowser();

			if (!this.page) {
				throw new Error("Browser not initialized");
			}

			logger.info(`Navigating to Facebook: ${url}`);
			await this.page.goto(url, {
				waitUntil: "domcontentloaded",
				timeout: 60000,
			});

			// Wait for content to load
			await this.page.waitForTimeout(3000);

			// Check if we hit a login wall
			const loginWall = await this.page.$(
				'input[name="email"], form[data-testid="royal_login_form"]',
			);
			if (loginWall && !this.hasSession) {
				logger.warn(
					"Facebook login wall detected. Session required for full access.",
				);
				await this.closeBrowser();
				return new Comments(
					"Facebook Video",
					url,
					[],
					0,
					true,
					"Facebook requires authentication to view comments. Please log in using /api/session/login?platform=facebook",
				);
			}

			// Try to close any popups/modals
			try {
				const closeButtons = await this.page.$$(
					'[aria-label="Close"], [data-testid="cookie-policy-manage-dialog-accept-button"]',
				);
				for (const button of closeButtons) {
					try {
						await button.click();
						await this.page.waitForTimeout(500);
					} catch {
						// Ignore
					}
				}
			} catch {
				// No popup to close
			}

			// Accept cookies if prompted
			try {
				const acceptCookies = await this.page.$(
					'button[data-testid="cookie-policy-manage-dialog-accept-button"], button:has-text("Allow")',
				);
				if (acceptCookies) {
					await acceptCookies.click();
					await this.page.waitForTimeout(1000);
				}
			} catch {
				// No cookie prompt
			}

			// Scroll to load more comments
			await this.scrollToLoadComments();

			// Parse comments
			const comments = await this.parseComments();

			// Try to get post/video title
			let title = "";
			try {
				title = await this.page.$eval(
					'h1, h2[dir="auto"], span[data-ad-preview="headline"]',
					(el) => el.textContent || "",
				);
			} catch {
				// Title extraction failed
			}

			logger.info(`Scraped ${comments.length} comments from Facebook`);

			// If we got 0 comments without a session, suggest authentication
			if (comments.length === 0 && !this.hasSession) {
				return new Comments(
					title || "Facebook Video",
					url,
					[],
					0,
					true,
					"No comments found. Facebook may require authentication. Try logging in via /api/session/login?platform=facebook",
				);
			}

			return new Comments(title || "Facebook Video", url, comments, 0);
		} finally {
			await this.closeBrowser();
		}
	}
}
