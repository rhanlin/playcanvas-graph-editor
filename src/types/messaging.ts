export type GraphNodeType = 'entity' | 'script'

export interface GraphNodePayload {
  id: string
  nodeType: GraphNodeType
  label: string
  position: { x: number; y: number }
  scriptName?: string
  scriptAttributes?: Record<string, unknown>
}

export interface GraphEdgePayload {
  id: string
  source: string
  target: string
}

export interface GraphDataPayload {
  entityName: string
  nodes: GraphNodePayload[]
  edges: GraphEdgePayload[]
}

export interface GraphResponse {
  success: boolean
  error?: string
  data?: GraphDataPayload
}

export type RuntimeMessage =
  | { type: 'GRAPH_REQUEST_DATA' }
  | { type: 'GRAPH_RESPONSE_DATA'; payload: GraphDataPayload }
  | { type: 'GRAPH_ERROR'; error: string }

