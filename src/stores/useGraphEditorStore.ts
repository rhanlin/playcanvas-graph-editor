import { create } from "zustand";
import type {
  Edge,
  Node,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  Connection,
} from "reactflow";
import { applyNodeChanges, applyEdgeChanges, addEdge } from "reactflow";

import type { SceneGraphPayload } from "@/types/messaging";
import { sendRuntimeMessage } from "@/utils/runtime";

interface GraphEditorState {
  nodes: Node[];
  edges: Edge[];
  selectedEntityName: string | null;
  isLoading: boolean;
  error: string | null;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  onEdgesDelete: (edges: Edge[]) => void;
  setGraphData: (payload: SceneGraphPayload) => void;
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  setLoading: (value: boolean) => void;
  setError: (message: string | null) => void;
  reset: () => void;
}

const ENTITY_NODE_WIDTH = 250;
const SCRIPT_NODE_WIDTH = 200;
const HORIZONTAL_SPACING = 100;
const VERTICAL_SPACING = 50;
const SCRIPT_VERTICAL_OFFSET = 60;

export const useGraphEditorStore = create<GraphEditorState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedEntityName: null,
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
  onConnect: (connection: Connection) => {
    const { source, sourceHandle, target } = connection;

    // Guard against incomplete connections
    if (!source || !sourceHandle || !target) {
      return;
    }

    // The source ID is in the format "entityGuid-scriptName"
    const [entityGuid, scriptName] = source.split("-");
    if (!entityGuid || !scriptName) {
      console.error("Invalid source node ID on connection:", source);
      return;
    }

    // Optimistically update the UI
    set({
      edges: addEdge(connection, get().edges),
    });

    // Send the update to the editor
    sendRuntimeMessage({
      type: "GRAPH_UPDATE_ATTRIBUTE",
      payload: {
        entityGuid,
        scriptName,
        attributeName: sourceHandle,
        targetEntityGuid: target,
      },
    });
  },
  onEdgesDelete: (edgesToDelete: Edge[]) => {
    // For now, we only handle single edge deletion
    const edge = edgesToDelete[0];
    if (!edge) return;

    const { source, sourceHandle } = edge;
    const [entityGuid, scriptName] = source.split("-");

    if (!entityGuid || !scriptName || !sourceHandle) {
      console.error("Invalid edge for deletion:", edge);
      return;
    }

    sendRuntimeMessage({
      type: "GRAPH_UPDATE_ATTRIBUTE",
      payload: {
        entityGuid,
        scriptName,
        attributeName: sourceHandle,
        targetEntityGuid: null, // Setting to null signifies deletion
      },
    });
  },
  setGraphData: (payload) => {
    const { entities } = payload;
    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];

    // Basic grid layout - can be replaced with a proper algorithm later
    const columns = Math.ceil(Math.sqrt(Object.keys(entities).length));
    let col = 0;
    let row = 0;

    Object.values(entities).forEach((entity) => {
      // Create Entity Node
      newNodes.push({
        id: entity.guid,
        type: "entity",
        position: {
          x: col * (ENTITY_NODE_WIDTH + HORIZONTAL_SPACING),
          y: row * (SCRIPT_VERTICAL_OFFSET * 4), // Approximate height for layout
        },
        data: {
          label: entity.name,
        },
        style: {
          width: ENTITY_NODE_WIDTH,
        },
      });

      col++;
      if (col >= columns) {
        col = 0;
        row++;
      }

      // Create Script Nodes and Edges for the current entity
      const scriptComponent = entity.components?.script;
      if (scriptComponent?.scripts) {
        let scriptIndex = 0;
        Object.entries(scriptComponent.scripts).forEach(
          ([scriptName, scriptData]) => {
            const scriptNodeId = `${entity.guid}-${scriptName}`;
            newNodes.push({
              id: scriptNodeId,
              type: "script",
              position: {
                x: 10,
                y: SCRIPT_VERTICAL_OFFSET + scriptIndex * 80,
              },
              parentNode: entity.guid,
              extent: "parent",
              data: {
                label: scriptName,
                attributes: scriptData.attributes || {},
              },
              style: {
                width: SCRIPT_NODE_WIDTH,
              },
            });
            scriptIndex++;

            // Create edges for entity-type attributes
            if (scriptData.attributes) {
              Object.entries(scriptData.attributes).forEach(
                ([attrName, attrData]) => {
                  // NEW: Precisely check for the 'entity' type
                  if (attrData.type === "entity" && attrData.value) {
                    newEdges.push({
                      id: `${scriptNodeId}-${attrName}-${attrData.value}`,
                      source: scriptNodeId,
                      sourceHandle: attrName, // Connect from the specific attribute
                      target: attrData.value, // Connect to the target entity node
                      type: "smoothstep",
                      animated: true,
                    });
                  }
                }
              );
            }
          }
        );
      }
    });

    set({
      selectedEntityName: payload.selectedEntityName,
      nodes: newNodes,
      edges: newEdges,
      isLoading: false,
      error: null,
    });
  },
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
      selectedEntityName: null,
      isLoading: true,
      error: null,
    }),
}));
