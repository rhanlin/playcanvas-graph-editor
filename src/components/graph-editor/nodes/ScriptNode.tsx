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
      className={`flex h-[84px] flex-col rounded-2xl border px-4 py-3 shadow-sm backdrop-blur-sm transition-all ${
        selected
          ? "border-yellow-400 bg-slate-700 ring-2 ring-yellow-400 ring-offset-1 ring-offset-slate-900"
          : "border-sky-500/40 bg-slate-800/80"
      }`}
    >
      <div className="font-semibold text-sm text-sky-200">{data.label}</div>
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
                className="!h-2.5 !w-2.5 !bg-pink-400"
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
