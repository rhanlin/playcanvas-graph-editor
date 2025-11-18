import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";

interface EntityNodeData {
  label: string;
}

export const EntityNode = memo(
  ({ data, selected }: NodeProps<EntityNodeData>) => {
    return (
      <div
        className={`min-w-[220px] rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 p-4 text-white shadow-2xl shadow-slate-900/40 transition-all ${
          selected
            ? "ring-4 ring-yellow-400 ring-offset-2 ring-offset-slate-900 scale-105"
            : ""
        }`}
      >
        <div className="text-lg font-bold tracking-tight">📦 {data.label}</div>
        <div className="text-xs uppercase tracking-widest text-white/80">
          Entity Node
        </div>
        <Handle
          type="target"
          position={Position.Left}
          className="!h-4 !w-4 !bg-teal-500"
        />
      </div>
    );
  }
);

EntityNode.displayName = "EntityNode";
