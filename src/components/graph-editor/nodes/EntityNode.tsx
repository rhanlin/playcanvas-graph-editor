import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";

import { useGraphEditorStore } from "@/stores/useGraphEditorStore";
import { stopReactFlowEvent, withStopPropagation } from "@/utils/events";

interface EntityNodeData {
  label: string;
  collapsed?: boolean;
  childrenCount?: number;
}

export const EntityNode = memo(
  ({ id, data, selected }: NodeProps<EntityNodeData>) => {
    const toggleEntityCollapse = useGraphEditorStore(
      (state) => state.toggleEntityCollapse
    );
    const draggingEntityGuid = useGraphEditorStore(
      (state) => state.draggingEntityGuid
    );
    const previewParentGuid = useGraphEditorStore(
      (state) => state.previewParentGuid
    );

    const collapsed = !!data.collapsed;
    const childrenCount = data.childrenCount ?? 0;
    const isDragging = draggingEntityGuid === id;
    const isPreviewTarget = previewParentGuid === id;
    const isReparentingToRoot = isDragging && previewParentGuid === "ROOT";

    return (
      <div
        className={`relative h-full w-full rounded-3xl border border-pc-border-primary/60 bg-pc-primary/80 p-4 text-pc-text-primary shadow-xl shadow-black/40 transition-all ${
          collapsed ? "opacity-90" : ""
        } ${isDragging ? "opacity-50 cursor-grabbing" : ""} ${
          // Preview effects take priority over selection
          isReparentingToRoot
            ? "!ring-4 !ring-pc-text-active !ring-offset-2 !ring-offset-pc-darkest !bg-pc-darkest/20 !border-pc-text-active/50"
            : isPreviewTarget
            ? "!ring-4 !ring-pc-text-active !ring-offset-2 !ring-offset-pc-darkest !bg-pc-darkest/20 !border-pc-text-active/50"
            : selected
            ? "ring-2 ring-pc-text-active ring-offset-2 ring-offset-pc-darkest"
            : ""
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-wide text-pc-text-dark">
              Entity
            </p>
            <div className="text-lg font-bold leading-tight mb-1">
              {data.label}
            </div>
            {childrenCount > 0 && (
              <p className="text-xs text-pc-text-dark">
                {childrenCount} child{childrenCount === 1 ? "" : "ren"}
              </p>
            )}
          </div>
          <button
            type="button"
            onPointerDownCapture={stopReactFlowEvent}
            onClick={withStopPropagation(() => {
              toggleEntityCollapse(id);
            })}
            className="rounded-full border border-pc-border-primary/80 bg-pc-dark p-1 text-pc-text-primary transition hover:bg-pc-darker"
            aria-label={collapsed ? "Expand entity" : "Collapse entity"}
          >
            <span
              className={`inline-block text-sm transition-transform ${
                collapsed ? "" : "rotate-180"
              }`}
            >
              ▾
            </span>
          </button>
        </div>
        <Handle
          type="target"
          position={Position.Left}
          className="!h-3 !w-3 !bg-pc-text-secondary"
        />
      </div>
    );
  }
);

EntityNode.displayName = "EntityNode";
