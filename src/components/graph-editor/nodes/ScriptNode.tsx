import { memo, useMemo } from "react";
import type { NodeProps } from "reactflow";

import { ScriptAttributesPanel } from "@/components/script-attributes/ScriptAttributesPanel";
import { useGraphEditorStore } from "@/stores/useGraphEditorStore";
import type { ScriptAttributePayload } from "@/types/messaging";
import { stopReactFlowEvent, withStopPropagation } from "@/utils/events";

type ScriptNodeData = {
  label: string;
  scriptName?: string;
  entityGuid?: string;
  attributes?: Record<string, ScriptAttributePayload>;
};

export const ScriptNode = memo(
  ({ data, selected }: NodeProps<ScriptNodeData>) => {
    const scriptName = data.scriptName || data.label;
    const entityGuid = data.entityGuid;
    const scriptNodeId =
      entityGuid && scriptName ? `${entityGuid}-${scriptName}` : undefined;

    const attributes = data.attributes || {};
    const entityAttributeCount = useMemo(
      () =>
        Object.values(attributes).filter((attr) => attr?.type === "entity")
          .length,
      [attributes]
    );
    const totalAttributeCount = useMemo(
      () => Object.keys(attributes).length,
      [attributes]
    );

    const isCollapsed = useGraphEditorStore((state) =>
      scriptNodeId ? state.scriptPanelState[scriptNodeId] ?? true : false
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
            <p className="text-[11px] uppercase tracking-wide text-pc-text-dark">
              Script
            </p>
            <p className="font-bold text-sm text-pc-text-secondary">
              {data.label}
            </p>
            <p className="text-xs text-pc-text-dark">
              {entityAttributeCount} entity link
              {entityAttributeCount === 1 ? "" : "s"} • {totalAttributeCount}{" "}
              attribute
              {totalAttributeCount === 1 ? "" : "s"}
            </p>
          </div>
          {scriptNodeId ? (
            <button
              type="button"
              onPointerDownCapture={stopReactFlowEvent}
              onClick={withStopPropagation(() => {
                toggleScriptPanel(scriptNodeId);
              })}
              className="rounded-full border border-pc-border-primary/80 bg-pc-dark p-1 text-pc-text-primary transition hover:bg-pc-darker"
              aria-label={isCollapsed ? "Expand" : "Collapse"}
            >
              <span
                className={`inline-block text-sm transition-transform ${
                  isCollapsed ? "" : "rotate-180"
                }`}
              >
                ▾
              </span>
            </button>
          ) : null}
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
