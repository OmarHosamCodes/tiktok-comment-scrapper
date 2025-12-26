import Archiver from "archiver";
import { serve } from "bun";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "./db/client";
import {
	type NewBoardComment,
	type NewBoardEdge,
	boardComments,
	boardEdges,
	boardGroups,
	boards,
} from "./db/schema";
import homepage from "./index.html";
import { TiktokComment } from "./scraper";
import type { CommentData, CommentsData } from "./types";

const PORT = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 3000;

// Helper to resolve short URLs
async function resolveShortUrl(shortUrl: string): Promise<string | undefined> {
	try {
		const response = await fetch(shortUrl, {
			method: "HEAD",
			redirect: "follow",
		});
		const finalUrl = response.url;
		const videoIdMatch = finalUrl.match(/\/video\/(\d+)/);
		return videoIdMatch?.[1];
	} catch {
		return undefined;
	}
}

// Helper to check if URL is a short URL
function isShortUrl(input: string): boolean {
	return (
		/(?:vm|vt)\.tiktok\.com\/\w+/.test(input) ||
		/tiktok\.com\/t\/\w+/.test(input)
	);
}

// Helper to extract video ID from URL
function extractVideoId(input: string): string | undefined {
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
		if (match?.[1]) {
			return match[1];
		}
	}

	return undefined;
}

