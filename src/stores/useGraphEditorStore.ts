import { create } from "zustand";
import type { Edge, Node, OnNodesChange, OnEdgesChange } from "reactflow";
import { applyNodeChanges, applyEdgeChanges } from "reactflow";

import type { GraphDataPayload, GraphNodePayload } from "@/types/messaging";

interface GraphEditorState {
  nodes: Node[];
  edges: Edge[];
  entityName: string | null;
  isLoading: boolean;
  error: string | null;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  setGraphData: (payload: GraphDataPayload) => void;
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  setLoading: (value: boolean) => void;
  setError: (message: string | null) => void;
  reset: () => void;
}

const mapNode = (node: GraphNodePayload): Node => {
  return {
    id: node.id,
    type: node.nodeType,
    position: node.position,
    data: {
      label: node.label,
      scriptName: node.scriptName,
      scriptAttributes: node.scriptAttributes,
    },
  };
};

const mapEdge = (edge: GraphDataPayload["edges"][number]): Edge => ({
  id: edge.id,
  source: edge.source,
  target: edge.target,
  type: "smoothstep",
  animated: true,
});

export const useGraphEditorStore = create<GraphEditorState>((set, get) => ({
  nodes: [],
  edges: [],
  entityName: null,
  isLoading: true,
  error: null,
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
  setGraphData: (payload) =>
    set({
      entityName: payload.entityName,
      nodes: payload.nodes.map(mapNode),
      edges: payload.edges.map(mapEdge),
      isLoading: false,
      error: null,
    }),
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  setLoading: (value) =>
    set((state) => ({
      isLoading: value,
      error: value ? null : state.error,
    })),
  setError: (message) =>
    set({
      error: message,
      isLoading: false,
    }),
  reset: () =>
    set({
      nodes: [],
      edges: [],
      entityName: null,
      isLoading: true,
      error: null,
    }),
}));
