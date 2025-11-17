import { create } from "zustand";
import type {
  Edge,
  Node,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  Connection,
  EdgeChange,
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
  onEdgesChange: (changes: EdgeChange[]) => {
    set({
      edges: applyEdgeChanges(changes, get().edges),
    });
  },
  onConnect: (connection: Connection) => {
    const { source, sourceHandle, target } = connection;
    if (!source || !sourceHandle || !target) return;

    const [entityGuid, scriptName] = source.split("-");
    if (!entityGuid || !scriptName) return;

    set((state) => ({
      edges: addEdge(
        { ...connection, type: "smoothstep", animated: true },
        state.edges
      ),
    }));

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
  setGraphData: (payload) => {
    const { entities } = payload;
    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];

    const columns = Math.ceil(Math.sqrt(Object.keys(entities).length) || 1);
    let col = 0;
    let row = 0;

    Object.values(entities).forEach((entity) => {
      newNodes.push({
        id: entity.guid,
        type: "entity",
        position: {
          x: col * (ENTITY_NODE_WIDTH + HORIZONTAL_SPACING),
          y: row * (SCRIPT_VERTICAL_OFFSET * 4),
        },
        data: { label: entity.name },
        style: { width: ENTITY_NODE_WIDTH },
      });

      col++;
      if (col >= columns) {
        col = 0;
        row++;
      }

      const scriptComponent = entity.components?.script;
      if (scriptComponent?.scripts) {
        let scriptIndex = 0;
        Object.entries(scriptComponent.scripts).forEach(
          ([scriptName, scriptData]) => {
            const scriptNodeId = `${entity.guid}-${scriptName}`;
            newNodes.push({
              id: scriptNodeId,
              type: "script",
              position: { x: 10, y: SCRIPT_VERTICAL_OFFSET + scriptIndex * 80 },
              parentNode: entity.guid,
              data: {
                label: scriptName,
                attributes: scriptData.attributes || {},
              },
              style: { width: SCRIPT_NODE_WIDTH },
            });
            scriptIndex++;

            if (scriptData.attributes) {
              Object.entries(scriptData.attributes).forEach(
                ([attrName, attrData]) => {
                  if (attrData.type === "entity" && attrData.value) {
                    newEdges.push({
                      id: `${scriptNodeId}-${attrName}-${attrData.value}`,
                      source: scriptNodeId,
                      sourceHandle: attrName,
                      target: attrData.value,
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
