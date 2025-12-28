import {
	Background,
	BackgroundVariant,
	MarkerType,
	MiniMap,
	ReactFlow,
	addEdge,
	type Connection,
	type EdgeChange,
	type NodeChange,
	type NodePositionChange,
	type OnSelectionChangeFunc,
} from "@xyflow/react";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useState } from "react";
import {
	useBoardHistory,
	useBoardStore,
	type BoardNode,
	type GroupNodeData,
} from "../../stores/board-store";
import { BoardToolbar } from "./BoardToolbar";
import { CommentNode } from "./CommentNode";
import { ContextMenu } from "./ContextMenu";
import { GroupNode } from "./GroupNode";
import { ReplyEdge } from "./ReplyEdge";

// Define nodeTypes with looser typing to avoid React Flow v12 generic issues
const nodeTypes = {
	comment: CommentNode,
	group: GroupNode,
};

const edgeTypes = {
	reply: ReplyEdge,
};

const defaultEdgeOptions = {
	type: "reply",
	markerEnd: {
		type: MarkerType.ArrowClosed,
		color: "hsl(var(--primary))",
	},
};

interface BoardCanvasProps {
	slug: string;
}

export function BoardCanvas({ slug }: BoardCanvasProps) {
	const {
		board,
		nodes,
		edges,
		isLoading,
		error,
		setBoard,
		setNodes,
		setEdges,
		setLoading,
		setError,
		onNodesChange,
		onEdgesChange,
		setSelectedNodes,
		addGroup,
	} = useBoardStore();

	const { undo, redo } = useBoardHistory();

	// Context menu state
	const [contextMenu, setContextMenu] = useState<{
		x: number;
		y: number;
		nodeId?: string;
	} | null>(null);

	// Handle context menu
	const handleContextMenu = useCallback((event: React.MouseEvent) => {
		event.preventDefault();
		const target = event.target as HTMLElement;
		const nodeElement = target.closest("[data-id]");
		const nodeId = nodeElement?.getAttribute("data-id") || undefined;

		setContextMenu({
			x: event.clientX,
			y: event.clientY,
			nodeId,
		});
	}, []);

	const handleCloseContextMenu = useCallback(() => {
		setContextMenu(null);
	}, []);

	// Fetch board data
	useEffect(() => {
		const fetchBoard = async () => {
			setLoading(true);
			setError(null);

			try {
				const response = await fetch(`/api/boards/${slug}`);
				if (!response.ok) {
					throw new Error("Board not found");
				}

				const data = await response.json();

				setBoard({
					id: data.id,
					publicSlug: data.publicSlug,
					title: data.title,
					videoUrl: data.videoUrl,
					videoCaption: data.videoCaption,
				});

				// Convert comments to nodes
				const commentNodes = data.comments.map(
					(comment: {
						id: string;
						commentId: string;
						username: string;
						nickname: string;
						comment: string;
						createTime: string;
						avatar: string;
						totalReply: number;
						parentCommentId?: string;
						isOrphanReply?: number;
						positionX: number;
						positionY: number;
						color?: string;
						groupId?: string;
					}) => ({
						id: comment.id,
						type: "comment",
						position: { x: comment.positionX, y: comment.positionY },
						// If comment belongs to a group, set parentId for React Flow parent-child relationship
						...(comment.groupId && {
							parentId: comment.groupId,
							extent: "parent" as const,
						}),
						data: {
							dbId: comment.id,
							commentId: comment.commentId,
							username: comment.username,
							nickname: comment.nickname,
							comment: comment.comment,
							createTime: comment.createTime,
							avatar: comment.avatar,
							totalReply: comment.totalReply,
							parentCommentId: comment.parentCommentId,
							isOrphanReply: comment.isOrphanReply === 1,
							color: comment.color,
						},
					}),
				);

				// Convert groups to nodes
				const groupNodes = data.groups.map(
					(group: {
						id: string;
						label: string;
						positionX: number;
						positionY: number;
						width: number;
						height: number;
						color: string;
					}) => ({
						id: group.id,
						type: "group",
						position: { x: group.positionX, y: group.positionY },
						style: { width: group.width, height: group.height },
						data: {
							dbId: group.id,
							label: group.label,
							color: group.color,
						},
						// Groups should be behind comments
						zIndex: -1,
					}),
				);

				// Convert edges
				const replyEdges = data.edges.map(
					(edge: {
						id: string;
						sourceCommentId: string;
						targetCommentId: string;
					}) => {
						// Find node IDs by commentId
						const sourceNode = data.comments.find(
							(c: { commentId: string }) =>
								c.commentId === edge.sourceCommentId,
						);
						const targetNode = data.comments.find(
							(c: { commentId: string }) =>
								c.commentId === edge.targetCommentId,
						);

						return {
							id: edge.id,
							source: sourceNode?.id || edge.sourceCommentId,
							target: targetNode?.id || edge.targetCommentId,
							type: "reply",
						};
					},
				);

				setNodes([...groupNodes, ...commentNodes]);
				setEdges(replyEdges);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to load board");
			} finally {
				setLoading(false);
			}
		};

		fetchBoard();
	}, [slug, setBoard, setNodes, setEdges, setLoading, setError]);

	// Handle keyboard shortcuts
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key === "z") {
				if (e.shiftKey) {
					redo();
				} else {
					undo();
				}
				e.preventDefault();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [undo, redo]);

	// Handle node position changes and sync to server
	const handleNodesChange = useCallback(
		(changes: NodeChange[]) => {
			// Type cast needed due to React Flow v12 strict generics
			onNodesChange(changes as NodeChange<BoardNode>[]);

			// Debounce position updates to server
			const positionChanges = changes.filter(
				(change): change is NodePositionChange =>
					change.type === "position" &&
					"dragging" in change &&
					change.dragging === false,
			);

			if (positionChanges.length > 0) {
				// Sync positions to server
				const updates = positionChanges
					.map((change) => {
						if (change.position) {
							const node = nodes.find((n) => n.id === change.id);
							if (node) {
								return {
									id: node.data.dbId,
									positionX: change.position.x,
									positionY: change.position.y,
								};
							}
						}
						return null;
					})
					.filter(Boolean);

				if (updates.length > 0 && slug) {
					fetch(`/api/boards/${slug}/comments/batch`, {
						method: "PATCH",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ updates }),
					}).catch(console.error);
				}
			}
		},
		[onNodesChange, nodes, slug],
	);

	// Handle edge changes
	const handleEdgesChange = useCallback(
		(changes: EdgeChange[]) => {
			onEdgesChange(changes);
		},
		[onEdgesChange],
	);

	// Handle selection
	const handleSelectionChange: OnSelectionChangeFunc = useCallback(
		({ nodes: selectedNodes }) => {
			setSelectedNodes(selectedNodes.map((n) => n.id));
		},
		[setSelectedNodes],
	);

	// Handle new edge connections
	const handleConnect = useCallback(
		(connection: Connection) => {
			if (!connection.source || !connection.target) return;

			// Only allow connections between comment nodes
			const sourceNode = nodes.find((n) => n.id === connection.source);
			const targetNode = nodes.find((n) => n.id === connection.target);
			if (!sourceNode || !targetNode) return;
			if (sourceNode.type !== "comment" || targetNode.type !== "comment")
				return;

			// Create new edge
			const newEdge = {
				id: nanoid(),
				source: connection.source,
				target: connection.target,
				type: "reply",
			};

			setEdges(addEdge(newEdge, edges as (typeof newEdge)[]));

			// Persist to server
			if (slug && sourceNode.data.dbId && targetNode.data.dbId) {
				fetch(`/api/boards/${slug}/edges`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						sourceCommentId: sourceNode.data.commentId,
						targetCommentId: targetNode.data.commentId,
					}),
				}).catch(console.error);
			}
		},
		[nodes, edges, setEdges, slug],
	);

	// Create a new group
	const handleCreateGroup = useCallback(() => {
		const newGroup = {
			id: nanoid(),
			type: "group" as const,
			position: { x: 100, y: 100 },
			style: { width: 400, height: 300 },
			data: {
				dbId: "",
				label: "New Group",
				color: "var(--primary)",
			},
			zIndex: -1,
		};

		addGroup(newGroup);

		// Create group on server
		if (slug) {
			fetch(`/api/boards/${slug}/groups`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					label: newGroup.data.label,
					positionX: newGroup.position.x,
					positionY: newGroup.position.y,
					width: 400,
					height: 300,
					color: newGroup.data.color,
				}),
			})
				.then((res) => res.json())
				.then((data) => {
					// Update node with server ID
					useBoardStore.getState().updateGroup(newGroup.id, { dbId: data.id });
				})
				.catch(console.error);
		}
	}, [slug, addGroup]);

	// Delete selected nodes
	const handleDeleteSelected = useCallback(() => {
		const { selectedNodes, nodes, removeNode } = useBoardStore.getState();

		for (const nodeId of selectedNodes) {
			const node = nodes.find((n) => n.id === nodeId);
			if (!node) continue;

			removeNode(nodeId);

			// Delete from server
			if (slug && node.data.dbId) {
				const endpoint =
					node.type === "group"
						? `/api/boards/${slug}/groups/${node.data.dbId}`
						: `/api/boards/${slug}/comments/${node.data.dbId}`;

				fetch(endpoint, { method: "DELETE" }).catch(console.error);
			}
		}
	}, [slug]);

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-screen bg-background">
				<div className="text-center">
					<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
					<p className="text-muted-foreground">Loading board...</p>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex items-center justify-center h-screen bg-background">
				<div className="text-center">
					<p className="text-destructive text-lg mb-2">Error</p>
					<p className="text-muted-foreground">{error}</p>
				</div>
			</div>
		);
	}

	return (
		<div className="w-full h-screen" onContextMenu={handleContextMenu}>
			<ReactFlow
				nodes={nodes}
				edges={edges}
				onNodesChange={handleNodesChange}
				onEdgesChange={handleEdgesChange}
				onSelectionChange={handleSelectionChange}
				onConnect={handleConnect}
				nodeTypes={nodeTypes}
				edgeTypes={edgeTypes}
				defaultEdgeOptions={defaultEdgeOptions}
				selectionKeyCode="Shift"
				multiSelectionKeyCode="Shift"
				fitView
				fitViewOptions={{ padding: 0.2 }}
				minZoom={0.1}
				maxZoom={2}
				proOptions={{ hideAttribution: true }}
				className="bg-background"
				onPaneClick={handleCloseContextMenu}
			>
				<Background
					variant={BackgroundVariant.Dots}
					gap={50}
					color="var(--foreground)"
					lineWidth={0.05}
				/>

				<MiniMap
					className="bg-card! border-border!"
					nodeColor={(node) => {
						if (node.type === "group")
							return (node.data as GroupNodeData).color || "#374151";
						return "hsl(var(--primary))";
					}}
					maskColor="hsl(var(--background) / 0.8)"
				/>
				<BoardToolbar
					onCreateGroup={handleCreateGroup}
					onDeleteSelected={handleDeleteSelected}
				/>
			</ReactFlow>

			{/* Context Menu */}
			{contextMenu && (
				<ContextMenu
					x={contextMenu.x}
					y={contextMenu.y}
					nodeId={contextMenu.nodeId}
					onClose={handleCloseContextMenu}
					onCreateGroup={handleCreateGroup}
					onDeleteSelected={handleDeleteSelected}
					slug={slug}
				/>
			)}

			{/* Board title overlay */}
			{board && (
				<div className="absolute top-4 right-4 z-10 bg-card/90 backdrop-blur rounded-lg p-4 shadow-lg border border-border max-w-sm">
					<h1 className="font-semibold text-lg truncate">{board.title}</h1>
					{board.videoUrl && (
						<a
							href={board.videoUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="text-sm text-primary hover:underline truncate block"
						>
							View original video
						</a>
					)}
					<p className="text-xs text-muted-foreground mt-1">
						{nodes.filter((n) => n.type === "comment").length} comments
					</p>
				</div>
			)}
		</div>
	);
}
