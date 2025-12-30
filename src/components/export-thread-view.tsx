import { forwardRef } from "react";
import type { Comment } from "../hooks/use-scraper";
import { TikTokComment } from "./tiktok-comment";

interface ExportThreadViewProps {
	comment: Comment;
	replies?: Comment[];
}

export const ExportThreadView = forwardRef<
	HTMLDivElement,
	ExportThreadViewProps
>(({ comment, replies = [] }, ref) => {
	return (
		<div ref={ref} className="bg-background p-4 rounded-xl space-y-4 w-[600px]">
			{/* Parent Comment */}
			<TikTokComment comment={comment} showCheckbox={false} />

			{/* Replies Section */}
			{replies.length > 0 && (
				<div className="pl-4 space-y-4 border-l-2 border-muted ml-4">
					{replies.map((reply) => (
						<TikTokComment
							key={reply.comment_id}
							comment={reply}
							isReply={true}
							showCheckbox={false}
						/>
					))}
				</div>
			)}
		</div>
	);
});

ExportThreadView.displayName = "ExportThreadView";
