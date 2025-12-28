import type { Edge, EdgeChange, Node, NodeChange } from "@xyflow/react";
import { applyEdgeChanges, applyNodeChanges } from "@xyflow/react";
import { temporal } from "zundo";
import { create } from "zustand";

// Custom node data types - with index signature for React Flow v12 compatibility
export interface CommentNodeData {
	[key: string]: unknown;
	commentId: string;
	username: string;
	nickname: string;
	comment: string;
	createTime: string;
	avatar: string;
	totalReply: number;
	parentCommentId?: string;
	isOrphanReply?: boolean;
	color?: string;
	dbId: string; // Database ID for API calls
}

export interface GroupNodeData {
	[key: string]: unknown;
	label: string;
	color: string;
	dbId: string;
}

export interface ShapeNodeData {
	[key: string]: unknown;
	shapeType: "rectangle" | "circle" | "diamond";
	color: string;
	borderColor: string;
	dbId: string;
}

export interface TextNodeData {
	[key: string]: unknown;
	text: string;
	fontSize: number;
	fontWeight: "normal" | "bold";
	color: string;
	dbId: string;
}

export type CommentNode = Node<CommentNodeData, "comment">;
export type GroupNode = Node<GroupNodeData, "group">;
export type ShapeNode = Node<ShapeNodeData, "shape">;
export type TextNode = Node<TextNodeData, "text">;
export type BoardNode = CommentNode | GroupNode | ShapeNode | TextNode;

// Interaction modes
export type InteractionMode = "select" | "pan" | "shape" | "text";

export interface BoardData {
	id: string;
	publicSlug: string;
	title: string;
	videoUrl?: string;
	videoCaption?: string;
}

interface BoardState {
	// Board metadata
	board: BoardData | null;
	isLoading: boolean;
	error: string | null;

	// React Flow state
	nodes: BoardNode[];
	edges: Edge[];
	selectedNodes: string[];

	// Interaction mode
	interactionMode: InteractionMode;
	pendingShapeType: "rectangle" | "circle" | "diamond" | null;

	// Actions
	setBoard: (board: BoardData | null) => void;
	setLoading: (loading: boolean) => void;
	setError: (error: string | null) => void;

	// Interaction mode
	setInteractionMode: (mode: InteractionMode) => void;
	setPendingShapeType: (
		type: "rectangle" | "circle" | "diamond" | null,
	) => void;

	// Node/Edge management
	setNodes: (nodes: BoardNode[]) => void;
	setEdges: (edges: Edge[]) => void;
	onNodesChange: (changes: NodeChange<BoardNode>[]) => void;
	onEdgesChange: (changes: EdgeChange[]) => void;

	// Selection
	setSelectedNodes: (ids: string[]) => void;
	clearSelection: () => void;

	// Node operations
	updateNodePosition: (
		nodeId: string,
		position: { x: number; y: number },
	) => void;
	updateNodeData: (nodeId: string, data: Partial<CommentNodeData>) => void;
	removeNode: (nodeId: string) => void;

	// Group operations
	addGroup: (group: GroupNode) => void;
	updateGroup: (groupId: string, data: Partial<GroupNodeData>) => void;
	removeGroup: (groupId: string) => void;

	// Batch operations for undo/redo
	batchUpdatePositions: (
		updates: Array<{ id: string; position: { x: number; y: number } }>,
	) => void;

	// Reset
	reset: () => void;
}

const initialState = {
	board: null,
	isLoading: false,
	error: null,
	nodes: [],
	edges: [],
	selectedNodes: [],
	interactionMode: "select" as InteractionMode,
	pendingShapeType: null as "rectangle" | "circle" | "diamond" | null,
};

export const useBoardStore = create<BoardState>()(
	temporal(
		(set, get) => ({
			...initialState,

			setBoard: (board) => set({ board }),
			setLoading: (isLoading) => set({ isLoading }),
			setError: (error) => set({ error }),

			setInteractionMode: (mode) => set({ interactionMode: mode }),
			setPendingShapeType: (type) => set({ pendingShapeType: type }),

			setNodes: (nodes) => set({ nodes }),
			setEdges: (edges) => set({ edges }),

			onNodesChange: (changes) => {
				set({
					nodes: applyNodeChanges(changes, get().nodes),
				});
			},

			onEdgesChange: (changes) => {
				set({
					edges: applyEdgeChanges(changes, get().edges),
				});
			},

			setSelectedNodes: (ids) => set({ selectedNodes: ids }),
			clearSelection: () => set({ selectedNodes: [] }),

			updateNodePosition: (nodeId, position) => {
				set({
					nodes: get().nodes.map((node) =>
						node.id === nodeId ? { ...node, position } : node,
					),
				});
			},

			updateNodeData: (nodeId, data) => {
				set({
					nodes: get().nodes.map((node) =>
						node.id === nodeId
							? { ...node, data: { ...node.data, ...data } }
							: node,
					) as BoardNode[],
				});
			},

			removeNode: (nodeId) => {
				set({
					nodes: get().nodes.filter((node) => node.id !== nodeId),
					edges: get().edges.filter(
						(edge) => edge.source !== nodeId && edge.target !== nodeId,
					),
				});
			},

			addGroup: (group) => {
				set({
					nodes: [...get().nodes, group],
				});
			},

			updateGroup: (groupId, data) => {
				set({
					nodes: get().nodes.map((node) =>
						node.id === groupId && node.type === "group"
							? { ...node, data: { ...node.data, ...data } }
							: node,
					) as BoardNode[],
				});
			},

			removeGroup: (groupId) => {
				set({
					nodes: get().nodes.filter((node) => node.id !== groupId),
				});
			},

			batchUpdatePositions: (updates) => {
				const positionMap = new Map(updates.map((u) => [u.id, u.position]));
				set({
					nodes: get().nodes.map((node) => {
						const newPosition = positionMap.get(node.id);
						return newPosition ? { ...node, position: newPosition } : node;
					}),
				});
			},

			reset: () => set(initialState),
		}),
		{
			// Undo/redo configuration
			limit: 50, // Keep last 50 states
			partialize: (state) => ({
				nodes: state.nodes,
				edges: state.edges,
			}),
		},
	),
);

// Helper hook to access undo/redo
export const useBoardHistory = () => {
	const { undo, redo, pastStates, futureStates } =
		useBoardStore.temporal.getState();
	return {
		undo,
		redo,
		canUndo: pastStates.length > 0,
		canRedo: futureStates.length > 0,
	};
};
