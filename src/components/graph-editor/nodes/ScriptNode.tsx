import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";

export const ScriptNode = memo(({ data }: NodeProps) => {
  const entityAttributes = Object.entries(data.attributes || {}).filter(
    ([, attrData]) => attrData.type === "entity"
  );

  return (
    <div className="rounded-md border border-sky-500/50 bg-slate-700/80 px-4 py-2 shadow-sm backdrop-blur-sm">
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
                className="!bg-pink-500"
                style={{ top: 10 + index * 20 }} // Simple vertical distribution
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
