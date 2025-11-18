import React, { useCallback } from "react";
import { ReactFlow, Background, Controls, MiniMap } from "reactflow";
import "reactflow/dist/style.css";

import { useGraphEditorStore } from "@/stores/useGraphEditorStore";
import { EntityNode } from "./nodes/EntityNode";
import { ScriptNode } from "./nodes/ScriptNode";

const nodeTypes = {
  entity: EntityNode,
  script: ScriptNode,
};

export function GraphEditorCanvas() {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    setSelectedEntity,
  } = useGraphEditorStore();

  const onNodeClick = useCallback(
    (_event, node) => {
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

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={onNodeClick}
      className="h-full bg-slate-900"
      connectionRadius={40}
      fitView
    >
      <Background />
      <Controls />
      <MiniMap />
    </ReactFlow>
  );
}
