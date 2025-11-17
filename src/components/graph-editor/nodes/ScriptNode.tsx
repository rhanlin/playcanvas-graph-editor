import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";

interface ScriptNodeData {
  label: string;
  scriptName?: string;
  scriptAttributes?: Record<string, unknown>;
}

export const ScriptNode = memo(({ data }: NodeProps<ScriptNodeData>) => {
  const attributeCount = data.scriptAttributes
    ? Object.keys(data.scriptAttributes).length
    : 0;

  return (
    <div className="min-w-[220px] rounded-2xl bg-gradient-to-br from-pink-400 via-rose-500 to-purple-500 p-4 text-white shadow-2xl shadow-slate-900/40">
      <div className="text-base font-semibold">📜 {data.label}</div>
      <div className="text-xs text-white/80">
        {attributeCount} attribute{attributeCount === 1 ? "" : "s"}
      </div>
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: "#fff" }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: "#fff" }}
      />
    </div>
  );
});

ScriptNode.displayName = "ScriptNode";
