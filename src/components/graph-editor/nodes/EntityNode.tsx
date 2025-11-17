import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";

interface EntityNodeData {
  label: string;
}

export const EntityNode = memo(({ data }: NodeProps<EntityNodeData>) => {
  return (
    <div className="min-w-[220px] rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 p-4 text-white shadow-2xl shadow-slate-900/40">
      <div className="text-lg font-bold tracking-tight">📦 {data.label}</div>
      <div className="text-xs uppercase tracking-widest text-white/80">
        Entity Node
      </div>
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: "#fff" }}
      />
    </div>
  );
});

EntityNode.displayName = "EntityNode";
