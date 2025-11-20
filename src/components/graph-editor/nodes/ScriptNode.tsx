import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";

import { ScriptAttributesPanel } from "@/components/script-attributes/ScriptAttributesPanel";
import { useGraphEditorStore } from "@/stores/useGraphEditorStore";
import type { ScriptAttributePayload } from "@/types/messaging";

type ScriptNodeData = {
  label: string;
  scriptName?: string;
  entityGuid?: string;
  attributes?: Record<string, ScriptAttributePayload>;
};

export const ScriptNode = memo(
  ({ data, selected }: NodeProps<ScriptNodeData>) => {
    const clearScriptAttribute = useGraphEditorStore(
      (state) => state.clearScriptAttribute
    );

    const entityAttributes = Object.entries(data.attributes || {}).filter(
      ([, attr]) => attr?.type === "entity"
    );

    const scriptName = data.scriptName || data.label;
    const entityGuid = data.entityGuid;
    const scriptNodeId =
      entityGuid && scriptName ? `${entityGuid}-${scriptName}` : undefined;

    const isCollapsed = useGraphEditorStore((state) =>
      scriptNodeId ? !!state.scriptPanelState[scriptNodeId] : false
    );
    const toggleScriptPanel = useGraphEditorStore(
      (state) => state.toggleScriptPanel
    );

    return (
      <div
        className={`flex flex-col rounded-2xl border px-4 py-3 shadow-sm backdrop-blur-sm transition-all ${
          selected
            ? "border-pc-text-active bg-pc-darkest ring-2 ring-pc-text-active ring-offset-1 ring-offset-pc-darker"
            : "border-pc-text-active/40 bg-pc-dark/80"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="font-bold text-sm text-pc-text-secondary">
              {data.label}
            </p>
            <p className="text-xs text-pc-text-dark">
              {entityAttributes.length} entity handle
              {entityAttributes.length === 1 ? "" : "s"} •{" "}
              {Object.keys(data.attributes || {}).length} attributes
            </p>
          </div>
          {scriptNodeId ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                toggleScriptPanel(scriptNodeId);
              }}
              className="rounded-full border border-pc-border-primary/60 bg-pc-darkest px-3 py-1 text-xs font-semibold text-pc-text-secondary transition hover:border-pc-text-active hover:text-pc-text-active"
            >
              {isCollapsed ? "Expand" : "Collapse"}
            </button>
          ) : null}
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {entityAttributes.length > 0 ? (
            entityAttributes.map(([key, attrData]) => {
              const attr = attrData;
              const isLinked = !!attr?.value;
              return (
                <div
                  key={key}
                  className="relative flex items-center justify-between pr-6"
                >
                  <span className="text-sm text-pc-text-secondary">{key}</span>
                  {isLinked ? (
                    <button
                      type="button"
                      className="ml-2 inline-flex h-6 items-center justify-center rounded-md border border-pc-border-primary/40 px-2 text-xs font-bold text-pc-error-secondary hover:border-pc-error-secondary hover:text-pc-error"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!entityGuid || !scriptName) {
                          return;
                        }
                        clearScriptAttribute(entityGuid, scriptName, key);
                      }}
                    >
                      ×
                    </button>
                  ) : (
                    <span className="text-[10px] uppercase tracking-wide text-pc-text-darkest">
                      Unlinked
                    </span>
                  )}
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={key}
                    className="!absolute !right-0 !h-2.5 !w-2.5 !bg-pc-text-active"
                    style={{ top: "50%", transform: "translateY(-50%)" }}
                  />
                </div>
              );
            })
          ) : (
            <div className="text-xs italic text-pc-text-secondary">
              No entity attributes
            </div>
          )}
        </div>
        {!isCollapsed && entityGuid && scriptName ? (
          <div className="mt-3 rounded-2xl border border-pc-border-primary/40 bg-pc-primary/50 p-3">
            <ScriptAttributesPanel
              entityGuid={entityGuid}
              scriptName={scriptName}
              attributes={data.attributes}
            />
          </div>
        ) : null}
      </div>
    );
  }
);

ScriptNode.displayName = "ScriptNode";
