import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	type Browser,
	type BrowserContext,
	chromium,
	type Page,
} from "playwright";
import { logger } from "../utils";

export type Platform = "instagram" | "facebook" | "youtube";

interface SessionData {
	cookies: Array<{
		name: string;
		value: string;
		domain: string;
		path: string;
		expires: number;
		httpOnly: boolean;
		secure: boolean;
		sameSite: "Strict" | "Lax" | "None";
	}>;
	localStorage?: Record<string, string>;
	timestamp: number;
}

interface PlatformConfig {
	name: Platform;
	loginUrl: string;
	checkSelector: string; // Selector to verify logged in state
	domain: string;
}

const PLATFORM_CONFIGS: Record<Platform, PlatformConfig> = {
	instagram: {
		name: "instagram",
		loginUrl: "https://www.instagram.com/accounts/login/",
		checkSelector: 'svg[aria-label="Home"], a[href="/"]',
		domain: ".instagram.com",
	},
	facebook: {
		name: "facebook",
		loginUrl: "https://www.facebook.com/login",
		checkSelector: '[aria-label="Facebook"], [data-pagelet="BlueBars"]',
		domain: ".facebook.com",
	},
	youtube: {
		name: "youtube",
		loginUrl: "https://accounts.google.com/ServiceLogin?service=youtube",
		checkSelector: 'button[aria-label*="Account"], #avatar-btn',
		domain: ".youtube.com",
	},
};

