import Archiver from "archiver";
import { serve } from "bun";
import homepage from "./public/index.html";
import { TiktokComment } from "./src/scraper";
import type { CommentsData } from "./src/types";

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
// NOTE: development must be true for Bun's HTML bundler to process Tailwind CSS
// This is required for bun-plugin-tailwind to work correctly
const isDevelopment = true;

const server = serve({
	port: PORT,
	idleTimeout: -1,
	routes: {
		"/": homepage,

		// Server-Sent Events endpoint for real-time scraping progress
		"/api/scrape": {
			async GET(req) {
				const urlParams = new URL(req.url);
				let id = urlParams.searchParams.get("id");
				const shortUrl = urlParams.searchParams.get("url");

				// Create a readable stream for SSE
				const stream = new ReadableStream({
					async start(controller) {
						const encoder = new TextEncoder();

						const sendEvent = (type: string, data: Record<string, unknown>) => {
							const message = `data: ${JSON.stringify({ type, ...data })}\n\n`;
							controller.enqueue(encoder.encode(message));
						};

						try {
							// If we have a short URL, resolve it first
							if (shortUrl && !id) {
								sendEvent("progress", { message: "Resolving short URL..." });

								try {
									// Follow redirects to get the actual URL
									const response = await fetch(shortUrl, {
										method: "HEAD",
										redirect: "follow",
									});

									const finalUrl = response.url;

									// Extract video ID from the resolved URL
									const videoIdMatch = finalUrl.match(/\/video\/(\d+)/);
									if (videoIdMatch) {
										id = videoIdMatch[1];
										sendEvent("progress", {
											message: `Resolved to video ID: ${id}`,
										});
									} else {
										throw new Error(
											"Could not extract video ID from resolved URL",
										);
									}
								} catch (resolveError) {
									sendEvent("error", {
										message: `Failed to resolve short URL: ${resolveError instanceof Error ? resolveError.message : "Unknown error"}`,
									});
									controller.close();
									return;
								}
							}

							if (!id || !/^\d+$/.test(id)) {
								sendEvent("error", { message: "Invalid video ID" });
								controller.close();
								return;
							}

							sendEvent("progress", { message: "Starting scraper..." });

							const scraper = new TiktokComment();

							// Override the logger to send progress updates
							const originalInfo = console.info;
							console.info = (...args: unknown[]) => {
								const message = args.join(" ");
								if (message.includes("Launching browser")) {
									sendEvent("progress", { message: "Launching browser..." });
								} else if (message.includes("Initializing TikTok")) {
									sendEvent("progress", {
										message: "Initializing TikTok session...",
									});
								} else if (message.includes("Browser initialized")) {
									sendEvent("progress", {
										message: "Browser ready, fetching comments...",
									});
								} else if (message.includes("Fetching page")) {
									const match = message.match(/page (\d+)/);
									if (match) {
										sendEvent("progress", {
											message: `Fetching page ${match[1]}...`,
										});
									}
								} else if (
									message.includes("Fetching") &&
									message.includes("replies")
								) {
									sendEvent("progress", { message: "Fetching replies..." });
								}
								originalInfo.apply(console, args);
							};

							const result = await scraper.scrape(id);
							console.info = originalInfo;

							sendEvent("complete", { result: result.dict });
							controller.close();
						} catch (error) {
							sendEvent("error", {
								message:
									error instanceof Error ? error.message : "Scraping failed",
							});
							controller.close();
						}
					},
				});

				return new Response(stream, {
					headers: {
						"Content-Type": "text/event-stream",
						"Cache-Control": "no-cache",
						Connection: "keep-alive",
					},
				});
			},
		},

		// Generate ZIP with comment images
		"/api/generate-zip": {
			async POST(req) {
				try {
					const data = (await req.json()) as CommentsData;

					if (!data.comments || !Array.isArray(data.comments)) {
						return Response.json({ error: "Invalid data" }, { status: 400 });
					}

					// Create archive in memory
					const archive = Archiver("zip", { zlib: { level: 9 } });
					const chunks: Buffer[] = [];

					// Collect chunks from archive
					archive.on("data", (chunk: Buffer) => chunks.push(chunk));

					// Add JSON data
					archive.append(JSON.stringify(data, null, 2), {
						name: "comments.json",
					});

					// Generate SVG images for each comment
					for (const comment of data.comments) {
						const svg = generateCommentSvg(comment);
						archive.append(svg, {
							name: `comments/${comment.comment_id}.svg`,
						});

						// Generate images for replies too
						for (const reply of comment.replies) {
							const replySvg = generateCommentSvg(reply, true);
							archive.append(replySvg, {
								name: `replies/${reply.comment_id}.svg`,
							});
						}
					}

					await archive.finalize();

					// Wait for all chunks
					await new Promise((resolve) => archive.on("end", resolve));

					const buffer = Buffer.concat(chunks);

					return new Response(buffer, {
						headers: {
							"Content-Type": "application/zip",
							"Content-Disposition": `attachment; filename="tiktok-comments.zip"`,
						},
					});
				} catch (error) {
					console.error("ZIP generation error:", error);
					return Response.json(
						{ error: "Failed to generate ZIP" },
						{ status: 500 },
					);
				}
			},
		},
	},

	development: isDevelopment,

	fetch(_req) {
		return new Response("Not Found", { status: 404 });
	},
});

