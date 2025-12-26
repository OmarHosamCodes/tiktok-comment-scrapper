import { Heart, MessageCircle } from "lucide-react";
import { forwardRef, useState } from "react";

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

// Generate a consistent color based on username
function getAvatarColor(username: string): string {
	const colors = [
		"from-pink-500 to-rose-500",
		"from-violet-500 to-purple-500",
		"from-blue-500 to-cyan-500",
		"from-emerald-500 to-teal-500",
		"from-orange-500 to-amber-500",
		"from-red-500 to-pink-500",
		"from-indigo-500 to-blue-500",
		"from-fuchsia-500 to-purple-500",
	];
	let hash = 0;
	for (let i = 0; i < username.length; i++) {
		hash = username.charCodeAt(i) + ((hash << 5) - hash);
	}
	return colors[Math.abs(hash) % colors.length];
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
		const [imageError, setImageError] = useState(false);
		const avatarColor = getAvatarColor(comment.username);

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
					{/* Avatar - with fallback for broken images */}
					<div
						className={`
						${isReply ? "h-8 w-8" : "h-10 w-10"} 
						rounded-full ring-2 ring-border overflow-hidden flex-shrink-0
						${imageError ? `bg-gradient-to-br ${avatarColor}` : "bg-muted"}
					`}
					>
						{!imageError && comment.avatar ? (
							<img
								src={comment.avatar}
								alt={comment.username}
								className="w-full h-full object-cover"
								onError={() => setImageError(true)}
								loading="lazy"
								referrerPolicy="no-referrer"
								crossOrigin="anonymous"
							/>
						) : (
							<div
								className={`
								w-full h-full flex items-center justify-center 
								bg-gradient-to-br ${avatarColor} text-white font-semibold
								${isReply ? "text-xs" : "text-sm"}
							`}
							>
								{comment.nickname.charAt(0).toUpperCase()}
							</div>
						)}
					</div>

					<div className="flex-1 min-w-0 space-y-1.5 pr-8">
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
							className={`text-foreground/90 leading-relaxed break-words ${isReply ? "text-sm" : ""}`}
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
