import { NodeResizer } from "@xyflow/react";
import { Folder } from "lucide-react";
import type { GroupNodeData } from "../../stores/board-store";

interface GroupNodeProps {
	data: GroupNodeData;
	selected?: boolean;
}

export function GroupNode({ data, selected }: GroupNodeProps) {
	return (
		<div
			className={`
				relative rounded-2xl border-2 transition-all w-full h-full
				${selected ? "ring-2 ring-primary/50 shadow-2xl" : "shadow-lg"}
			`}
			style={{
				backgroundColor: `${data.color}15`,
				borderColor: selected ? data.color : `${data.color}60`,
				backdropFilter: "blur(8px)",
			}}
		>
			<NodeResizer
				color={data.color || "var(--primary)"}
				isVisible={selected}
				minWidth={250}
				minHeight={200}
				handleStyle={{
					width: 10,
					height: 10,
					borderRadius: 4,
				}}
				lineStyle={{
					borderWidth: 2,
				}}
			/>

			{/* Group header */}
			<div
				className="absolute -top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-lg shadow-md"
				style={{
					backgroundColor: data.color || "#6366f1",
				}}
			>
				<Folder className="w-4 h-4 text-white" />
				<span className="text-sm font-semibold text-white">
					{data.label || "Untitled Group"}
				</span>
			</div>

			{/* Drop zone indicator */}
			<div
				className="absolute inset-4 top-6 rounded-xl border-2 border-dashed border-transparent pointer-events-none opacity-0 transition-opacity group-hover:opacity-100"
				style={{
					borderColor: `${data.color}40`,
				}}
			/>
		</div>
	);
}
