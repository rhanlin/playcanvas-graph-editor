import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";

export const ScriptNode = memo(({ data, selected }: NodeProps) => {
  const entityAttributes = Object.entries(data.attributes || {}).filter(
    ([, attrData]) => {
      const attr = attrData as { type?: string; value?: any };
      return attr.type === "entity";
    }
  );

  return (
    <div
      className={`rounded-md border px-4 py-2 shadow-sm backdrop-blur-sm transition-all ${
        selected
          ? "border-yellow-400 bg-slate-700 ring-2 ring-yellow-400 ring-offset-1 ring-offset-slate-900 scale-105"
          : "border-sky-500/50 bg-slate-700/80"
      }`}
    >
      <div className="font-semibold text-sky-300">{data.label}</div>
      <div className="mt-2 flex flex-col gap-2">
        {entityAttributes.length > 0 ? (
          entityAttributes.map(([key], index) => (
            <div
              key={key}
              className="relative flex items-center justify-between"
            >
              <span className="text-sm text-slate-300">{key}</span>
              <Handle
                type="source"
                position={Position.Right}
                id={key} // Crucial: id must match the attribute name for the edge to connect correctly
                className="!h-3 !w-3 !bg-pink-500"
                style={{ top: "50%", transform: "translateY(-50%)" }}
              />
            </div>
          ))
        ) : (
          <div className="text-xs italic text-slate-400">
            No entity attributes
          </div>
        )}
      </div>
    </div>
  );
});

ScriptNode.displayName = "ScriptNode";
