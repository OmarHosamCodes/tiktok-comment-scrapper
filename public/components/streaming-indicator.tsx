import { Loader2 } from "lucide-react";

interface StreamingIndicatorProps {
	count: number;
	progress: string;
}

export function StreamingIndicator({
	count,
	progress,
}: StreamingIndicatorProps) {
	return (
		<div className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-primary/10 via-secondary/10 to-chart-3/10 border border-primary/20">
			<div className="relative">
				<div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
				<div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary">
					<Loader2 className="h-5 w-5 text-primary-foreground animate-spin" />
				</div>
			</div>

			<div className="flex-1">
				<div className="flex items-center gap-2">
					<span className="font-semibold text-foreground">
						Streaming Comments
					</span>
					<span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-sm font-medium">
						{count} fetched
					</span>
				</div>
				<p className="text-sm text-muted-foreground mt-0.5">{progress}</p>
			</div>

			{/* Animated dots */}
			<div className="flex gap-1">
				{[0, 1, 2].map((i) => (
					<div
						key={i}
						className="w-2 h-2 rounded-full bg-primary animate-bounce"
						style={{ animationDelay: `${i * 0.15}s` }}
					/>
				))}
			</div>
		</div>
	);
}
