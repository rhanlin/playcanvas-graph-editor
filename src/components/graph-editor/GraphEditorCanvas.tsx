import { useCallback } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type NodeChange,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
} from "reactflow";

import { useGraphEditorStore } from "@/stores/useGraphEditorStore";
import { EntityNode } from "./nodes/EntityNode";
import { ScriptNode } from "./nodes/ScriptNode";

const nodeTypes = {
  entity: EntityNode,
  script: ScriptNode,
};

export function GraphEditorCanvas() {
  const { nodes, edges, setNodesDirect, setEdgesDirect } = useGraphEditorStore(
    (state) => ({
      nodes: state.nodes,
      edges: state.edges,
      setNodesDirect: state.setNodesDirect,
      setEdgesDirect: state.setEdgesDirect,
    })
  );

  const onNodesChange: OnNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const updatedNodes = nodes.map((node) => {
        const change = changes.find(
          (c) => "id" in c && c.id === node.id && c.type === "position"
        );
        if (change && "position" in change && change.position) {
          return {
            ...node,
            position: change.position,
          };
        }
        return node;
      });
      setNodesDirect(updatedNodes);
    },
    [nodes, setNodesDirect]
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      if (!changes.length) return;
      setEdgesDirect(edges);
    },
    [edges, setEdgesDirect]
  );

  const onConnect: OnConnect = useCallback(() => {}, []);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      fitView
      fitViewOptions={{ padding: 0.2, maxZoom: 1.5 }}
    >
      <Background className="bg-[#20292b]" />
      <Controls />
      <MiniMap />
    </ReactFlow>
  );
}
