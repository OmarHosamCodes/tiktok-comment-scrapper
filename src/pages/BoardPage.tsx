import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft } from "lucide-react";
import { BoardCanvas } from "../components/board/BoardCanvas";
import { Button } from "../components/ui/button";

interface BoardPageProps {
	slug: string;
	onBack: () => void;
}

export function BoardPage({ slug, onBack }: BoardPageProps) {
	return (
		<ReactFlowProvider>
			<div className="relative h-screen w-full">
				{/* Back button */}
				<div className="absolute top-4 left-4 z-50">
					<Button
						variant="outline"
						size="sm"
						onClick={onBack}
						className="bg-card/90 backdrop-blur"
					>
						<ArrowLeft className="w-4 h-4 mr-2" />
						Back to Scraper
					</Button>
				</div>

				<BoardCanvas slug={slug} />
			</div>
		</ReactFlowProvider>
	);
}
