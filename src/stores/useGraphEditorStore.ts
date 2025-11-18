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
  selectedEntityGuid: string | null;
  selectedScriptNodeId: string | null;
  selectedEntityName: string | null;
  isLoading: boolean;
  error: string | null;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  setGraphData: (payload: SceneGraphPayload) => void;
  setSelectedEntity: (
    guid: string | null,
    name?: string | null,
    scriptNodeId?: string | null
  ) => void;
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
  selectedEntityGuid: null,
  selectedScriptNodeId: null,
  selectedEntityName: null,
  isLoading: true,
  error: null,
  onNodesChange: (changes) => {
    const state = get();
    const updatedNodes = applyNodeChanges(changes, state.nodes);

    // Detect what was selected/deselected by checking the changes
    // React Flow may send multiple changes: first deselect all, then select new
    let newlySelectedScriptNodeId: string | null = null;
    let newlySelectedEntityGuid: string | null = null;
    let shouldClearSelection = false;

    // First pass: find what was selected
    for (const change of changes) {
      if (change.type === "select" && change.selected === true) {
        const node = updatedNodes.find((n) => n.id === change.id);
        if (node?.type === "script") {
          newlySelectedScriptNodeId = node.id;
          newlySelectedEntityGuid = node.parentNode as string | null;
        } else if (node?.type === "entity") {
          newlySelectedEntityGuid = node.id;
          newlySelectedScriptNodeId = null;
        }
      } else if (change.type === "select" && change.selected === false) {
        // Check if the currently selected node was deselected
        const node = updatedNodes.find((n) => n.id === change.id);
        if (
          (node?.type === "script" && state.selectedScriptNodeId === node.id) ||
          (node?.type === "entity" && state.selectedEntityGuid === node.id)
        ) {
          shouldClearSelection = true;
        }
      }
    }

    // Determine current selection state
    let currentScriptNodeId: string | null;
    let currentEntityGuid: string | null;

    if (
      shouldClearSelection &&
      newlySelectedScriptNodeId === null &&
      newlySelectedEntityGuid === null
    ) {
      // Everything was deselected and nothing new was selected
      currentScriptNodeId = null;
      currentEntityGuid = null;
    } else if (
      newlySelectedScriptNodeId !== null ||
      newlySelectedEntityGuid !== null
    ) {
      // New selection detected
      currentScriptNodeId = newlySelectedScriptNodeId;
      currentEntityGuid = newlySelectedEntityGuid;
    } else {
      // No change detected, keep existing state
      currentScriptNodeId = state.selectedScriptNodeId;
      currentEntityGuid = state.selectedEntityGuid;
    }

    // Apply our custom selection logic to all nodes
    const finalNodes = updatedNodes.map((node) => {
      // If we have a selected script node, maintain selection for both script and its parent entity
      if (
        currentScriptNodeId &&
        node.type === "script" &&
        node.id === currentScriptNodeId
      ) {
        return { ...node, selected: true };
      }
      if (currentScriptNodeId && node.type === "entity") {
        // Find the script node to get its parent
        const scriptNode = updatedNodes.find(
          (n) => n.id === currentScriptNodeId
        );
        if (scriptNode?.parentNode === node.id) {
          return { ...node, selected: true };
        }
      }
      // If we have a selected entity (but no script), only highlight that entity
      if (
        !currentScriptNodeId &&
        currentEntityGuid &&
        node.id === currentEntityGuid &&
        node.type === "entity"
      ) {
        return { ...node, selected: true };
      }
      // Clear selection for nodes that shouldn't be selected
      if (
        (!currentScriptNodeId || node.id !== currentScriptNodeId) &&
        (!currentEntityGuid || node.id !== currentEntityGuid)
      ) {
        return { ...node, selected: false };
      }
      // Otherwise, preserve React Flow's selection state
      return node;
    });

    // Always update state to ensure consistency
    const entityNode = updatedNodes.find(
      (n) => n.id === currentEntityGuid && n.type === "entity"
    );

    // Notify Editor if selection changed
    const selectionChanged =
      currentEntityGuid !== state.selectedEntityGuid ||
      currentScriptNodeId !== state.selectedScriptNodeId;

    set({
      nodes: finalNodes,
      selectedScriptNodeId: currentScriptNodeId,
      selectedEntityGuid: currentEntityGuid,
      selectedEntityName: entityNode?.data?.label ?? null,
    });

    // Notify the editor if selection changed (always select entity, even if script was clicked)
    if (selectionChanged && currentEntityGuid) {
      sendRuntimeMessage({
        type: "GRAPH_SET_SELECTION",
        payload: { entityGuid: currentEntityGuid },
      }).catch((err) => {
        // Silently ignore errors when content script is not ready
      });
    }
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
    }).catch((err) => {
      // Silently ignore errors when content script is not ready
      // This can happen during initialization
    });
  },
  setSelectedEntity: (guid, name, scriptNodeId) => {
    const state = get();
    const { nodes, selectedEntityGuid, selectedScriptNodeId } = state;
    const entityNode = nodes.find(
      (node) => node.id === guid && node.type === "entity"
    );

    const newScriptNodeId = scriptNodeId ?? null;

    // Check if state is already correct (to avoid unnecessary updates)
    const stateAlreadyCorrect =
      selectedEntityGuid === guid && selectedScriptNodeId === newScriptNodeId;

    // Only update nodes if state is not already correct
    // (onNodesChange may have already set the correct state)
    if (!stateAlreadyCorrect) {
      set({
        selectedEntityGuid: guid,
        selectedScriptNodeId: newScriptNodeId,
        selectedEntityName: name ?? (entityNode ? entityNode.data.label : null),
        nodes: nodes.map((node) => {
          // If a script node is selected, highlight both the script and its parent entity
          if (scriptNodeId) {
            return {
              ...node,
              selected:
                (node.id === guid && node.type === "entity") ||
                (node.id === scriptNodeId && node.type === "script"),
            };
          }
          // Otherwise, only highlight the entity
          return {
            ...node,
            selected: node.id === guid && node.type === "entity",
          };
        }),
      });
    } else {
      // Just update the name if it's different
      const newName = name ?? (entityNode ? entityNode.data.label : null);
      if (state.selectedEntityName !== newName) {
        set({ selectedEntityName: newName });
      }
    }

    // Always notify the editor if the selection was made from the extension UI
    // (onNodesChange may have already notified, but we do it again as a backup)
    if (guid) {
      sendRuntimeMessage({
        type: "GRAPH_SET_SELECTION",
        payload: { entityGuid: guid },
      }).catch((err) => {
        // Silently ignore errors when content script is not ready
        // This can happen during initialization
      });
    }
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
          ([scriptName, scriptDataRaw]) => {
            const scriptData = scriptDataRaw as {
              attributes?: Record<string, { type: string; value: any }>;
            };
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
                ([attrName, attrDataRaw]) => {
                  const attrData = attrDataRaw as { type: string; value: any };
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
      selectedEntityGuid: null,
      selectedScriptNodeId: null,
      selectedEntityName: null,
      isLoading: true,
      error: null,
    }),
}));

// Expose store to window for debugging (optional)
if (typeof window !== "undefined") {
  (window as any).__GraphEditorStore = useGraphEditorStore;
}