interface CommentData {
	comment_id: string;
	username: string;
	nickname: string;
	comment: string;
	create_time: string;
	avatar: string;
	total_reply: number;
	replies: CommentData[];
}

function generateCommentSvg(comment: CommentData, isReply = false): string {
	const width = 800;
	const padding = 24;
	const avatarSize = 48;

	// Calculate text wrapping
	const maxCharsPerLine = 70;
	const lines = wrapText(comment.comment, maxCharsPerLine);
	const lineHeight = 24;
	const textHeight = lines.length * lineHeight;
	const height = Math.max(140, 80 + textHeight + padding);

	// Escape special characters for SVG
	const escapeXml = (str: string) => {
		return str
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&apos;");
	};

	const gradientId = `grad-${comment.comment_id}`;
	// Using theme-compatible colors (dark mode friendly)
	const bgColor = isReply ? "#1a1a2e" : "#0f0f1a";
	// Using secondary and primary theme color approximations
	const borderColor = isReply ? "#6366f1" : "#e05d50"; // primary-ish vs secondary-ish

	return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#e05d50;stop-opacity:1" />
      <stop offset="50%" style="stop-color:#6366f1;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#5d9de0;stop-opacity:1" />
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="rgba(0,0,0,0.3)"/>
    </filter>
  </defs>
  
  <!-- Background -->
  <rect width="${width}" height="${height}" fill="${bgColor}" rx="16"/>
  
  <!-- Gradient Border -->
  <rect x="2" y="2" width="${width - 4}" height="${height - 4}" fill="none" stroke="url(#${gradientId})" stroke-width="2" rx="14"/>
  
  <!-- Avatar placeholder circle -->
  <circle cx="${padding + avatarSize / 2}" cy="${padding + avatarSize / 2}" r="${avatarSize / 2}" fill="#374151"/>
  <text x="${padding + avatarSize / 2}" y="${padding + avatarSize / 2 + 6}" text-anchor="middle" fill="#9ca3af" font-size="20" font-family="Inter, sans-serif">${escapeXml(comment.nickname.charAt(0).toUpperCase())}</text>
  
  <!-- Username -->
  <text x="${padding + avatarSize + 16}" y="${padding + 20}" fill="#ffffff" font-size="16" font-weight="600" font-family="Inter, sans-serif">${escapeXml(comment.nickname)}</text>
  <text x="${padding + avatarSize + 16}" y="${padding + 40}" fill="#64748b" font-size="12" font-family="Inter, sans-serif">@${escapeXml(comment.username)}</text>
  
  <!-- Comment text -->
  ${lines
			.map(
				(line, i) =>
					`<text x="${padding + avatarSize + 16}" y="${padding + 70 + i * lineHeight}" fill="#e2e8f0" font-size="14" font-family="Inter, sans-serif">${escapeXml(line)}</text>`,
			)
			.join("\n  ")}
  
  <!-- Timestamp -->
  <text x="${padding + avatarSize + 16}" y="${height - padding}" fill="#64748b" font-size="11" font-family="Inter, sans-serif">${escapeXml(comment.create_time)}</text>
  
  <!-- Reply count badge -->
  ${comment.total_reply > 0
			? `<rect x="${width - 100}" y="${height - 36}" width="80" height="24" fill="${borderColor}" rx="12" opacity="0.2"/>
  <text x="${width - 60}" y="${height - 20}" text-anchor="middle" fill="${borderColor}" font-size="11" font-weight="500" font-family="Inter, sans-serif">${comment.total_reply} replies</text>`
			: ""
		}
</svg>`;
}

function wrapText(text: string, maxChars: number): string[] {
	const words = text.split(" ");
	const lines: string[] = [];
	let currentLine = "";

	for (const word of words) {
		if (currentLine.length + word.length + 1 <= maxChars) {
			currentLine += (currentLine ? " " : "") + word;
		} else {
			if (currentLine) lines.push(currentLine);
			currentLine = word;
		}
	}
	if (currentLine) lines.push(currentLine);

	return lines;
}

console.log(`🚀 TikTok Comment Scraper running at ${server.url}`);
