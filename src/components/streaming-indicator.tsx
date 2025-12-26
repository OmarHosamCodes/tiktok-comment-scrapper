import { Loader2, Radio } from "lucide-react";

interface StreamingIndicatorProps {
	count: number;
	progress: string;
}

export function StreamingIndicator({
	count,
	progress,
}: StreamingIndicatorProps) {
	// Parse page number from progress message if available
	const pageMatch = progress.match(/page (\d+)/i);
	const currentPage = pageMatch ? parseInt(pageMatch[1], 10) : null;

	return (
		<div className="flex items-center gap-4 p-4 rounded-xl bg-linear-to-r from-primary/10 via-secondary/10 to-chart-3/10 border border-primary/20">
			<div className="relative">
				<div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
				<div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-linear-to-br from-primary to-secondary">
					<Loader2 className="h-5 w-5 text-primary-foreground animate-spin" />
				</div>
			</div>

			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2 flex-wrap">
					<span className="font-semibold text-foreground">
						Fetching Comments
					</span>
					{currentPage && (
						<span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-sm font-medium">
							Page {currentPage}
						</span>
					)}
				</div>
				<p className="text-sm text-muted-foreground mt-0.5 truncate">
					{progress}
				</p>
			</div>

			{/* Live indicator */}
			<div className="flex items-center gap-2">
				<Radio className="h-4 w-4 text-red-500 animate-pulse" />
				<span className="text-xs text-muted-foreground font-medium">LIVE</span>
			</div>
		</div>
	);
}
