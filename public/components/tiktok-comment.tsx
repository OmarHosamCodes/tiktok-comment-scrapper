import { Heart, MessageCircle } from "lucide-react";
import { forwardRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";

interface Comment {
	comment_id: string;
	username: string;
	nickname: string;
	comment: string;
	create_time: string;
	avatar: string;
	total_reply: number;
	replies?: Comment[];
}

interface TikTokCommentProps {
	comment: Comment;
	isReply?: boolean;
	selected?: boolean;
	onSelect?: (id: string) => void;
	showCheckbox?: boolean;
}

export const TikTokComment = forwardRef<HTMLDivElement, TikTokCommentProps>(
	(
		{
			comment,
			isReply = false,
			selected = false,
			onSelect,
			showCheckbox = false,
		},
		ref,
	) => {
		return (
			<div
				ref={ref}
				className={`
					relative p-4 rounded-xl transition-all duration-200
					${isReply ? "ml-12 bg-muted/30" : "bg-card"}
					${selected ? "ring-2 ring-primary/50 bg-primary/5" : ""}
					hover:bg-muted/50
				`}
				data-comment-id={comment.comment_id}
			>
				{/* Checkbox for selection */}
				{showCheckbox && (
					<div className="absolute top-4 right-4 z-10">
						<input
							type="checkbox"
							checked={selected}
							onChange={() => onSelect?.(comment.comment_id)}
							className="w-5 h-5 rounded-md border-2 border-muted-foreground/30 bg-transparent 
								checked:bg-primary checked:border-primary cursor-pointer
								focus:ring-2 focus:ring-primary/30 transition-all"
						/>
					</div>
				)}

				<div className="flex gap-3">
					{/* Avatar */}
					<Avatar
						className={`${isReply ? "h-8 w-8" : "h-10 w-10"} ring-2 ring-border`}
					>
						<AvatarImage src={comment.avatar} alt={comment.username} />
						<AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-primary-foreground font-semibold text-sm">
							{comment.nickname.charAt(0).toUpperCase()}
						</AvatarFallback>
					</Avatar>

					<div className="flex-1 min-w-0 space-y-1.5">
						{/* Username */}
						<div className="flex items-center gap-2">
							<span
								className={`font-semibold text-foreground ${isReply ? "text-sm" : ""}`}
							>
								{comment.nickname}
							</span>
							<span className="text-muted-foreground text-xs">
								@{comment.username}
							</span>
						</div>

						{/* Comment text */}
						<p
							className={`text-foreground/90 leading-relaxed ${isReply ? "text-sm" : ""}`}
						>
							{comment.comment}
						</p>

						{/* Footer: timestamp and actions */}
						<div className="flex items-center gap-4 pt-1">
							<span className="text-xs text-muted-foreground">
								{comment.create_time}
							</span>

							{/* Reply count indicator */}
							{comment.total_reply > 0 && !isReply && (
								<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
									<MessageCircle className="h-3.5 w-3.5" />
									<span>{comment.total_reply}</span>
								</div>
							)}

							{/* Like indicator (decorative) */}
							<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
								<Heart className="h-3.5 w-3.5" />
							</div>
						</div>
					</div>
				</div>
			</div>
		);
	},
);

TikTokComment.displayName = "TikTokComment";
