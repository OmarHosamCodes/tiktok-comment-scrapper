import type { EdgeProps } from "@xyflow/react";
import { getBezierPath } from "@xyflow/react";

export function ReplyEdge({
	id,
	sourceX,
	sourceY,
	targetX,
	targetY,
	sourcePosition,
	targetPosition,
	style = {},
	markerEnd,
}: EdgeProps) {
	const [edgePath] = getBezierPath({
		sourceX,
		sourceY,
		sourcePosition,
		targetX,
		targetY,
		targetPosition,
	});

	return (
		<>
			<path
				id={id}
				style={{
					...style,
					strokeWidth: 2,
					stroke: "hsl(var(--primary))",
				}}
				className="react-flow__edge-path"
				d={edgePath}
				markerEnd={markerEnd}
			/>
			{/* Animated dot along the edge */}
			<circle r="4" fill="hsl(var(--primary))">
				<animateMotion dur="3s" repeatCount="indefinite" path={edgePath} />
			</circle>
		</>
	);
}
