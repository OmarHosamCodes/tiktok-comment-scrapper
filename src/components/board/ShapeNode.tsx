import { NodeResizer } from "@xyflow/react";

export type ShapeType = "rectangle" | "circle" | "diamond";

export interface ShapeNodeData {
	[key: string]: unknown;
	shapeType: ShapeType;
	color: string;
	borderColor: string;
	dbId: string;
}

interface ShapeNodeProps {
	data: ShapeNodeData;
	selected?: boolean;
}

export function ShapeNode({ data, selected }: ShapeNodeProps) {
	const { shapeType, color, borderColor } = data;

	const getShapeStyles = () => {
		switch (shapeType) {
			case "circle":
				return "rounded-full";
			case "diamond":
				return "rotate-45";
			default:
				return "rounded-lg";
		}
	};

	return (
		<div
			className={`
				relative w-full h-full transition-all
				${selected ? "ring-2 ring-primary/50 shadow-2xl" : "shadow-lg"}
				${getShapeStyles()}
			`}
			style={{
				backgroundColor: color || "#3b82f6",
				border: `2px solid ${borderColor || color || "#3b82f6"}`,
			}}
		>
			<NodeResizer
				color={borderColor || color || "var(--primary)"}
				isVisible={selected}
				minWidth={50}
				minHeight={50}
				handleStyle={{
					width: 10,
					height: 10,
					borderRadius: 4,
				}}
				lineStyle={{
					borderWidth: 2,
				}}
			/>
			{shapeType === "diamond" && (
				<div className="absolute inset-0 -rotate-45" />
			)}
		</div>
	);
}
