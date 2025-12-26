import { useReactFlow } from "@xyflow/react";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import {
	FileJson,
	FileText,
	Group,
	Image,
	Maximize,
	Redo2,
	Trash2,
	Undo2,
	ZoomIn,
	ZoomOut,
} from "lucide-react";
import { useCallback } from "react";
import { useBoardHistory, useBoardStore } from "../../stores/board-store";
import { Button } from "../ui/button";

interface BoardToolbarProps {
	onCreateGroup?: () => void;
	onDeleteSelected?: () => void;
}

export function BoardToolbar({
	onCreateGroup,
	onDeleteSelected,
}: BoardToolbarProps) {
	const { zoomIn, zoomOut, fitView, getNodes } = useReactFlow();
	const { undo, redo, canUndo, canRedo } = useBoardHistory();
	const { board, selectedNodes } = useBoardStore();

	// Export as PNG
	const handleExportPng = useCallback(async () => {
		const flowElement = document.querySelector(
			".react-flow",
		) as HTMLElement | null;
		if (!flowElement) return;

		try {
			const dataUrl = await toPng(flowElement, {
				backgroundColor: "#0a0a0f",
				pixelRatio: 2,
			});

			const link = document.createElement("a");
			link.download = `${board?.title || "board"}-${Date.now()}.png`;
			link.href = dataUrl;
			link.click();
		} catch (error) {
			console.error("Failed to export PNG:", error);
		}
	}, [board?.title]);

	// Export as PDF
	const handleExportPdf = useCallback(async () => {
		const flowElement = document.querySelector(
			".react-flow",
		) as HTMLElement | null;
		if (!flowElement) return;

		try {
			const dataUrl = await toPng(flowElement, {
				backgroundColor: "#0a0a0f",
				pixelRatio: 2,
			});

			const img = new window.Image();
			img.src = dataUrl;

			await new Promise((resolve) => {
				img.onload = resolve;
			});

			const pdf = new jsPDF({
				orientation: img.width > img.height ? "landscape" : "portrait",
				unit: "px",
				format: [img.width, img.height],
			});

			pdf.addImage(dataUrl, "PNG", 0, 0, img.width, img.height);
			pdf.save(`${board?.title || "board"}-${Date.now()}.pdf`);
		} catch (error) {
			console.error("Failed to export PDF:", error);
		}
	}, [board?.title]);

	// Export as JSON
	const handleExportJson = useCallback(() => {
		const nodes = getNodes();
		const data = {
			board,
			nodes: nodes.map((node) => ({
				id: node.id,
				type: node.type,
				position: node.position,
				data: node.data,
			})),
			exportedAt: new Date().toISOString(),
		};

		const blob = new Blob([JSON.stringify(data, null, 2)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.download = `${board?.title || "board"}-${Date.now()}.json`;
		link.href = url;
		link.click();
		URL.revokeObjectURL(url);
	}, [board, getNodes]);

	return (
		<div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
			{/* Zoom controls */}
			<div className="flex items-center gap-1 bg-card/90 backdrop-blur rounded-lg p-1 shadow-lg border border-border">
				<Button
					variant="ghost"
					size="icon"
					onClick={() => zoomIn()}
					title="Zoom In"
				>
					<ZoomIn className="w-4 h-4" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					onClick={() => zoomOut()}
					title="Zoom Out"
				>
					<ZoomOut className="w-4 h-4" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					onClick={() => fitView({ padding: 0.2 })}
					title="Fit View"
				>
					<Maximize className="w-4 h-4" />
				</Button>
			</div>

			{/* Undo/Redo */}
			<div className="flex items-center gap-1 bg-card/90 backdrop-blur rounded-lg p-1 shadow-lg border border-border">
				<Button
					variant="ghost"
					size="icon"
					onClick={() => undo()}
					disabled={!canUndo}
					title="Undo (Ctrl+Z)"
				>
					<Undo2 className="w-4 h-4" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					onClick={() => redo()}
					disabled={!canRedo}
					title="Redo (Ctrl+Shift+Z)"
				>
					<Redo2 className="w-4 h-4" />
				</Button>
			</div>

			{/* Actions */}
			<div className="flex items-center gap-1 bg-card/90 backdrop-blur rounded-lg p-1 shadow-lg border border-border">
				<Button
					variant="ghost"
					size="icon"
					onClick={onCreateGroup}
					title="Create Group"
				>
					<Group className="w-4 h-4" />
				</Button>
				{selectedNodes.length > 0 && (
					<Button
						variant="ghost"
						size="icon"
						onClick={onDeleteSelected}
						title="Delete Selected"
						className="text-destructive hover:text-destructive"
					>
						<Trash2 className="w-4 h-4" />
					</Button>
				)}
			</div>

			{/* Export */}
			<div className="flex items-center gap-1 bg-card/90 backdrop-blur rounded-lg p-1 shadow-lg border border-border">
				<Button
					variant="ghost"
					size="icon"
					onClick={handleExportPng}
					title="Export as PNG"
				>
					<Image className="w-4 h-4" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					onClick={handleExportPdf}
					title="Export as PDF"
				>
					<FileText className="w-4 h-4" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					onClick={handleExportJson}
					title="Export as JSON"
				>
					<FileJson className="w-4 h-4" />
				</Button>
			</div>
		</div>
	);
}
