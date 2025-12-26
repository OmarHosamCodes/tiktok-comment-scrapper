import { Handle, Position } from "@xyflow/react";
import { MessageSquare, Reply } from "lucide-react";
import type { CommentNodeData } from "../../stores/board-store";

interface CommentNodeProps {
	data: CommentNodeData;
	selected?: boolean;
}

export function CommentNode({ data, selected }: CommentNodeProps) {
	const isReply = Boolean(data.parentCommentId);

	return (
		<div
			className={`
				relative rounded-xl border-2 bg-card p-4 shadow-lg transition-all
				${selected ? "border-primary ring-2 ring-primary/30" : "border-border"}
				${isReply ? "border-l-4 border-l-primary" : ""}
				${data.color ? "" : ""}
			`}
			style={{
				width: 280,
				minHeight: 120,
				backgroundColor: data.color || undefined,
			}}
		>
			{/* Connection handles */}
			<Handle
				type="target"
				position={Position.Top}
				className="bg-primary! w-3! h-3!"
			/>
			<Handle
				type="source"
				position={Position.Bottom}
				className="bg-primary! w-3! h-3!"
			/>

			{/* Header with avatar and username */}
			<div className="flex items-start gap-3 mb-2">
				{data.avatar ? (
					<img
						src={data.avatar}
						alt={data.nickname}
						className="w-10 h-10 rounded-full object-cover shrink-0"
						draggable={false}
					/>
				) : (
					<div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
						<span className="text-sm font-medium text-muted-foreground">
							{data.nickname?.charAt(0)?.toUpperCase() || "?"}
						</span>
					</div>
				)}
				<div className="flex-1 min-w-0">
					<p className="font-semibold text-sm truncate">{data.nickname}</p>
					<p className="text-xs text-muted-foreground truncate">
						@{data.username}
					</p>
				</div>
				{isReply && <Reply className="w-4 h-4 text-primary shrink-0" />}
			</div>

			{/* Comment text */}
			<p className="text-sm leading-relaxed wrap-break-word line-clamp-4">
				{data.comment}
			</p>

			{/* Footer with timestamp and reply count */}
			<div className="flex items-center justify-between mt-3 pt-2 border-t border-border/50">
				<span className="text-xs text-muted-foreground">
					{data.createTime
						? new Date(data.createTime).toLocaleDateString()
						: ""}
				</span>
				{data.totalReply > 0 && (
					<div className="flex items-center gap-1 text-xs text-muted-foreground">
						<MessageSquare className="w-3 h-3" />
						<span>{data.totalReply}</span>
					</div>
				)}
			</div>

			{/* Orphan reply indicator */}
			{data.isOrphanReply && (
				<div className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground text-xs px-2 py-0.5 rounded-full">
					Orphan
				</div>
			)}
		</div>
	);
}
