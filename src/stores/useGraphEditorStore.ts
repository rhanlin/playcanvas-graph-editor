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

import type { EntityPayload, SceneGraphPayload } from "@/types/messaging";
import { buildGraphLayout, type PositionOverride } from "@/utils/graphLayout";
import { sendRuntimeMessage } from "@/utils/runtime";

interface GraphEditorState {
  nodes: Node[];
  edges: Edge[];
  entities: Record<string, EntityPayload>;
  rootGuid: string | null;
  projectId: number | string | null;
  sceneId: number | string | null;
  manualPositions: Record<string, PositionOverride>;
  collapsedState: Record<string, boolean>;
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
  toggleEntityCollapse: (guid: string) => void;
  upsertEntity: (entity: EntityPayload) => void;
  removeEntity: (guid: string) => void;
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
const LAYOUT_STORAGE_PREFIX = "pc-ge-layout";

interface LayoutStorage {
  manualPositions: Record<string, PositionOverride>;
  collapsedState: Record<string, boolean>;
}

const getLayoutStorageKey = (
  projectId: number | string | null,
  sceneId: number | string | null
) => {
  const projectPart = projectId ?? "unknownProject";
  const scenePart = sceneId ?? "unknownScene";
  return `${LAYOUT_STORAGE_PREFIX}-${projectPart}-${scenePart}`;
};

const loadLayoutState = (
  projectId: number | string | null,
  sceneId: number | string | null
): LayoutStorage => {
  if (typeof window === "undefined" || projectId == null || sceneId == null) {
    return { manualPositions: {}, collapsedState: {} };
  }
  try {
    const raw = window.localStorage.getItem(
      getLayoutStorageKey(projectId, sceneId)
    );
    if (!raw) {
      return { manualPositions: {}, collapsedState: {} };
    }
    const parsed = JSON.parse(raw);
    return {
      manualPositions: parsed.manualPositions || {},
      collapsedState: parsed.collapsedState || {},
    };
  } catch {
    return { manualPositions: {}, collapsedState: {} };
  }
};

const buildLayoutFromState = (
  rootGuid: string | null,
  entities: Record<string, EntityPayload>,
  selectedEntityName: string | null,
  manualPositions: Record<string, PositionOverride>,
  collapsedState: Record<string, boolean>,
  projectId: number | string | null,
  sceneId: number | string | null
) => {
  if (!rootGuid) {
    return { nodes: [], edges: [] };
  }

  return buildGraphLayout({
    payload: {
      rootGuid,
      entities,
      selectedEntityName,
      projectId,
      sceneId,
    },
    manualPositions,
    collapsedState,
  });
};

const persistLayoutState = (
  projectId: number | string | null,
  sceneId: number | string | null,
  manualPositions: Record<string, PositionOverride>,
  collapsedState: Record<string, boolean>
) => {
  if (typeof window === "undefined" || projectId == null || sceneId == null) {
    return;
  }
  try {
    window.localStorage.setItem(
      getLayoutStorageKey(projectId, sceneId),
      JSON.stringify({ manualPositions, collapsedState })
    );
  } catch {
    // ignore write errors
  }
};

export const useGraphEditorStore = create<GraphEditorState>((set, get) => ({
  nodes: [],
  edges: [],
  entities: {},
  rootGuid: null,
  projectId: null,
  sceneId: null,
  manualPositions: {},
  collapsedState: {},
  selectedEntityGuid: null,
  selectedScriptNodeId: null,
  selectedEntityName: null,
  isLoading: true,
  error: null,
  onNodesChange: (changes) => {
    const state = get();
    const updatedNodes = applyNodeChanges(changes, state.nodes);

    let newlySelectedScriptNodeId: string | null = null;
    let newlySelectedEntityGuid: string | null = null;
    let shouldClearSelection = false;

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
        const node = updatedNodes.find((n) => n.id === change.id);
        if (
          (node?.type === "script" && state.selectedScriptNodeId === node.id) ||
          (node?.type === "entity" && state.selectedEntityGuid === node.id)
        ) {
          shouldClearSelection = true;
        }
      }
    }

    let currentScriptNodeId: string | null;
    let currentEntityGuid: string | null;

    if (
      shouldClearSelection &&
      newlySelectedScriptNodeId === null &&
      newlySelectedEntityGuid === null
    ) {
      currentScriptNodeId = null;
      currentEntityGuid = null;
    } else if (
      newlySelectedScriptNodeId !== null ||
      newlySelectedEntityGuid !== null
    ) {
      currentScriptNodeId = newlySelectedScriptNodeId;
      currentEntityGuid = newlySelectedEntityGuid;
    } else {
      currentScriptNodeId = state.selectedScriptNodeId;
      currentEntityGuid = state.selectedEntityGuid;
    }

    const selectionChanged =
      currentEntityGuid !== state.selectedEntityGuid ||
      currentScriptNodeId !== state.selectedScriptNodeId;

    const manualUpdates: Record<string, PositionOverride> = {};
    changes.forEach((change) => {
      if (change.type === "position" && !change.dragging) {
        const movedNode = updatedNodes.find((node) => node.id === change.id);
        if (movedNode) {
          manualUpdates[change.id] = {
            x: movedNode.position.x,
            y: movedNode.position.y,
            parentId: movedNode.parentNode ?? null,
          };
        }
      }
    });

    const manualUpdateKeys = Object.keys(manualUpdates);
    const manualPositions =
      manualUpdateKeys.length > 0
        ? { ...state.manualPositions, ...manualUpdates }
        : state.manualPositions;

    let baseNodes: Node[] = updatedNodes;
    let baseEdges: Edge[] = state.edges;

    if (manualUpdateKeys.length > 0) {
      const layoutResult = buildLayoutFromState(
        state.rootGuid,
        state.entities,
        state.selectedEntityName,
        manualPositions,
        state.collapsedState,
        state.projectId,
        state.sceneId
      );
      baseNodes = layoutResult.nodes;
      baseEdges = layoutResult.edges;
    }

    const decorateSelection = (nodesToDecorate: Node[]): Node[] => {
      return nodesToDecorate.map((node) => {
        let isSelected = false;
        if (currentScriptNodeId) {
          if (node.id === currentScriptNodeId && node.type === "script") {
            isSelected = true;
          } else if (
            currentEntityGuid &&
            node.id === currentEntityGuid &&
            node.type === "entity"
          ) {
            isSelected = true;
          }
        } else if (
          currentEntityGuid &&
          node.id === currentEntityGuid &&
          node.type === "entity"
        ) {
          isSelected = true;
        }

        if (node.selected === isSelected) {
          return node;
        }

        return { ...node, selected: isSelected };
      });
    };

    const decoratedNodes = decorateSelection(baseNodes);
    const selectedEntityNode = decoratedNodes.find(
      (n) => n.id === currentEntityGuid && n.type === "entity"
    );

    set({
      nodes: decoratedNodes,
      edges: baseEdges,
      selectedScriptNodeId: currentScriptNodeId,
      selectedEntityGuid: currentEntityGuid,
      selectedEntityName: selectedEntityNode?.data?.label ?? null,
      manualPositions,
    });

    if (
      manualUpdateKeys.length &&
      state.projectId != null &&
      state.sceneId != null
    ) {
      persistLayoutState(
        state.projectId,
        state.sceneId,
        manualPositions,
        state.collapsedState
      );
    }

    if (selectionChanged && currentEntityGuid) {
      sendRuntimeMessage({
        type: "GRAPH_SET_SELECTION",
        payload: { entityGuid: currentEntityGuid },
      }).catch(() => {
        // ignore errors when content script isn't ready
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
  toggleEntityCollapse: (guid) => {
    set((state) => {
      const collapsedState = {
        ...state.collapsedState,
        [guid]: !state.collapsedState[guid],
      };

      const { nodes, edges } = buildLayoutFromState(
        state.rootGuid,
        state.entities,
        state.selectedEntityName,
        state.manualPositions,
        collapsedState,
        state.projectId,
        state.sceneId
      );

      if (state.projectId != null && state.sceneId != null) {
        persistLayoutState(
          state.projectId,
          state.sceneId,
          state.manualPositions,
          collapsedState
        );
      }

      return { collapsedState, nodes, edges };
    });
  },
  upsertEntity: (entity) => {
    set((state) => {
      const entities = { ...state.entities, [entity.guid]: entity };

      const { nodes, edges } = buildLayoutFromState(
        state.rootGuid,
        entities,
        state.selectedEntityName,
        state.manualPositions,
        state.collapsedState,
        state.projectId,
        state.sceneId
      );

      return {
        entities,
        nodes,
        edges,
        isLoading: false,
        error: null,
      };
    });
  },
  removeEntity: (guid) => {
    if (!get().entities[guid]) {
      return;
    }

    set((state) => {
      const collectDescendants = (id: string, acc: Set<string>) => {
        if (acc.has(id)) return;
        acc.add(id);
        const entity = state.entities[id];
        if (!entity) return;
        entity.children.forEach((childId) => collectDescendants(childId, acc));
      };

      const toRemove = new Set<string>();
      collectDescendants(guid, toRemove);

      const entities = { ...state.entities };
      toRemove.forEach((id) => {
        delete entities[id];
      });

      const manualPositions = { ...state.manualPositions };
      Object.keys(manualPositions).forEach((key) => {
        if (toRemove.has(key)) {
          delete manualPositions[key];
          return;
        }
        for (const id of toRemove) {
          if (key.startsWith(`${id}-`)) {
            delete manualPositions[key];
            break;
          }
        }
      });

      const collapsedState = { ...state.collapsedState };
      toRemove.forEach((id) => {
        delete collapsedState[id];
      });

      const selectionRemoved = toRemove.has(state.selectedEntityGuid || "");
      const scriptSelectionRemoved =
        state.selectedScriptNodeId &&
        (toRemove.has(state.selectedScriptNodeId) ||
          Array.from(toRemove).some((id) =>
            state.selectedScriptNodeId!.startsWith(`${id}-`)
          ));

      const { nodes, edges } = buildLayoutFromState(
        state.rootGuid,
        entities,
        selectionRemoved ? null : state.selectedEntityName,
        manualPositions,
        collapsedState,
        state.projectId,
        state.sceneId
      );

      if (state.projectId != null && state.sceneId != null) {
        persistLayoutState(
          state.projectId,
          state.sceneId,
          manualPositions,
          collapsedState
        );
      }

      return {
        entities,
        nodes,
        edges,
        manualPositions,
        collapsedState,
        selectedEntityGuid: selectionRemoved ? null : state.selectedEntityGuid,
        selectedScriptNodeId: scriptSelectionRemoved
          ? null
          : state.selectedScriptNodeId,
        selectedEntityName: selectionRemoved ? null : state.selectedEntityName,
      };
    });
  },
  setGraphData: (payload) => {
    set((state) => {
      const incomingProjectId = payload.projectId ?? null;
      const incomingSceneId = payload.sceneId ?? null;
      const storageChanged =
        incomingProjectId !== state.projectId ||
        incomingSceneId !== state.sceneId;

      const layoutState = storageChanged
        ? loadLayoutState(incomingProjectId, incomingSceneId)
        : {
            manualPositions: state.manualPositions,
            collapsedState: state.collapsedState,
          };

      const { nodes, edges } = buildGraphLayout({
        payload,
        manualPositions: layoutState.manualPositions,
        collapsedState: layoutState.collapsedState,
        projectId: payload.projectId ?? null,
        sceneId: payload.rootGuid ?? null,
      });

      return {
        selectedEntityName: payload.selectedEntityName,
        entities: payload.entities,
        nodes,
        edges,
        isLoading: false,
        error: null,
        rootGuid: payload.rootGuid,
        projectId: incomingProjectId,
        sceneId: incomingSceneId,
        manualPositions: layoutState.manualPositions,
        collapsedState: layoutState.collapsedState,
      };
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
      entities: {},
      rootGuid: null,
      projectId: null,
      sceneId: null,
      manualPositions: {},
      collapsedState: {},
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
