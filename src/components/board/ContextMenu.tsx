import { useReactFlow } from "@xyflow/react";
import {
	Copy,
	Edit2,
	Folder,
	FolderMinus,
	FolderPlus,
	Palette,
	Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BoardNode, GroupNodeData } from "../../stores/board-store";
import { useBoardStore } from "../../stores/board-store";

interface ContextMenuProps {
	x: number;
	y: number;
	nodeId?: string;
	onClose: () => void;
	onCreateGroup: () => void;
	onDeleteSelected: () => void;
	slug: string;
}

const COLORS = [
	"#6366f1", // Indigo
	"#8b5cf6", // Violet
	"#ec4899", // Pink
	"#ef4444", // Red
	"#f97316", // Orange
	"#eab308", // Yellow
	"#22c55e", // Green
	"#14b8a6", // Teal
	"#06b6d4", // Cyan
	"#3b82f6", // Blue
];

export function ContextMenu({
	x,
	y,
	nodeId,
	onClose,
	onCreateGroup,
	onDeleteSelected,
	slug,
}: ContextMenuProps) {
	const menuRef = useRef<HTMLDivElement>(null);
	const [showColorPicker, setShowColorPicker] = useState(false);
	const [showGroupSubmenu, setShowGroupSubmenu] = useState(false);
	const [isRenaming, setIsRenaming] = useState(false);
	const [renameValue, setRenameValue] = useState("");
	const renameInputRef = useRef<HTMLInputElement>(null);
	const { getNode } = useReactFlow();
	const { nodes, setNodes, selectedNodes, updateNodeData, updateGroup } =
		useBoardStore();

	const node = nodeId ? getNode(nodeId) : null;
	const isGroup = node?.type === "group";
	const isComment = node?.type === "comment";
	const hasParent = node?.parentId !== undefined;

	// Get available groups to add comment to - memoized
	const availableGroups = useMemo(
		() => nodes.filter((n) => n.type === "group"),
		[nodes],
	);

	// Close menu on click outside
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				onClose();
			}
		};

		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		document.addEventListener("keydown", handleEscape);

		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
			document.removeEventListener("keydown", handleEscape);
		};
	}, [onClose]);

	// Handle adding comment to a group
	const handleAddToGroup = useCallback(
		(groupId: string) => {
			if (!nodeId) return;

			const groupNode = nodes.find((n) => n.id === groupId);
			if (!groupNode) return;

			const currentNode = nodes.find((n) => n.id === nodeId);
			if (!currentNode) return;

			// Calculate position relative to group
			const relativeX = currentNode.position.x - groupNode.position.x;
			const relativeY = currentNode.position.y - groupNode.position.y;

			// Update node with parent ID
			setNodes(
				nodes.map((n) => {
					if (n.id === nodeId) {
						return {
							...n,
							parentId: groupId,
							position: {
								x: Math.max(20, relativeX),
								y: Math.max(40, relativeY),
							},
							extent: "parent" as const,
						};
					}
					return n;
				}) as BoardNode[],
			);

			// Persist to server - update position and groupId
			if (slug && currentNode.data.dbId) {
				const groupDbId = (groupNode.data as GroupNodeData).dbId;
				fetch(`/api/boards/${slug}/comments/${currentNode.data.dbId}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						positionX: Math.max(20, relativeX),
						positionY: Math.max(40, relativeY),
						groupId: groupDbId,
					}),
				}).catch(console.error);
			}

			onClose();
		},
		[nodeId, nodes, setNodes, onClose, slug],
	);

	// Handle removing comment from group
	const handleRemoveFromGroup = useCallback(() => {
		if (!nodeId || !node) return;

		const parentNode = nodes.find((n) => n.id === node.parentId);
		if (!parentNode) return;

		// Convert back to absolute position
		setNodes(
			nodes.map((n) => {
				if (n.id === nodeId) {
					return {
						...n,
						parentId: undefined,
						position: {
							x: parentNode.position.x + n.position.x,
							y: parentNode.position.y + n.position.y,
						},
						extent: undefined,
					};
				}
				return n;
			}) as BoardNode[],
		);

		onClose();
	}, [nodeId, node, nodes, setNodes, onClose]);

	// Handle color change
	const handleColorChange = useCallback(
		(color: string) => {
			if (!nodeId || !node) return;

			if (isGroup) {
				updateGroup(nodeId, { color });

				// Sync to server
				if (slug && (node.data as GroupNodeData).dbId) {
					fetch(
						`/api/boards/${slug}/groups/${(node.data as GroupNodeData).dbId}`,
						{
							method: "PATCH",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({ color }),
						},
					).catch(console.error);
				}
			} else if (isComment) {
				updateNodeData(nodeId, { color });

				// Sync to server
				if (slug && node.data.dbId) {
					fetch(`/api/boards/${slug}/comments/${node.data.dbId}`, {
						method: "PATCH",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ color }),
					}).catch(console.error);
				}
			}

			setShowColorPicker(false);
			onClose();
		},
		[
			nodeId,
			node,
			isGroup,
			isComment,
			updateGroup,
			updateNodeData,
			slug,
			onClose,
		],
	);

	// Create group from selected nodes
	const handleGroupSelected = useCallback(() => {
		if (selectedNodes.length < 2) return;

		onCreateGroup();
		onClose();
	}, [selectedNodes, onCreateGroup, onClose]);

	// Handle rename group
	const handleStartRename = useCallback(() => {
		if (!node || !isGroup) return;
		setRenameValue((node.data as GroupNodeData).label || "");
		setIsRenaming(true);
		setTimeout(() => renameInputRef.current?.focus(), 50);
	}, [node, isGroup]);

	const handleRenameSubmit = useCallback(() => {
		if (!nodeId || !isGroup || !renameValue.trim()) {
			setIsRenaming(false);
			return;
		}

		updateGroup(nodeId, { label: renameValue.trim() });

		// Sync to server
		if (slug && (node?.data as GroupNodeData).dbId) {
			fetch(
				`/api/boards/${slug}/groups/${(node?.data as GroupNodeData).dbId}`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ label: renameValue.trim() }),
				},
			).catch(console.error);
		}

		setIsRenaming(false);
		onClose();
	}, [nodeId, isGroup, renameValue, updateGroup, slug, node?.data, onClose]);

	// Stop event propagation to prevent React Flow from interfering
	const handleMenuClick = useCallback((e: React.MouseEvent) => {
		e.stopPropagation();
	}, []);

	return (
		<div
			ref={menuRef}
			role="menu"
			tabIndex={-1}
			className="fixed z-50 min-w-[180px] bg-card border border-border rounded-lg shadow-xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-100"
			style={{
				left: Math.min(x, window.innerWidth - 220),
				top: Math.min(y, window.innerHeight - 300),
			}}
			onClick={handleMenuClick}
			onKeyDown={(e) => {
				if (e.key === "Escape") onClose();
			}}
			onContextMenu={(e) => e.preventDefault()}
		>
			{/* Rename input for groups */}
			{isRenaming && (
				<div className="p-2 border-b border-border">
					<input
						ref={renameInputRef}
						type="text"
						value={renameValue}
						onChange={(e) => setRenameValue(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") handleRenameSubmit();
							if (e.key === "Escape") setIsRenaming(false);
						}}
						onBlur={handleRenameSubmit}
						className="w-full px-2 py-1 text-sm bg-background border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary"
						placeholder="Group name..."
					/>
				</div>
			)}

			{/* Node-specific actions */}
			{node && (
				<>
					{/* Color picker */}
					<div className="relative">
						<button
							type="button"
							onClick={() => setShowColorPicker(!showColorPicker)}
							className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted transition-colors text-left"
						>
							<Palette className="w-4 h-4" />
							<span>Change Color</span>
						</button>

						{showColorPicker && (
							<div className="absolute left-full top-0 ml-1 p-2 bg-card border border-border rounded-lg shadow-xl grid grid-cols-5 gap-1">
								{COLORS.map((color) => (
									<button
										key={color}
										type="button"
										onClick={() => handleColorChange(color)}
										className="w-6 h-6 rounded-md hover:scale-110 transition-transform ring-2 ring-transparent hover:ring-white/30"
										style={{ backgroundColor: color }}
									/>
								))}
							</div>
						)}
					</div>

					{/* Rename group */}
					{isGroup && !isRenaming && (
						<button
							type="button"
							onClick={handleStartRename}
							className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted transition-colors text-left"
						>
							<Edit2 className="w-4 h-4" />
							<span>Rename Group</span>
						</button>
					)}

					{/* Add to group (for comments not in a group) */}
					{isComment && !hasParent && availableGroups.length > 0 && (
						<div className="relative">
							<button
								type="button"
								onClick={() => setShowGroupSubmenu(!showGroupSubmenu)}
								className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted transition-colors text-left"
							>
								<FolderPlus className="w-4 h-4" />
								<span>Add to Group</span>
								<span className="ml-auto text-muted-foreground">▶</span>
							</button>

							{showGroupSubmenu && (
								<div
									className="absolute left-full top-0 ml-1 min-w-[150px] bg-card border border-border rounded-lg shadow-xl"
									style={{ maxHeight: 200, overflowY: "auto" }}
								>
									{availableGroups.map((group) => (
										<button
											key={group.id}
											type="button"
											onClick={() => handleAddToGroup(group.id)}
											className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-left"
										>
											<div
												className="w-3 h-3 rounded-sm shrink-0"
												style={{
													backgroundColor: (group.data as GroupNodeData).color,
												}}
											/>
											<span className="truncate">
												{(group.data as GroupNodeData).label || "Untitled"}
											</span>
										</button>
									))}
								</div>
							)}
						</div>
					)}

					{/* Remove from group (for comments in a group) */}
					{isComment && hasParent && (
						<button
							type="button"
							onClick={handleRemoveFromGroup}
							className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted transition-colors text-left"
						>
							<FolderMinus className="w-4 h-4" />
							<span>Remove from Group</span>
						</button>
					)}

					<div className="h-px bg-border my-1" />
				</>
			)}

			{/* General actions */}
			<button
				type="button"
				onClick={() => {
					onCreateGroup();
					onClose();
				}}
				className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted transition-colors text-left"
			>
				<Folder className="w-4 h-4" />
				<span>Create Group</span>
			</button>

			{selectedNodes.length >= 2 && (
				<button
					type="button"
					onClick={handleGroupSelected}
					className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted transition-colors text-left"
				>
					<Copy className="w-4 h-4" />
					<span>Group Selected ({selectedNodes.length})</span>
				</button>
			)}

			{(nodeId || selectedNodes.length > 0) && (
				<>
					<div className="h-px bg-border my-1" />
					<button
						type="button"
						onClick={() => {
							onDeleteSelected();
							onClose();
						}}
						className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-destructive/20 text-destructive transition-colors text-left"
					>
						<Trash2 className="w-4 h-4" />
						<span>Delete</span>
					</button>
				</>
			)}
		</div>
	);
}
