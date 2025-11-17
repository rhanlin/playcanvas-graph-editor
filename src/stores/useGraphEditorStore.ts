import { create } from 'zustand'
import type { Edge, Node } from 'reactflow'

import type { GraphDataPayload, GraphNodePayload } from '@/types/messaging'

interface GraphEditorState {
  nodes: Node[]
  edges: Edge[]
  entityName: string | null
  isLoading: boolean
  error: string | null
  setGraphData: (payload: GraphDataPayload) => void
  setNodesDirect: (nodes: Node[]) => void
  setEdgesDirect: (edges: Edge[]) => void
  setLoading: (value: boolean) => void
  setError: (message: string | null) => void
  reset: () => void
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
  }
}

const mapEdge = (edge: GraphDataPayload['edges'][number]): Edge => ({
  id: edge.id,
  source: edge.source,
  target: edge.target,
  type: 'smoothstep',
  animated: true,
})

export const useGraphEditorStore = create<GraphEditorState>((set) => ({
  nodes: [],
  edges: [],
  entityName: null,
  isLoading: true,
  error: null,
  setGraphData: (payload) =>
    set({
      entityName: payload.entityName,
      nodes: payload.nodes.map(mapNode),
      edges: payload.edges.map(mapEdge),
      isLoading: false,
      error: null,
    }),
  setNodesDirect: (nodes) => set({ nodes }),
  setEdgesDirect: (edges) => set({ edges }),
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
}))

