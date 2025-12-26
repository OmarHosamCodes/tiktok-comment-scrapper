import {
	integer,
	pgTable,
	real,
	text,
	timestamp,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";

// Boards table - stores the canvas/board metadata
export const boards = pgTable("boards", {
	id: uuid("id").primaryKey().defaultRandom(),
	publicSlug: varchar("public_slug", { length: 12 }).unique().notNull(),
	title: varchar("title", { length: 255 }),
	videoUrl: text("video_url"),
	videoCaption: text("video_caption"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Board comments table - stores comments with their canvas positions
export const boardComments = pgTable("board_comments", {
	id: uuid("id").primaryKey().defaultRandom(),
	boardId: uuid("board_id")
		.references(() => boards.id, { onDelete: "cascade" })
		.notNull(),
	// TikTok comment data
	commentId: varchar("comment_id", { length: 50 }).notNull(),
	parentCommentId: varchar("parent_comment_id", { length: 50 }), // For replies
	username: varchar("username", { length: 100 }),
	nickname: varchar("nickname", { length: 255 }),
	comment: text("comment"),
	createTime: timestamp("create_time"),
	avatar: text("avatar"),
	totalReply: integer("total_reply").default(0),
	isOrphanReply: integer("is_orphan_reply").default(0), // 1 if parent was missing
	// Canvas positioning
	positionX: real("position_x").default(0).notNull(),
	positionY: real("position_y").default(0).notNull(),
	width: real("width").default(300).notNull(),
	height: real("height").default(150).notNull(),
	color: varchar("color", { length: 7 }), // Hex color like #FF5733
	zIndex: integer("z_index").default(0).notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Board groups table - for grouping comments visually
export const boardGroups = pgTable("board_groups", {
	id: uuid("id").primaryKey().defaultRandom(),
	boardId: uuid("board_id")
		.references(() => boards.id, { onDelete: "cascade" })
		.notNull(),
	label: varchar("label", { length: 255 }),
	// Group bounds
	positionX: real("position_x").default(0).notNull(),
	positionY: real("position_y").default(0).notNull(),
	width: real("width").default(400).notNull(),
	height: real("height").default(300).notNull(),
	color: varchar("color", { length: 7 }).default("#374151"), // Default gray
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Board edges table - for reply threading visualization
export const boardEdges = pgTable("board_edges", {
	id: uuid("id").primaryKey().defaultRandom(),
	boardId: uuid("board_id")
		.references(() => boards.id, { onDelete: "cascade" })
		.notNull(),
	sourceCommentId: varchar("source_comment_id", { length: 50 }).notNull(),
	targetCommentId: varchar("target_comment_id", { length: 50 }).notNull(),
	edgeType: varchar("edge_type", { length: 20 }).default("reply"), // 'reply' | 'reference'
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Type exports for insert and select
export type Board = typeof boards.$inferSelect;
export type NewBoard = typeof boards.$inferInsert;

export type BoardComment = typeof boardComments.$inferSelect;
export type NewBoardComment = typeof boardComments.$inferInsert;

export type BoardGroup = typeof boardGroups.$inferSelect;
export type NewBoardGroup = typeof boardGroups.$inferInsert;

export type BoardEdge = typeof boardEdges.$inferSelect;
export type NewBoardEdge = typeof boardEdges.$inferInsert;
