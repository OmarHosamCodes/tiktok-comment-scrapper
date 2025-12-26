import { NodeResizer } from "@xyflow/react";
import type { GroupNodeData } from "../../stores/board-store";

interface GroupNodeProps {
	data: GroupNodeData;
	selected?: boolean;
}

export function GroupNode({ data, selected }: GroupNodeProps) {
	return (
		<div
			className={`
				relative rounded-xl border-2 border-dashed p-4 transition-all
				${selected ? "border-primary" : "border-muted-foreground/30"}
			`}
			style={{
				backgroundColor: `${data.color}20`, // 20% opacity
				borderColor: data.color,
				minWidth: 200,
				minHeight: 150,
			}}
		>
			<NodeResizer
				color={data.color || "#374151"}
				isVisible={selected}
				minWidth={200}
				minHeight={150}
			/>

			{/* Group label */}
			{data.label && (
				<div
					className="absolute -top-3 left-4 px-2 py-0.5 rounded text-sm font-medium"
					style={{
						backgroundColor: data.color || "#374151",
						color: "#fff",
					}}
				>
					{data.label}
				</div>
			)}
		</div>
	);
}
