import React from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
} from "reactflow";
import "reactflow/dist/style.css";

import { useGraphEditorStore } from "@/stores/useGraphEditorStore";
import { EntityNode } from "./nodes/EntityNode";
import { ScriptNode } from "./nodes/ScriptNode";

const nodeTypes = {
  entity: EntityNode,
  script: ScriptNode,
};

export function GraphEditorCanvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, onEdgesDelete } =
    useGraphEditorStore();

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onEdgesDelete={onEdgesDelete}
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
