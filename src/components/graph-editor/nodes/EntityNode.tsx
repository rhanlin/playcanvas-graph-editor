import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";

import { useGraphEditorStore } from "@/stores/useGraphEditorStore";

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
        className={`relative h-full w-full rounded-3xl border border-white/15 bg-slate-900/80 p-4 text-white shadow-xl shadow-black/40 transition-all ${
          collapsed ? "opacity-90" : ""
        } ${
          isDragging ? "opacity-50 cursor-grabbing" : ""
        } ${
          // Preview effects take priority over selection
          isReparentingToRoot
            ? "!ring-4 !ring-blue-400 !ring-offset-2 !ring-offset-slate-900 !bg-blue-900/20 !border-blue-400/50"
            : isPreviewTarget
            ? "!ring-4 !ring-emerald-400 !ring-offset-2 !ring-offset-slate-900 !bg-emerald-900/20 !border-emerald-400/50"
            : selected
            ? "ring-2 ring-yellow-400 ring-offset-2 ring-offset-slate-900"
            : ""
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-wide text-white/60">
              Entity
            </p>
            <div className="text-lg font-semibold leading-tight">
              {data.label}
            </div>
            {childrenCount > 0 && (
              <p className="text-xs text-white/60">
                {childrenCount} child{childrenCount === 1 ? "" : "ren"}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              toggleEntityCollapse(id);
            }}
            onMouseDown={(event) => event.stopPropagation()}
            className="rounded-full border border-white/20 bg-white/10 p-1 text-white transition hover:bg-white/20"
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
          className="!h-3 !w-3 !bg-white/70"
        />
      </div>
    );
  }
);

EntityNode.displayName = "EntityNode";
