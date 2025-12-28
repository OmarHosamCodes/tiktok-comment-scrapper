import { NodeResizer } from "@xyflow/react";
import { useCallback, useEffect, useRef, useState } from "react";

export interface TextNodeData {
	[key: string]: unknown;
	text: string;
	fontSize: number;
	fontWeight: "normal" | "bold";
	color: string;
	dbId: string;
}

interface TextNodeProps {
	data: TextNodeData;
	selected?: boolean;
	id: string;
}

export function TextNode({ data, selected, id }: TextNodeProps) {
	const {
		text,
		fontSize = 16,
		fontWeight = "normal",
		color = "#ffffff",
	} = data;
	const [isEditing, setIsEditing] = useState(false);
	const [editText, setEditText] = useState(text);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		if (isEditing && textareaRef.current) {
			textareaRef.current.focus();
			textareaRef.current.select();
		}
	}, [isEditing]);

	useEffect(() => {
		setEditText(text);
	}, [text]);

	const handleDoubleClick = useCallback(() => {
		setIsEditing(true);
	}, []);

	const handleBlur = useCallback(() => {
		setIsEditing(false);
		// Dispatch custom event to update text
		const event = new CustomEvent("textNodeUpdate", {
			detail: { id, text: editText },
		});
		window.dispatchEvent(event);
	}, [id, editText]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Escape") {
				setEditText(text);
				setIsEditing(false);
			} else if (e.key === "Enter" && !e.shiftKey) {
				handleBlur();
			}
		},
		[text, handleBlur],
	);

	return (
		<button
			type="button"
			className={`
				relative min-w-[100px] min-h-[40px] p-2 transition-all bg-transparent text-left
				${selected ? "ring-2 ring-primary/50" : ""}
			`}
			onDoubleClick={handleDoubleClick}
		>
			<NodeResizer
				color="var(--primary)"
				isVisible={selected}
				minWidth={100}
				minHeight={40}
				handleStyle={{
					width: 8,
					height: 8,
					borderRadius: 4,
				}}
				lineStyle={{
					borderWidth: 1,
				}}
			/>
			{isEditing ? (
				<textarea
					ref={textareaRef}
					value={editText}
					onChange={(e) => setEditText(e.target.value)}
					onBlur={handleBlur}
					onKeyDown={handleKeyDown}
					className="w-full h-full bg-transparent border-none outline-none resize-none"
					style={{
						fontSize: `${fontSize}px`,
						fontWeight,
						color,
					}}
				/>
			) : (
				<div
					className="whitespace-pre-wrap wrap-break-word cursor-text"
					style={{
						fontSize: `${fontSize}px`,
						fontWeight,
						color,
					}}
				>
					{text || "Double-click to edit"}
				</div>
			)}
		</button>
	);
}
