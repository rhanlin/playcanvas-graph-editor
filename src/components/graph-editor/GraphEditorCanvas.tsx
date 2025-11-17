import React, { useCallback, type MouseEvent } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  useReactFlow,
  type Node,
} from "reactflow";

import "reactflow/dist/style.css";
import { useGraphEditorStore } from "@/stores/useGraphEditorStore";

export function GraphEditorCanvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, setNodes } =
    useGraphEditorStore();
  const { getIntersectingNodes } = useReactFlow();

  const onNodeDrag = useCallback(
    (_: MouseEvent, node: Node) => {
      const intersections = getIntersectingNodes(node).map((n) => n.id);

      setNodes(
        nodes.map((n) => ({
          ...n,
          className: intersections.includes(n.id) ? "highlight" : "",
        }))
      );
    },
    [nodes, getIntersectingNodes, setNodes]
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeDrag={onNodeDrag}
      className="intersection-flow h-full"
      minZoom={0.2}
      maxZoom={4}
      fitView
      selectNodesOnDrag={false}
    >
      <Background />
      <Controls />
    </ReactFlow>
  );
}