const server = serve({
	port: PORT,
	idleTimeout: -1,
	routes: {
		"/": homepage,

		// JSON API endpoint for scraping (replaces SSE)
		"/api/scrape": {
			async POST(req) {
				try {
					const body = (await req.json()) as { url?: string; id?: string };
					let id = body.id;

					// Handle URL input
					if (body.url && !id) {
						if (isShortUrl(body.url)) {
							id = await resolveShortUrl(body.url);
							if (!id) {
								return Response.json(
									{ error: "Failed to resolve short URL" },
									{ status: 400 },
								);
							}
						} else {
							id = extractVideoId(body.url);
						}
					}

					if (!id || !/^\d+$/.test(id)) {
						return Response.json(
							{ error: "Invalid video ID" },
							{ status: 400 },
						);
					}

					const scraper = new TiktokComment();
					const result = await scraper.scrape(id);

					return Response.json(result.dict);
				} catch (error) {
					console.error("Scrape error:", error);
					return Response.json(
						{
							error: error instanceof Error ? error.message : "Scraping failed",
						},
						{ status: 500 },
					);
				}
			},
		},

		// Create a new board from scraped comments
		"/api/boards": {
			async POST(req) {
				try {
					// Frontend sends camelCase properties
					interface IncomingComment {
						commentId: string;
						username: string;
						nickname: string;
						comment: string;
						createTime: string;
						avatar: string;
						totalReply?: number;
						parentCommentId?: string;
						isOrphanReply?: boolean;
					}

					const body = (await req.json()) as {
						title?: string;
						videoUrl?: string;
						videoCaption?: string;
						comments: IncomingComment[];
					};

					if (!body.comments || !Array.isArray(body.comments)) {
						return Response.json(
							{ error: "Comments array required" },
							{ status: 400 },
						);
					}

					// Generate unique public slug
					const publicSlug = nanoid(12);

					// Create board
					const [board] = await db
						.insert(boards)
						.values({
							publicSlug,
							title: body.title || "Untitled Board",
							videoUrl: body.videoUrl,
							videoCaption: body.videoCaption,
						})
						.returning();

					// Process flat comments with auto-layout positioning
					// Comments come in flat format with parentCommentId for replies
					const commentsToInsert: NewBoardComment[] = [];
					const edgesToInsert: NewBoardEdge[] = [];

					// Separate parent comments from replies
					const parentComments = body.comments.filter(
						(c) => !c.parentCommentId,
					);
					const replies = body.comments.filter((c) => c.parentCommentId);

					// Group replies by parent
					const repliesByParent = new Map<string, typeof body.comments>();
					for (const reply of replies) {
						const parentId = reply.parentCommentId;
						if (parentId) {
							if (!repliesByParent.has(parentId)) {
								repliesByParent.set(parentId, []);
							}
							const parentReplies = repliesByParent.get(parentId);
							if (parentReplies) {
								parentReplies.push(reply);
							}
						}
					}

					// Layout configuration
					const columnWidth = 350;
					const rowHeight = 200;
					const maxColumns = 5;
					let xOffset = 0;
					let yOffset = 0;
					let currentColumn = 0;

					if (!board) {
						return Response.json(
							{ error: "Failed to create board" },
							{ status: 500 },
						);
					}

					for (const comment of parentComments) {
						// Add main comment
						commentsToInsert.push({
							boardId: board.id,
							commentId: comment.commentId,
							parentCommentId: null,
							username: comment.username,
							nickname: comment.nickname,
							comment: comment.comment,
							createTime: new Date(comment.createTime),
							avatar: comment.avatar,
							totalReply: comment.totalReply || 0,
							isOrphanReply: 0,
							positionX: xOffset,
							positionY: yOffset,
							width: 300,
							height: 150,
							zIndex: 0,
						});

						// Add replies below parent with edges
						const commentReplies = repliesByParent.get(comment.commentId) || [];
						let replyYOffset = yOffset + rowHeight;

						for (const reply of commentReplies) {
							commentsToInsert.push({
								boardId: board.id,
								commentId: reply.commentId,
								parentCommentId: comment.commentId,
								username: reply.username,
								nickname: reply.nickname,
								comment: reply.comment,
								createTime: new Date(reply.createTime),
								avatar: reply.avatar,
								totalReply: reply.totalReply || 0,
								isOrphanReply: 0,
								positionX: xOffset + 50, // Indent replies
								positionY: replyYOffset,
								width: 280,
								height: 130,
								zIndex: 1,
							});

							// Create edge from parent to reply
							edgesToInsert.push({
								boardId: board.id,
								sourceCommentId: comment.commentId,
								targetCommentId: reply.commentId,
								edgeType: "reply",
							});

							replyYOffset += rowHeight - 50;
						}

						// Move to next column/row
						currentColumn++;
						if (currentColumn >= maxColumns) {
							currentColumn = 0;
							xOffset = 0;
							yOffset =
								replyYOffset > yOffset + rowHeight
									? replyYOffset + 100
									: yOffset + rowHeight + 100;
						} else {
							xOffset += columnWidth;
						}
					}

					// Add orphan replies (replies whose parent wasn't scraped)
					const orphanReplies = replies.filter(
						(r) =>
							!parentComments.some((p) => p.commentId === r.parentCommentId),
					);

					for (const orphan of orphanReplies) {
						// Check if already added (might be in repliesByParent for valid parents)
						if (
							commentsToInsert.some((c) => c.commentId === orphan.commentId)
						) {
							continue;
						}

						commentsToInsert.push({
							boardId: board.id,
							commentId: orphan.commentId,
							parentCommentId: orphan.parentCommentId ?? null,
							username: orphan.username,
							nickname: orphan.nickname,
							comment: orphan.comment,
							createTime: new Date(orphan.createTime),
							avatar: orphan.avatar,
							totalReply: orphan.totalReply || 0,
							isOrphanReply: 1,
							positionX: xOffset,
							positionY: yOffset,
							width: 280,
							height: 130,
							zIndex: 0,
						});

						currentColumn++;
						if (currentColumn >= maxColumns) {
							currentColumn = 0;
							xOffset = 0;
							yOffset += rowHeight + 100;
						} else {
							xOffset += columnWidth;
						}
					}

					// Batch insert comments
					if (commentsToInsert.length > 0) {
						await db.insert(boardComments).values(commentsToInsert);
					}

					// Batch insert edges
					if (edgesToInsert.length > 0) {
						await db.insert(boardEdges).values(edgesToInsert);
					}

					return Response.json({
						board: {
							id: board.id,
							publicSlug: board.publicSlug,
							url: `/board/${board.publicSlug}`,
						},
						commentsCount: commentsToInsert.length,
						edgesCount: edgesToInsert.length,
					});
				} catch (error) {
					console.error("Create board error:", error);
					return Response.json(
						{ error: "Failed to create board" },
						{ status: 500 },
					);
				}
			},

			// List all boards
			async GET() {
				try {
					const allBoards = await db
						.select({
							id: boards.id,
							publicSlug: boards.publicSlug,
							title: boards.title,
							videoUrl: boards.videoUrl,
							createdAt: boards.createdAt,
						})
						.from(boards)
						.orderBy(boards.createdAt);

					return Response.json(allBoards);
				} catch (error) {
					console.error("List boards error:", error);
					return Response.json(
						{ error: "Failed to list boards" },
						{ status: 500 },
					);
				}
			},
		},

		// Get board by slug with all data
		"/api/boards/:slug": {
			async GET(req) {
				try {
					const slug = req.params.slug;

					const [board] = await db
						.select()
						.from(boards)
						.where(eq(boards.publicSlug, slug))
						.limit(1);

					if (!board) {
						return Response.json({ error: "Board not found" }, { status: 404 });
					}

					const comments = await db
						.select()
						.from(boardComments)
						.where(eq(boardComments.boardId, board.id));

					const edges = await db
						.select()
						.from(boardEdges)
						.where(eq(boardEdges.boardId, board.id));

					const groups = await db
						.select()
						.from(boardGroups)
						.where(eq(boardGroups.boardId, board.id));

					return Response.json({
						...board,
						comments,
						edges,
						groups,
					});
				} catch (error) {
					console.error("Get board error:", error);
					return Response.json(
						{ error: "Failed to get board" },
						{ status: 500 },
					);
				}
			},

			// Delete board
			async DELETE(req) {
				try {
					const slug = req.params.slug;

					await db.delete(boards).where(eq(boards.publicSlug, slug));

					return Response.json({ success: true });
				} catch (error) {
					console.error("Delete board error:", error);
					return Response.json(
						{ error: "Failed to delete board" },
						{ status: 500 },
					);
				}
			},
		},

		// Add comments to existing board
		"/api/boards/:slug/comments": {
			async POST(req) {
				try {
					const slug = req.params.slug;
					const body = (await req.json()) as { comments: CommentData[] };

					const [board] = await db
						.select()
						.from(boards)
						.where(eq(boards.publicSlug, slug))
						.limit(1);

					if (!board) {
						return Response.json({ error: "Board not found" }, { status: 404 });
					}

					// Get current max position to add new comments after existing ones
					const existingComments = await db
						.select({
							positionX: boardComments.positionX,
							positionY: boardComments.positionY,
						})
						.from(boardComments)
						.where(eq(boardComments.boardId, board.id));

					let maxY = 0;
					for (const c of existingComments) {
						if (c.positionY > maxY) maxY = c.positionY;
					}

					const commentsToInsert: NewBoardComment[] = [];
					const edgesToInsert: NewBoardEdge[] = [];
					let xOffset = 0;
					let yOffset = maxY + 250; // Start below existing comments
					const columnWidth = 350;
					const rowHeight = 200;
					const maxColumns = 5;
					let currentColumn = 0;

					for (const comment of body.comments) {
						commentsToInsert.push({
							boardId: board.id,
							commentId: comment.comment_id,
							parentCommentId: comment.parent_comment_id,
							username: comment.username,
							nickname: comment.nickname,
							comment: comment.comment,
							createTime: new Date(comment.create_time),
							avatar: comment.avatar,
							totalReply: comment.total_reply,
							isOrphanReply: comment.is_orphan_reply ? 1 : 0,
							positionX: xOffset,
							positionY: yOffset,
							width: 300,
							height: 150,
							zIndex: 0,
						});

						let replyYOffset = yOffset + rowHeight;
						for (const reply of comment.replies) {
							commentsToInsert.push({
								boardId: board.id,
								commentId: reply.comment_id,
								parentCommentId: comment.comment_id,
								username: reply.username,
								nickname: reply.nickname,
								comment: reply.comment,
								createTime: new Date(reply.create_time),
								avatar: reply.avatar,
								totalReply: reply.total_reply,
								isOrphanReply: 0,
								positionX: xOffset + 50,
								positionY: replyYOffset,
								width: 280,
								height: 130,
								zIndex: 1,
							});

							edgesToInsert.push({
								boardId: board.id,
								sourceCommentId: comment.comment_id,
								targetCommentId: reply.comment_id,
								edgeType: "reply",
							});

							replyYOffset += rowHeight - 50;
						}

						currentColumn++;
						if (currentColumn >= maxColumns) {
							currentColumn = 0;
							xOffset = 0;
							yOffset =
								replyYOffset > yOffset + rowHeight
									? replyYOffset + 100
									: yOffset + rowHeight + 100;
						} else {
							xOffset += columnWidth;
						}
					}

					if (commentsToInsert.length > 0) {
						await db.insert(boardComments).values(commentsToInsert);
					}
					if (edgesToInsert.length > 0) {
						await db.insert(boardEdges).values(edgesToInsert);
					}

					return Response.json({
						success: true,
						addedComments: commentsToInsert.length,
						addedEdges: edgesToInsert.length,
					});
				} catch (error) {
					console.error("Add comments error:", error);
					return Response.json(
						{ error: "Failed to add comments" },
						{ status: 500 },
					);
				}
			},
		},

		// Update comment position/style
		"/api/boards/:slug/comments/:commentId": {
			async PATCH(req) {
				try {
					const { slug, commentId } = req.params;
					const body = (await req.json()) as {
						positionX?: number;
						positionY?: number;
						width?: number;
						height?: number;
						color?: string;
						zIndex?: number;
					};

					const [board] = await db
						.select()
						.from(boards)
						.where(eq(boards.publicSlug, slug))
						.limit(1);

					if (!board) {
						return Response.json({ error: "Board not found" }, { status: 404 });
					}

					await db
						.update(boardComments)
						.set({
							...(body.positionX !== undefined && {
								positionX: body.positionX,
							}),
							...(body.positionY !== undefined && {
								positionY: body.positionY,
							}),
							...(body.width !== undefined && { width: body.width }),
							...(body.height !== undefined && { height: body.height }),
							...(body.color !== undefined && { color: body.color }),
							...(body.zIndex !== undefined && { zIndex: body.zIndex }),
						})
						.where(eq(boardComments.id, commentId));

					return Response.json({ success: true });
				} catch (error) {
					console.error("Update comment error:", error);
					return Response.json(
						{ error: "Failed to update comment" },
						{ status: 500 },
					);
				}
			},

			async DELETE(req) {
				try {
					const { commentId } = req.params;

					await db.delete(boardComments).where(eq(boardComments.id, commentId));

					return Response.json({ success: true });
				} catch (error) {
					console.error("Delete comment error:", error);
					return Response.json(
						{ error: "Failed to delete comment" },
						{ status: 500 },
					);
				}
			},
		},

		// Batch update comments (for undo/redo and multi-select moves)
		"/api/boards/:slug/comments/batch": {
			async PATCH(req) {
				try {
					const slug = req.params.slug;
					const body = (await req.json()) as {
						updates: Array<{
							id: string;
							positionX?: number;
							positionY?: number;
							width?: number;
							height?: number;
							color?: string;
							zIndex?: number;
						}>;
					};

					const [board] = await db
						.select()
						.from(boards)
						.where(eq(boards.publicSlug, slug))
						.limit(1);

					if (!board) {
						return Response.json({ error: "Board not found" }, { status: 404 });
					}

					// Update each comment
					for (const update of body.updates) {
						await db
							.update(boardComments)
							.set({
								...(update.positionX !== undefined && {
									positionX: update.positionX,
								}),
								...(update.positionY !== undefined && {
									positionY: update.positionY,
								}),
								...(update.width !== undefined && { width: update.width }),
								...(update.height !== undefined && { height: update.height }),
								...(update.color !== undefined && { color: update.color }),
								...(update.zIndex !== undefined && { zIndex: update.zIndex }),
							})
							.where(eq(boardComments.id, update.id));
					}

					return Response.json({ success: true, updated: body.updates.length });
				} catch (error) {
					console.error("Batch update error:", error);
					return Response.json(
						{ error: "Failed to batch update" },
						{ status: 500 },
					);
				}
			},
		},

		// Groups management
		"/api/boards/:slug/groups": {
			async POST(req) {
				try {
					const slug = req.params.slug;
					const body = (await req.json()) as {
						label?: string;
						positionX: number;
						positionY: number;
						width: number;
						height: number;
						color?: string;
					};

					const [board] = await db
						.select()
						.from(boards)
						.where(eq(boards.publicSlug, slug))
						.limit(1);

					if (!board) {
						return Response.json({ error: "Board not found" }, { status: 404 });
					}

					const [group] = await db
						.insert(boardGroups)
						.values({
							boardId: board.id,
							label: body.label,
							positionX: body.positionX,
							positionY: body.positionY,
							width: body.width,
							height: body.height,
							color: body.color || "#374151",
						})
						.returning();

					return Response.json(group);
				} catch (error) {
					console.error("Create group error:", error);
					return Response.json(
						{ error: "Failed to create group" },
						{ status: 500 },
					);
				}
			},
		},

		"/api/boards/:slug/groups/:groupId": {
			async PATCH(req) {
				try {
					const { groupId } = req.params;
					const body = (await req.json()) as {
						label?: string;
						positionX?: number;
						positionY?: number;
						width?: number;
						height?: number;
						color?: string;
					};

					await db
						.update(boardGroups)
						.set({
							...(body.label !== undefined && { label: body.label }),
							...(body.positionX !== undefined && {
								positionX: body.positionX,
							}),
							...(body.positionY !== undefined && {
								positionY: body.positionY,
							}),
							...(body.width !== undefined && { width: body.width }),
							...(body.height !== undefined && { height: body.height }),
							...(body.color !== undefined && { color: body.color }),
						})
						.where(eq(boardGroups.id, groupId));

					return Response.json({ success: true });
				} catch (error) {
					console.error("Update group error:", error);
					return Response.json(
						{ error: "Failed to update group" },
						{ status: 500 },
					);
				}
			},

			async DELETE(req) {
				try {
					const { groupId } = req.params;

					await db.delete(boardGroups).where(eq(boardGroups.id, groupId));

					return Response.json({ success: true });
				} catch (error) {
					console.error("Delete group error:", error);
					return Response.json(
						{ error: "Failed to delete group" },
						{ status: 500 },
					);
				}
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
							"Content-Disposition":
								'attachment; filename="tiktok-comments.zip"',
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

	development: process.env.NODE_ENV !== "production" && {
		// Enable browser hot reloading in development
		hmr: true,

		// Echo console logs from the browser to the server
		console: true,
	},
	fetch(_req) {
		return new Response("Not Found", { status: 404 });
	},
});

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
  <rect x="2" y="2" width="${width - 4}" height="${
		height - 4
	}" fill="none" stroke="url(#${gradientId})" stroke-width="2" rx="14"/>
  
  <!-- Avatar placeholder circle -->
  <circle cx="${padding + avatarSize / 2}" cy="${
		padding + avatarSize / 2
	}" r="${avatarSize / 2}" fill="#374151"/>
  <text x="${padding + avatarSize / 2}" y="${
		padding + avatarSize / 2 + 6
	}" text-anchor="middle" fill="#9ca3af" font-size="20" font-family="Inter, sans-serif">${escapeXml(
		comment.nickname.charAt(0).toUpperCase(),
	)}</text>
  
  <!-- Username -->
  <text x="${padding + avatarSize + 16}" y="${
		padding + 20
	}" fill="#ffffff" font-size="16" font-weight="600" font-family="Inter, sans-serif">${escapeXml(
		comment.nickname,
	)}</text>
  <text x="${padding + avatarSize + 16}" y="${
		padding + 40
	}" fill="#64748b" font-size="12" font-family="Inter, sans-serif">@${escapeXml(
		comment.username,
	)}</text>
  
  <!-- Comment text -->
  ${lines
		.map(
			(line, i) =>
				`<text x="${padding + avatarSize + 16}" y="${
					padding + 70 + i * lineHeight
				}" fill="#e2e8f0" font-size="14" font-family="Inter, sans-serif">${escapeXml(
					line,
				)}</text>`,
		)
		.join("\n  ")}
  
  <!-- Timestamp -->
  <text x="${padding + avatarSize + 16}" y="${
		height - padding
	}" fill="#64748b" font-size="11" font-family="Inter, sans-serif">${escapeXml(
		comment.create_time,
	)}</text>
  
  <!-- Reply count badge -->
  ${
		comment.total_reply > 0
			? `<rect x="${width - 100}" y="${
					height - 36
			  }" width="80" height="24" fill="${borderColor}" rx="12" opacity="0.2"/>
  <text x="${width - 60}" y="${
					height - 20
			  }" text-anchor="middle" fill="${borderColor}" font-size="11" font-weight="500" font-family="Inter, sans-serif">${
					comment.total_reply
			  } replies</text>`
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