// Session expiry time (7 days)
const SESSION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export class SessionManager {
	private static readonly SESSIONS_DIR = join(process.cwd(), ".sessions");
	private activeBrowser: Browser | null = null;
	private activeContext: BrowserContext | null = null;
	private activePage: Page | null = null;

	constructor() {
		// Ensure sessions directory exists
		if (!existsSync(SessionManager.SESSIONS_DIR)) {
			mkdirSync(SessionManager.SESSIONS_DIR, { recursive: true });
		}
	}

	private getSessionPath(platform: Platform): string {
		return join(SessionManager.SESSIONS_DIR, `${platform}-session.json`);
	}

	/**
	 * Check if a valid session exists for a platform
	 */
	hasValidSession(platform: Platform): boolean {
		const sessionPath = this.getSessionPath(platform);

		if (!existsSync(sessionPath)) {
			return false;
		}

		try {
			const data = JSON.parse(
				readFileSync(sessionPath, "utf-8"),
			) as SessionData;
			const now = Date.now();

			// Check if session is expired
			if (now - data.timestamp > SESSION_EXPIRY_MS) {
				logger.info(`Session for ${platform} has expired`);
				return false;
			}

			// Check if cookies exist
			if (!data.cookies || data.cookies.length === 0) {
				return false;
			}

			return true;
		} catch (error) {
			logger.error(`Failed to read session for ${platform}: ${error}`);
			return false;
		}
	}

	/**
	 * Get session status for all platforms
	 */
	getSessionStatus(): Record<Platform, { valid: boolean; expiresAt?: number }> {
		const platforms: Platform[] = ["instagram", "facebook", "youtube"];
		const status: Record<Platform, { valid: boolean; expiresAt?: number }> =
			{} as Record<Platform, { valid: boolean; expiresAt?: number }>;

		for (const platform of platforms) {
			const sessionPath = this.getSessionPath(platform);

			if (!existsSync(sessionPath)) {
				status[platform] = { valid: false };
				continue;
			}

			try {
				const data = JSON.parse(
					readFileSync(sessionPath, "utf-8"),
				) as SessionData;
				const expiresAt = data.timestamp + SESSION_EXPIRY_MS;
				const isValid = Date.now() < expiresAt && data.cookies?.length > 0;

				status[platform] = {
					valid: isValid,
					expiresAt: isValid ? expiresAt : undefined,
				};
			} catch {
				status[platform] = { valid: false };
			}
		}

		return status;
	}

	/**
	 * Load saved session cookies into a browser context
	 */
	async loadSession(
		platform: Platform,
		context: BrowserContext,
	): Promise<boolean> {
		const sessionPath = this.getSessionPath(platform);

		if (!existsSync(sessionPath)) {
			logger.info(`No session found for ${platform}`);
			return false;
		}

		try {
			const data = JSON.parse(
				readFileSync(sessionPath, "utf-8"),
			) as SessionData;

			// Check expiry
			if (Date.now() - data.timestamp > SESSION_EXPIRY_MS) {
				logger.info(`Session for ${platform} has expired`);
				return false;
			}

			// Load cookies
			await context.addCookies(data.cookies);
			logger.info(`Loaded ${data.cookies.length} cookies for ${platform}`);

			return true;
		} catch (error) {
			logger.error(`Failed to load session for ${platform}: ${error}`);
			return false;
		}
	}

	/**
	 * Save current browser context session
	 */
	private async saveSession(
		platform: Platform,
		context: BrowserContext,
	): Promise<void> {
		try {
			const cookies = await context.cookies();

			const sessionData: SessionData = {
				cookies: cookies.map((c) => ({
					name: c.name,
					value: c.value,
					domain: c.domain,
					path: c.path,
					expires: c.expires,
					httpOnly: c.httpOnly,
					secure: c.secure,
					sameSite: c.sameSite,
				})),
				timestamp: Date.now(),
			};

			writeFileSync(
				this.getSessionPath(platform),
				JSON.stringify(sessionData, null, 2),
			);

			logger.info(
				`Saved session for ${platform} with ${cookies.length} cookies`,
			);
		} catch (error) {
			logger.error(`Failed to save session for ${platform}: ${error}`);
			throw error;
		}
	}

	/**
	 * Clear session for a platform
	 */
	clearSession(platform: Platform): boolean {
		const sessionPath = this.getSessionPath(platform);

		if (existsSync(sessionPath)) {
			try {
				const { unlinkSync } = require("node:fs");
				unlinkSync(sessionPath);
				logger.info(`Cleared session for ${platform}`);
				return true;
			} catch (error) {
				logger.error(`Failed to clear session for ${platform}: ${error}`);
				return false;
			}
		}

		return true;
	}

	/**
	 * Clear all sessions
	 */
	clearAllSessions(): void {
		const platforms: Platform[] = ["instagram", "facebook", "youtube"];
		for (const platform of platforms) {
			this.clearSession(platform);
		}
	}

	/**
	 * Check if login browser is currently active
	 */
	isLoginActive(): boolean {
		return this.activeBrowser !== null;
	}

	/**
	 * Start interactive login session
	 * Opens a visible browser for the user to log in manually
	 */
	async startLoginSession(
		platform: Platform,
	): Promise<{ success: boolean; message: string }> {
		if (this.activeBrowser) {
			return {
				success: false,
				message:
					"A login session is already active. Please complete or cancel it first.",
			};
		}

		const config = PLATFORM_CONFIGS[platform];

		if (!config) {
			return {
				success: false,
				message: `Unknown platform: ${platform}`,
			};
		}

		logger.info(`Starting login session for ${platform}...`);

		try {
			// Launch visible browser
			this.activeBrowser = await chromium.launch({
				executablePath: "/usr/bin/chromium",
				headless: false, // Visible for user to interact
				args: [
					"--start-maximized",
					"--disable-blink-features=AutomationControlled",
				],
			});

			this.activeContext = await this.activeBrowser.newContext({
				userAgent:
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
				viewport: null, // Use full window
				locale: "en-US",
			});

			this.activePage = await this.activeContext.newPage();

			// Navigate to login page
			await this.activePage.goto(config.loginUrl, {
				waitUntil: "domcontentloaded",
				timeout: 60000,
			});

			// Return immediately - the browser is now open for user interaction
			// The user will call /api/session/complete when done
			return {
				success: true,
				message: `Browser opened for ${platform} login. Please log in and then call /api/session/complete?platform=${platform} when done, or /api/session/cancel to cancel.`,
			};
		} catch (error) {
			await this.cleanup();
			logger.error(`Failed to start login session: ${error}`);
			return {
				success: false,
				message: `Failed to start login session: ${error}`,
			};
		}
	}

	/**
	 * Complete the login session and save cookies
	 */
	async completeLoginSession(
		platform: Platform,
	): Promise<{ success: boolean; message: string }> {
		if (!this.activeBrowser || !this.activeContext || !this.activePage) {
			return {
				success: false,
				message: "No active login session",
			};
		}

		const config = PLATFORM_CONFIGS[platform];

		try {
			// Check if user appears to be logged in
			let isLoggedIn = false;

			try {
				await this.activePage.waitForSelector(config.checkSelector, {
					timeout: 5000,
				});
				isLoggedIn = true;
			} catch {
				// Selector not found, might not be logged in
				logger.warn(`Login check selector not found for ${platform}`);
			}

			// Save session regardless (user might have logged in differently)
			await this.saveSession(platform, this.activeContext);

			await this.cleanup();

			if (isLoggedIn) {
				return {
					success: true,
					message: `Successfully saved ${platform} session. You can now scrape ${platform} content.`,
				};
			}

			return {
				success: true,
				message: `Session saved for ${platform}. Login status could not be verified, but cookies were saved. Try scraping to test.`,
			};
		} catch (error) {
			await this.cleanup();
			logger.error(`Failed to complete login session: ${error}`);
			return {
				success: false,
				message: `Failed to save session: ${error}`,
			};
		}
	}

	/**
	 * Cancel active login session
	 */
	async cancelLoginSession(): Promise<{ success: boolean; message: string }> {
		if (!this.activeBrowser) {
			return {
				success: false,
				message: "No active login session to cancel",
			};
		}

		await this.cleanup();

		return {
			success: true,
			message: "Login session cancelled",
		};
	}

	private async cleanup(): Promise<void> {
		if (this.activeBrowser) {
			try {
				await this.activeBrowser.close();
			} catch {
				// Ignore close errors
			}
		}

		this.activeBrowser = null;
		this.activeContext = null;
		this.activePage = null;
	}

	/**
	 * Create a browser context with session loaded
	 */
	async createAuthenticatedContext(platform: Platform): Promise<{
		browser: Browser;
		context: BrowserContext;
		hasSession: boolean;
	}> {
		const browser = await chromium.launch({
			executablePath: "/usr/bin/chromium",
			headless: true,
		});

		const context = await browser.newContext({
			userAgent:
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			viewport: { width: 1920, height: 1080 },
			locale: "en-US",
		});

		const hasSession = await this.loadSession(platform, context);

		return { browser, context, hasSession };
	}
}

// Singleton instance
export const sessionManager = new SessionManager();
