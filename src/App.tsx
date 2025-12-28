import * as htmlToImage from "html-to-image";
import {
	AlertCircle,
	ArrowDownAZ,
	ArrowUpAZ,
	Check,
	ChevronDown,
	ExternalLink,
	FileJson,
	Filter,
	Image,
	LayoutDashboard,
	Loader2,
	MessageCircle,
	MessageSquare,
	Reply,
	Search,
	Sparkles,
	Users,
	X,
	Zap,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { TikTokComment } from "./components/tiktok-comment";
import { Alert, AlertDescription } from "./components/ui/alert";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "./components/ui/card";
import { Input } from "./components/ui/input";
import { ScrollArea } from "./components/ui/scroll-area";
import { Separator } from "./components/ui/separator";
import { PngExportOptions } from "./constants/png-options";
import { useScraper, type Comment } from "./hooks/use-scraper";

type FilterType = "all" | "comments" | "replies";
type SortType = "newest" | "oldest" | "most_replies";

interface AppProps {
	navigateToBoard: (slug: string) => void;
}

export function App({ navigateToBoard }: AppProps) {
	const [url, setUrl] = useState("");
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [exporting, setExporting] = useState(false);
	const [filterType, setFilterType] = useState<FilterType>("all");
	const [sortType, setSortType] = useState<SortType>("newest");
	const [showFilters, setShowFilters] = useState(false);
	const [sendingToBoard, setSendingToBoard] = useState(false);
	const commentRefs = useRef<Map<string, HTMLDivElement>>(new Map());

	const { status, result, error, scrape } = useScraper();

	// Get all comments including replies flattened
	const allComments = useMemo(() => {
		if (!result) return [];
		const flat: Comment[] = [];
		for (const comment of result.comments) {
			flat.push(comment);
			for (const reply of comment.replies) {
				// Set parent_comment_id on reply since it's determined by nesting
				flat.push({
					...reply,
					parent_comment_id: comment.comment_id,
				});
			}
		}
		return flat;
	}, [result]);

	// Flatten all comments and replies for filtering
	const flattenedComments = useMemo(() => {
		if (!result) return [];

		const items: { comment: Comment; isReply: boolean; parentId?: string }[] =
			[];

		for (const comment of result.comments) {
			items.push({ comment, isReply: false });
			for (const reply of comment.replies) {
				items.push({
					comment: reply,
					isReply: true,
					parentId: comment.comment_id,
				});
			}
		}

		return items;
	}, [result]);

	// Filter and sort comments
	const filteredAndSortedComments = useMemo(() => {
		if (!result) return [];

		let items = [...flattenedComments];

		// Apply filter
		if (filterType === "comments") {
			items = items.filter((item) => !item.isReply);
		} else if (filterType === "replies") {
			items = items.filter((item) => item.isReply);
		}

		// Apply search
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			items = items.filter(
				(item) =>
					item.comment.comment.toLowerCase().includes(query) ||
					item.comment.username.toLowerCase().includes(query) ||
					item.comment.nickname.toLowerCase().includes(query),
			);
		}

		// Apply sort
		items.sort((a, b) => {
			if (sortType === "newest") {
				return (
					new Date(b.comment.create_time).getTime() -
					new Date(a.comment.create_time).getTime()
				);
			} else if (sortType === "oldest") {
				return (
					new Date(a.comment.create_time).getTime() -
					new Date(b.comment.create_time).getTime()
				);
			} else if (sortType === "most_replies") {
				return b.comment.total_reply - a.comment.total_reply;
			}
			return 0;
		});

		return items;
	}, [flattenedComments, filterType, searchQuery, sortType, result]);

	// Toggle comment selection
	const toggleSelection = useCallback((id: string) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	}, []);

	// Select all visible comments
	const selectAll = useCallback(() => {
		const ids = new Set<string>();
		for (const item of filteredAndSortedComments) {
			ids.add(item.comment.comment_id);
		}
		setSelectedIds(ids);
	}, [filteredAndSortedComments]);

	// Deselect all
	const deselectAll = useCallback(() => {
		setSelectedIds(new Set());
	}, []);

	// Get selected comments
	const selectedComments = useMemo(() => {
		return allComments.filter((c) => selectedIds.has(c.comment_id));
	}, [allComments, selectedIds]);

	// Export selected as JSON
	const handleExportJson = useCallback(() => {
		if (selectedComments.length === 0) return;

		const blob = new Blob([JSON.stringify(selectedComments, null, 2)], {
			type: "application/json",
		});
		const blobUrl = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = blobUrl;
		a.download = `tiktok-comments-${Date.now()}.json`;
		a.click();
		URL.revokeObjectURL(blobUrl);
	}, [selectedComments]);

	// Export selected as PNG ZIP - Optimized with parallel processing
	const handleExportPng = useCallback(async () => {
		if (selectedComments.length === 0) return;

		setExporting(true);
		try {
			const JSZip = (await import("jszip")).default;
			const zip = new JSZip();
			const folder = zip.folder("comments");

			// Capture images in parallel batches for speed
			const BATCH_SIZE = 10;
			const batches: Comment[][] = [];

			for (let i = 0; i < selectedComments.length; i += BATCH_SIZE) {
				batches.push(selectedComments.slice(i, i + BATCH_SIZE));
			}

			for (const batch of batches) {
				const capturePromises = batch.map(async (comment) => {
					const commentEl = commentRefs.current.get(comment.comment_id);
					if (!commentEl) return null;

					try {
						const dataUrl = await htmlToImage.toPng(
							commentEl,
							PngExportOptions,
						);
						return { id: comment.comment_id, data: dataUrl.split(",")[1] };
					} catch (err) {
						console.error(
							`Failed to capture comment ${comment.comment_id}:`,
							err,
						);
						return null;
					}
				});

				const results = await Promise.all(capturePromises);

				for (const result of results) {
					if (result) {
						folder?.file(`${result.id}.png`, result.data, { base64: true });
					}
				}
			}

			const blob = await zip.generateAsync({ type: "blob" });
			const blobUrl = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = blobUrl;
			a.download = `tiktok-comments-${Date.now()}.zip`;
			a.click();
			URL.revokeObjectURL(blobUrl);
		} catch (err) {
			console.error("Export failed:", err);
		} finally {
			setExporting(false);
		}
	}, [selectedComments]);

	// Download all as JSON
	const handleDownloadJson = () => {
		if (!result) return;

		const blob = new Blob([JSON.stringify(result, null, 2)], {
			type: "application/json",
		});
		const blobUrl = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = blobUrl;
		a.download = `tiktok-comments-${Date.now()}.json`;
		a.click();
		URL.revokeObjectURL(blobUrl);
	};

	// Send comments to a new board
	const handleSendToBoard = async () => {
		if (!result) return;

		setSendingToBoard(true);
		try {
			const response = await fetch("/api/boards", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					title: result.caption
						? result.caption.slice(0, 100)
						: `TikTok Comments - ${new Date().toLocaleDateString()}`,
					videoUrl: result.video_url,
					videoCaption: result.caption,
					comments: allComments.map((c) => ({
						commentId: c.comment_id,
						username: c.username,
						nickname: c.nickname,
						comment: c.comment,
						createTime: c.create_time,
						avatar: c.avatar,
						totalReply: c.total_reply,
						parentCommentId: c.parent_comment_id,
						isOrphanReply: c.is_orphan_reply,
					})),
				}),
			});

			if (!response.ok) {
				throw new Error("Failed to create board");
			}

			const { board } = await response.json();
			navigateToBoard(board.publicSlug);
		} catch (err) {
			console.error("Failed to send to board:", err);
			alert("Failed to create board. Please try again.");
		} finally {
			setSendingToBoard(false);
		}
	};

	const handleScrape = () => {
		if (url.trim()) {
			scrape(url);
		}
	};

	const totalReplies =
		result?.comments.reduce((acc, c) => acc + c.replies.length, 0) ?? 0;
	const uniqueUsers = result
		? new Set(result.comments.map((c) => c.username)).size
		: 0;

	return (
		<div className="min-h-screen flex flex-col bg-background">
			{/* Animated background */}
			<div className="fixed inset-0 overflow-hidden pointer-events-none">
				<div className="absolute top-0 left-1/4 w-96 h-96 bg-secondary/10 rounded-full blur-3xl" />
				<div className="absolute bottom-0 right-1/4 w-80 h-80 bg-chart-3/10 rounded-full blur-3xl" />
				<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl" />
			</div>

			{/* Header */}
			<header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
				<div className="container mx-auto px-4 md:px-6 h-16 flex items-center">
					<div className="flex items-center gap-3">
						<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-secondary via-primary to-chart-3">
							<MessageCircle className="h-5 w-5 text-primary-foreground" />
						</div>
						<div>
							<h1 className="text-lg font-semibold gradient-text">
								TikTok Comment Scraper
							</h1>
							<p className="text-xs text-muted-foreground">
								Extract and download video comments
							</p>
						</div>
					</div>
				</div>
			</header>

			{/* Main Content */}
			<main className="flex-1 container mx-auto px-4 md:px-6 py-8 md:py-12 relative z-10">
				<div className="max-w-4xl mx-auto space-y-8">
					{/* Hero Section */}
					<div className="text-center space-y-4">
						<Badge variant="gradient" className="mb-2">
							<Sparkles className="h-3 w-3 mr-1" />
							Powered by Playwright
						</Badge>
						<h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight">
							Scrape TikTok Comments{" "}
							<span className="gradient-text">in Seconds</span>
						</h2>
						<p className="text-muted-foreground text-base md:text-lg max-w-2xl mx-auto">
							Enter any TikTok video URL and extract all comments with their
							replies. Search, filter, select, and export as JSON or PNG images.
						</p>
					</div>

					{/* Input Card */}
					<Card className="relative overflow-hidden gradient-border">
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-lg">
								<ExternalLink className="h-5 w-5 text-secondary" />
								Enter TikTok Video
							</CardTitle>
							<CardDescription>
								Paste a TikTok video URL (including short links like
								vt.tiktok.com) or video ID
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="flex flex-col sm:flex-row gap-3">
								<Input
									type="text"
									value={url}
									onChange={(e) => setUrl(e.target.value)}
									placeholder="https://www.tiktok.com/@user/video/... or https://vt.tiktok.com/..."
									disabled={status === "loading"}
									className="flex-1 h-11"
									onKeyDown={(e) => e.key === "Enter" && handleScrape()}
								/>
								<Button
									onClick={handleScrape}
									disabled={status === "loading" || !url.trim()}
									variant="gradient"
									size="xl"
									className="w-full sm:w-auto"
								>
									{status === "loading" ? (
										<>
											<Loader2 className="h-4 w-4 animate-spin" />
											Scraping...
										</>
									) : (
										<>
											<Zap className="h-4 w-4" />
											Scrape
										</>
									)}
								</Button>
							</div>

							{/* Error */}
							{error && (
								<Alert
									variant="destructive"
									className="animate-in fade-in slide-in-from-top-2"
								>
									<AlertCircle className="h-4 w-4" />
									<AlertDescription>{error}</AlertDescription>
								</Alert>
							)}
						</CardContent>
					</Card>

					{/* Results Section */}
					{result && (
						<div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
							{/* Stats Grid */}
							<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
								<Card className="hover:border-secondary/50 transition-colors">
									<CardContent className="p-6">
										<div className="flex items-center gap-4">
											<div className="flex h-12 w-12 items-center justify-center rounded-lg bg-secondary/10">
												<MessageSquare className="h-6 w-6 text-secondary" />
											</div>
											<div>
												<div className="text-2xl font-bold">
													{result.comments.length}
												</div>
												<div className="text-sm text-muted-foreground">
													Comments
												</div>
											</div>
										</div>
									</CardContent>
								</Card>

								<Card className="hover:border-primary/50 transition-colors">
									<CardContent className="p-6">
										<div className="flex items-center gap-4">
											<div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
												<MessageCircle className="h-6 w-6 text-primary" />
											</div>
											<div>
												<div className="text-2xl font-bold">{totalReplies}</div>
												<div className="text-sm text-muted-foreground">
													Replies
												</div>
											</div>
										</div>
									</CardContent>
								</Card>

								<Card className="hover:border-chart-3/50 transition-colors">
									<CardContent className="p-6">
										<div className="flex items-center gap-4">
											<div className="flex h-12 w-12 items-center justify-center rounded-lg bg-chart-3/10">
												<Users className="h-6 w-6 text-chart-3" />
											</div>
											<div>
												<div className="text-2xl font-bold">{uniqueUsers}</div>
												<div className="text-sm text-muted-foreground">
													Users
												</div>
											</div>
										</div>
									</CardContent>
								</Card>
							</div>

							{/* Caption */}
							{result.caption && (
								<Card>
									<CardHeader className="pb-3">
										<CardTitle className="text-sm font-medium text-muted-foreground">
											Video Caption
										</CardTitle>
									</CardHeader>
									<CardContent>
										<p className="text-foreground">{result.caption}</p>
									</CardContent>
								</Card>
							)}

							{/* Search, Filter, and Selection Controls */}
							<Card>
								<CardHeader className="pb-3">
									<div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
										<CardTitle className="text-lg flex items-center gap-2">
											<MessageSquare className="h-5 w-5 text-primary" />
											All Comments
										</CardTitle>
										<div className="flex items-center gap-2 text-sm">
											<Badge variant="secondary">
												{filteredAndSortedComments.length} shown
											</Badge>
											<Badge variant="outline">
												{selectedIds.size} selected
											</Badge>
										</div>
									</div>
								</CardHeader>

								<CardContent className="space-y-4">
									{/* Search and Filter Row */}
									<div className="flex flex-col md:flex-row gap-3">
										{/* Search Input */}
										<div className="relative flex-1">
											<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
											<Input
												type="text"
												value={searchQuery}
												onChange={(e) => setSearchQuery(e.target.value)}
												placeholder="Search by username or comment text..."
												className="pl-10"
											/>
											{searchQuery && (
												<button
													type="button"
													onClick={() => setSearchQuery("")}
													className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
												>
													<X className="h-4 w-4" />
												</button>
											)}
										</div>

										{/* Filter Toggle */}
										<Button
											variant="outline"
											onClick={() => setShowFilters(!showFilters)}
											className="gap-2"
										>
											<Filter className="h-4 w-4" />
											Filters
											<ChevronDown
												className={`h-4 w-4 transition-transform ${
													showFilters ? "rotate-180" : ""
												}`}
											/>
										</Button>
									</div>

									{/* Filter and Sort Options */}
									{showFilters && (
										<div className="flex flex-wrap gap-4 p-4 rounded-lg bg-muted/30 animate-in fade-in slide-in-from-top-2">
											{/* Filter Type */}
											<div className="space-y-2">
												<label className="text-sm font-medium text-muted-foreground">
													Show
												</label>
												<div className="flex gap-2">
													<Button
														variant={
															filterType === "all" ? "secondary" : "outline"
														}
														size="sm"
														onClick={() => setFilterType("all")}
														className="gap-1.5"
													>
														<MessageSquare className="h-3.5 w-3.5" />
														All
													</Button>
													<Button
														variant={
															filterType === "comments"
																? "secondary"
																: "outline"
														}
														size="sm"
														onClick={() => setFilterType("comments")}
														className="gap-1.5"
													>
														<MessageCircle className="h-3.5 w-3.5" />
														Comments Only
													</Button>
													<Button
														variant={
															filterType === "replies" ? "secondary" : "outline"
														}
														size="sm"
														onClick={() => setFilterType("replies")}
														className="gap-1.5"
													>
														<Reply className="h-3.5 w-3.5" />
														Replies Only
													</Button>
												</div>
											</div>

											{/* Sort Type */}
											<div className="space-y-2">
												<label className="text-sm font-medium text-muted-foreground">
													Sort by
												</label>
												<div className="flex gap-2">
													<Button
														variant={
															sortType === "newest" ? "secondary" : "outline"
														}
														size="sm"
														onClick={() => setSortType("newest")}
														className="gap-1.5"
													>
														<ArrowDownAZ className="h-3.5 w-3.5" />
														Newest
													</Button>
													<Button
														variant={
															sortType === "oldest" ? "secondary" : "outline"
														}
														size="sm"
														onClick={() => setSortType("oldest")}
														className="gap-1.5"
													>
														<ArrowUpAZ className="h-3.5 w-3.5" />
														Oldest
													</Button>
													<Button
														variant={
															sortType === "most_replies"
																? "secondary"
																: "outline"
														}
														size="sm"
														onClick={() => setSortType("most_replies")}
														className="gap-1.5"
													>
														<MessageCircle className="h-3.5 w-3.5" />
														Most Replies
													</Button>
												</div>
											</div>
										</div>
									)}

									{/* Selection Controls */}
									<div className="flex flex-wrap gap-2">
										<Button
											variant="outline"
											size="sm"
											onClick={selectAll}
											className="gap-1.5"
										>
											<Check className="h-3.5 w-3.5" />
											Select All
										</Button>
										<Button
											variant="outline"
											size="sm"
											onClick={deselectAll}
											className="gap-1.5"
										>
											<X className="h-3.5 w-3.5" />
											Deselect All
										</Button>
										<div className="flex-1" />
										<Button
											variant="outline"
											size="sm"
											onClick={handleExportJson}
											disabled={selectedIds.size === 0}
											className="gap-1.5"
										>
											<FileJson className="h-3.5 w-3.5 text-success" />
											Export Selected JSON
										</Button>
										<Button
											variant="secondary"
											size="sm"
											onClick={handleExportPng}
											disabled={selectedIds.size === 0 || exporting}
											className="gap-1.5"
										>
											{exporting ? (
												<Loader2 className="h-3.5 w-3.5 animate-spin" />
											) : (
												<Image className="h-3.5 w-3.5" />
											)}
											Export Selected PNG
										</Button>
									</div>

									<Separator />
								</CardContent>

								<Separator />

								{/* Comments List */}
								<ScrollArea maxHeight="600px">
									<div className="space-y-2 p-4">
										{filteredAndSortedComments.map((item) => (
											<TikTokComment
												key={item.comment.comment_id}
												ref={(el) => {
													if (el) {
														commentRefs.current.set(
															item.comment.comment_id,
															el,
														);
													}
												}}
												comment={item.comment}
												isReply={item.isReply}
												selected={selectedIds.has(item.comment.comment_id)}
												onSelect={toggleSelection}
												showCheckbox
											/>
										))}

										{filteredAndSortedComments.length === 0 && (
											<div className="text-center py-8 text-muted-foreground">
												No comments match your filters.
											</div>
										)}
									</div>
								</ScrollArea>
							</Card>

							{/* Action Buttons */}
							<div className="flex flex-col sm:flex-row gap-3">
								<Button
									onClick={handleSendToBoard}
									disabled={sendingToBoard}
									size="lg"
									className="flex-1 sm:flex-none"
								>
									{sendingToBoard ? (
										<Loader2 className="h-4 w-4 animate-spin" />
									) : (
										<LayoutDashboard className="h-4 w-4" />
									)}
									{sendingToBoard ? "Creating Board..." : "Send to Board"}
								</Button>
								<Button
									onClick={handleDownloadJson}
									variant="outline"
									size="lg"
									className="flex-1 sm:flex-none"
								>
									<FileJson className="h-4 w-4 text-success" />
									Download All JSON
								</Button>
							</div>
						</div>
					)}
				</div>
			</main>

			{/* Footer */}
			<footer className="border-t border-border py-6">
				<div className="container mx-auto px-4 md:px-6">
					<div className="flex flex-col sm:flex-row items-center justify-between gap-4">
						<p className="text-sm text-muted-foreground">
							Built with <span className="text-secondary">Bun</span> +{" "}
							<span className="text-chart-3">React</span> +{" "}
							<span className="text-primary">shadcn/ui</span>
						</p>
						<div className="flex items-center gap-2 text-muted-foreground text-sm">
							<Sparkles className="h-4 w-4 text-warning" />
							Powered by Playwright
						</div>
					</div>
				</div>
			</footer>
		</div>
	);
}
