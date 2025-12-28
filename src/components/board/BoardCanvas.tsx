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

	// Create a new group (optionally grouping selected nodes)
	const handleCreateGroup = useCallback(
		(groupSelectedNodes = false) => {
			const currentNodes = useBoardStore.getState().nodes;
			const currentSelectedNodes = useBoardStore.getState().selectedNodes;

			// Default position and size
			let position = { x: 100, y: 100 };
			let width = 400;
			let height = 300;
			const padding = 40;

			// Get the selected comment nodes to add to the group
			const selectedCommentNodes = groupSelectedNodes
				? currentNodes.filter(
						(n) => currentSelectedNodes.includes(n.id) && n.type === "comment",
					)
				: [];

			// If grouping selected nodes, calculate bounding box
			if (selectedCommentNodes.length > 0) {
				const nodeWidth = 280; // CommentNode width
				const nodeHeight = 160; // Approximate CommentNode height

				const minX = Math.min(...selectedCommentNodes.map((n) => n.position.x));
				const minY = Math.min(...selectedCommentNodes.map((n) => n.position.y));
				const maxX = Math.max(
					...selectedCommentNodes.map((n) => n.position.x + nodeWidth),
				);
				const maxY = Math.max(
					...selectedCommentNodes.map((n) => n.position.y + nodeHeight),
				);

				position = {
					x: minX - padding,
					y: minY - padding - 20, // Extra space for group header
				};
				width = maxX - minX + padding * 2;
				height = maxY - minY + padding * 2 + 20; // Extra space for group header
			}

			const groupId = nanoid();
			const newGroup: BoardNode = {
				id: groupId,
				type: "group",
				position,
				style: { width, height },
				data: {
					dbId: "",
					label: "New Group",
					color: "#6366f1", // Default indigo color
				},
				zIndex: -1,
			};

			// Optimistic update: Add group and move children immediately
			const updatedNodes = [...currentNodes, newGroup];

			if (selectedCommentNodes.length > 0) {
				// Update nodes to be children of the new group
				const finalNodes = updatedNodes.map((n) => {
					if (
						selectedCommentNodes.some((s) => s.id === n.id) &&
						n.type === "comment"
					) {
						// Calculate relative position within the group
						const relativeX = n.position.x - position.x;
						const relativeY = n.position.y - position.y;

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
				}) as BoardNode[];

				setNodes(finalNodes);
			} else {
				setNodes(updatedNodes);
			}

			// Create group on server
			if (slug) {
				fetch(`/api/boards/${slug}/groups`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						label: newGroup.data.label,
						positionX: position.x,
						positionY: position.y,
						width,
						height,
						color: newGroup.data.color,
					}),
				})
					.then((res) => res.json())
					.then((data) => {
						// Update node with server ID
						useBoardStore.getState().updateGroup(groupId, { dbId: data.id });

						// If grouping selected nodes, persist the relationship to server
						if (selectedCommentNodes.length > 0) {
							for (const commentNode of selectedCommentNodes) {
								const relativeX = commentNode.position.x - position.x;
								const relativeY = commentNode.position.y - position.y;

								fetch(`/api/boards/${slug}/comments/${commentNode.data.dbId}`, {
									method: "PATCH",
									headers: { "Content-Type": "application/json" },
									body: JSON.stringify({
										positionX: Math.max(20, relativeX),
										positionY: Math.max(40, relativeY),
										groupId: data.id,
									}),
								}).catch(console.error);
							}
						}
					})
					.catch(console.error);
			}
		},
		[slug, setNodes],
	);

	// Delete selected nodes
	const handleDeleteSelected = useCallback(() => {
		const { selectedNodes, nodes, setNodes } = useBoardStore.getState();

		// Identify groups to be deleted
		const groupsToDelete = nodes.filter(
			(n) => selectedNodes.includes(n.id) && n.type === "group",
		);
		const groupIdsToDelete = groupsToDelete.map((g) => g.id);

		// Handle orphan rescue: if a group is deleted, detach its children
		let nextNodes = nodes;

		if (groupIdsToDelete.length > 0) {
			nextNodes = nextNodes.map((n) => {
				if (n.parentId && groupIdsToDelete.includes(n.parentId)) {
					// Find parent group to calculate absolute position
					const parentGroup = groupsToDelete.find((g) => g.id === n.parentId);
					const parentX = parentGroup?.position.x || 0;
					const parentY = parentGroup?.position.y || 0;

					return {
						...n,
						parentId: undefined,
						extent: undefined,
						position: {
							x: parentX + n.position.x,
							y: parentY + n.position.y,
						},
					};
				}
				return n;
			});

			// Sync detached children to server
			const detachedNodes = nextNodes.filter((n) => {
				const oldNode = nodes.find((old) => old.id === n.id);
				return (
					n.parentId === undefined &&
					oldNode?.parentId &&
					groupIdsToDelete.includes(oldNode.parentId)
				);
			});

			detachedNodes.forEach((node) => {
				if (slug && node.data.dbId) {
					fetch(`/api/boards/${slug}/comments/${node.data.dbId}`, {
						method: "PATCH",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							groupId: null,
							positionX: node.position.x,
							positionY: node.position.y,
						}),
					}).catch(console.error);
				}
			});
		}

		// Remove selected nodes
		nextNodes = nextNodes.filter((n) => !selectedNodes.includes(n.id));
		setNodes(nextNodes);

		// Delete from server
		for (const nodeId of selectedNodes) {
			const node = nodes.find((n) => n.id === nodeId);
			if (!node || !slug || !node.data.dbId) continue;

			const endpoint =
				node.type === "group"
					? `/api/boards/${slug}/groups/${node.data.dbId}`
					: `/api/boards/${slug}/comments/${node.data.dbId}`;

			fetch(endpoint, { method: "DELETE" }).catch(console.error);
		}
	}, [slug, setNodes]);

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
					onCreateGroup={() => handleCreateGroup(false)}
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
					onCreateGroup={() => handleCreateGroup(false)}
					onGroupSelected={() => handleCreateGroup(true)}
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
