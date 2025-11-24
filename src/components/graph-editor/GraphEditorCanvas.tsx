import React, { useCallback, useEffect, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  type Node,
} from "reactflow";
import "reactflow/dist/style.css";

import { useGraphEditorStore } from "@/stores/useGraphEditorStore";
import { EntityNode } from "./nodes/EntityNode";
import { ScriptNode } from "./nodes/ScriptNode";

const nodeTypes = {
  entity: EntityNode,
  script: ScriptNode,
};

const PREVIEW_DELAY_MS = 300; // Delay before showing preview

export function GraphEditorCanvas() {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    setSelectedEntity,
    clearScriptAttribute,
    setReparentPreview,
    reparentEntity,
    entities,
    rootGuid,
    pendingFocusGuid,
    clearPendingFocus,
  } = useGraphEditorStore();
  const reactFlowInstance = useReactFlow();
  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHoverTargetRef = useRef<string | null>(null);

  useEffect(() => {
    if (!pendingFocusGuid) {
      return;
    }
    const allNodes = reactFlowInstance.getNodes();
    const targetNode = allNodes.find((node) => node.id === pendingFocusGuid);
    console.log("[GraphFocus] pendingFocus effect", {
      pendingFocusGuid,
      nodesCount: allNodes.length,
      targetFound: !!targetNode,
    });
    if (targetNode) {
      reactFlowInstance.fitView({
        nodes: [targetNode],
        duration: 400,
        padding: 0.2,
      });
      console.log("[GraphFocus] fitView executed", {
        targetId: targetNode.id,
      });
    }
    clearPendingFocus();
  }, [pendingFocusGuid, reactFlowInstance, clearPendingFocus]);

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      // onNodesChange already handles selection state and notifies the editor
      // This is just a backup notification in case onNodesChange didn't catch it
      // (which shouldn't happen, but we keep it for safety)
      if (node.type === "entity") {
        setSelectedEntity(node.id, node.data.label, null);
      } else if (node.type === "script" && node.parentNode) {
        const parentEntity = nodes.find(
          (n) => n.id === node.parentNode && n.type === "entity"
        );
        setSelectedEntity(
          node.parentNode,
          parentEntity?.data?.label || null,
          node.id
        );
      }
    },
    [setSelectedEntity, nodes]
  );

  const checkIsDescendant = useCallback(
    (entityGuid: string, candidateGuid: string | null): boolean => {
      if (!entityGuid || !candidateGuid) {
        return false;
      }
      if (entityGuid === candidateGuid) {
        return true;
      }

      const rootEntity = entities[entityGuid];
      if (!rootEntity) {
        return false;
      }

      const stack = [...(rootEntity.children || [])];
      while (stack.length) {
        const currentGuid = stack.pop()!;
        if (currentGuid === candidateGuid) {
          return true;
        }
        const currentEntity = entities[currentGuid];
        if (currentEntity?.children?.length) {
          stack.push(...currentEntity.children);
        }
      }
      return false;
    },
    [entities]
  );

  const checkIsAncestor = useCallback(
    (draggingGuid: string, targetGuid: string | null): boolean => {
      if (!draggingGuid || !targetGuid || draggingGuid === targetGuid) {
        return false;
      }
      let currentParentId = entities[draggingGuid]?.parentId ?? null;
      while (currentParentId) {
        if (currentParentId === targetGuid) {
          return true;
        }
        currentParentId = entities[currentParentId]?.parentId ?? null;
      }
      return false;
    },
    [entities]
  );

  const onNodeDrag = useCallback(
    (_event: React.MouseEvent, node: Node | undefined) => {
      if (!node || node.type !== "entity") {
        return;
      }

      const draggingGuid = node.id;
      const store = useGraphEditorStore.getState();

      // Set dragging state on first drag
      if (store.draggingEntityGuid !== draggingGuid) {
        setReparentPreview(draggingGuid, null);
      }

      // Use DOM API to find the node under cursor (works correctly for nested nodes)
      // Temporarily hide the dragging node to detect nodes underneath
      const draggingNodeElement = document.querySelector(
        `.react-flow__node[data-id="${draggingGuid}"], .react-flow__node[id*="${draggingGuid}"]`
      ) as HTMLElement | null;
      const originalPointerEvents = draggingNodeElement?.style.pointerEvents;
      if (draggingNodeElement) {
        draggingNodeElement.style.pointerEvents = "none";
      }

      const elementAtPoint = document.elementFromPoint(
        _event.clientX,
        _event.clientY
      );
      let hoverTarget: Node | null = null;

      if (elementAtPoint) {
        // Find the React Flow node element by traversing up the DOM tree
        // React Flow nodes have class "react-flow__node" and data-id attribute
        const nodeElement = (elementAtPoint as HTMLElement).closest(
          ".react-flow__node"
        ) as HTMLElement | null;

        if (nodeElement) {
          // Try data-id first (React Flow v11+)
          let nodeId = nodeElement.getAttribute("data-id");

          // Fallback: try data-id from data attributes
          if (!nodeId) {
            nodeId = nodeElement.getAttribute("data-nodeid");
          }

          // Fallback: extract from id attribute (format: "react-flow__node-{id}")
          if (!nodeId) {
            const idAttr = nodeElement.getAttribute("id");
            if (idAttr && idAttr.startsWith("react-flow__node-")) {
              nodeId = idAttr.replace("react-flow__node-", "");
            }
          }

          if (nodeId && nodeId !== draggingGuid) {
            const allNodes = reactFlowInstance.getNodes();
            const foundNode = allNodes.find(
              (n) =>
                n.id === nodeId && n.type === "entity" && n.id !== draggingGuid
            );
            if (foundNode) {
              hoverTarget = foundNode;
            }
          }
        }
      }

      // Restore pointer events
      if (draggingNodeElement && originalPointerEvents !== undefined) {
        draggingNodeElement.style.pointerEvents = originalPointerEvents;
      } else if (draggingNodeElement) {
        draggingNodeElement.style.pointerEvents = "";
      }

      // Determine target: entity or root (null)
      const targetGuid = hoverTarget?.id || null;
      const isHoveringBlank = hoverTarget === null;

      // Use a special marker for root reparent
      const previewTarget = isHoveringBlank ? "ROOT" : targetGuid;

      // Clear timeout if target changed
      if (previewTarget !== lastHoverTargetRef.current) {
        if (previewTimeoutRef.current) {
          clearTimeout(previewTimeoutRef.current);
          previewTimeoutRef.current = null;
        }
        lastHoverTargetRef.current = previewTarget;

        // Validate reparent
        if (targetGuid) {
          // Check if target is invalid (self or descendant)
          const isSelf = targetGuid === draggingGuid;
          const isDescendant = checkIsDescendant(draggingGuid, targetGuid);
          const isAncestor = checkIsAncestor(draggingGuid, targetGuid);

          if (isSelf || isDescendant) {
            // Invalid target, clear preview
            setReparentPreview(draggingGuid, null);
            return;
          }

          // Valid entity target, set preview after delay
          previewTimeoutRef.current = setTimeout(() => {
            setReparentPreview(draggingGuid, targetGuid);
          }, PREVIEW_DELAY_MS);
        } else {
          // Hovering over blank canvas - allow reparent to root
          // Check if dragging entity is already at root level
          const draggingEntity = entities[draggingGuid];
          const isAlreadyAtRoot =
            !draggingEntity?.parentId || draggingEntity.parentId === rootGuid;

          if (isAlreadyAtRoot) {
            // Already at root, no need to preview
            setReparentPreview(draggingGuid, null);
          } else {
            // Set preview for root reparent after delay
            previewTimeoutRef.current = setTimeout(() => {
              setReparentPreview(draggingGuid, "ROOT");
            }, PREVIEW_DELAY_MS);
          }
        }
      }
    },
    [
      reactFlowInstance,
      setReparentPreview,
      checkIsDescendant,
      checkIsAncestor,
      entities,
      rootGuid,
    ]
  );

  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node | undefined) => {
      if (!node || node.type !== "entity") {
        return;
      }

      const draggingGuid = node.id;
      const store = useGraphEditorStore.getState();
      const previewParentGuid = store.previewParentGuid;

      // Clear timeout
      if (previewTimeoutRef.current) {
        clearTimeout(previewTimeoutRef.current);
        previewTimeoutRef.current = null;
      }
      lastHoverTargetRef.current = null;
      // Execute reparent if preview was active
      if (previewParentGuid && previewParentGuid !== draggingGuid) {
        // Convert "ROOT" marker to null for actual reparent
        const actualParentGuid =
          previewParentGuid === "ROOT" ? null : previewParentGuid;
        reparentEntity(draggingGuid, actualParentGuid);
      } else {
        // Clear preview state
        setReparentPreview(null, null);
      }
    },
    [reparentEntity, setReparentPreview]
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") {
        return;
      }

      const currentEdges = reactFlowInstance.getEdges();
      const selectedEdges = currentEdges.filter((edge) => edge.selected);
      if (!selectedEdges.length) {
        return;
      }

      event.preventDefault();

      selectedEdges.forEach((edge) => {
        const data = edge.data as
          | {
              entityGuid?: string;
              scriptName?: string;
              attributeName?: string;
            }
          | undefined;
        if (data?.entityGuid && data?.scriptName && data?.attributeName) {
          clearScriptAttribute(
            data.entityGuid,
            data.scriptName,
            data.attributeName
          );
        }
      });
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (previewTimeoutRef.current) {
        clearTimeout(previewTimeoutRef.current);
      }
    };
  }, [reactFlowInstance, clearScriptAttribute]);

  const minimapNodeColor = useCallback(() => "#364346", []);

  const minimapNodeStrokeColor = useCallback(
    (node: Node) => (node.selected ? "#f60" : "#2c393c"),
    []
  );

  const minimapNodeClassName = useCallback(
    (node: Node) =>
      node.selected
        ? "pc-minimap-node pc-minimap-node--selected"
        : "pc-minimap-node",
    []
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={onNodeClick}
      onNodeDrag={onNodeDrag}
      onNodeDragStop={onNodeDragStop}
      className="h-full bg-pc-darker"
      connectionRadius={40}
      fitView
    >
      <Background />
      <Controls className="pc-controls" position="bottom-left" />
      <MiniMap
        className="pc-minimap"
        style={{ background: "#2c393c" }}
        nodeBorderRadius={8}
        nodeStrokeWidth={1.5}
        nodeStrokeColor={minimapNodeStrokeColor}
        nodeColor={minimapNodeColor}
        nodeClassName={minimapNodeClassName}
        pannable
        zoomable
      />
    </ReactFlow>
  );
}
