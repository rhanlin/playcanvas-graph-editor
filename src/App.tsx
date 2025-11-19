import { useCallback, useEffect } from "react";

import { GraphEditorCanvas } from "@/components/graph-editor/GraphEditorCanvas";
import { useGraphEditorStore } from "@/stores/useGraphEditorStore";
import type { GraphResponse, RuntimeMessage } from "@/types/messaging";
import { sendRuntimeMessage } from "@/utils/runtime";
import { ReactFlowProvider } from "reactflow";
export default function App() {
  const {
    selectedEntityName,
    isLoading,
    error,
    setGraphData,
    setSelectedEntity,
    setLoading,
    setError,
    upsertEntity,
    removeEntity,
    applyCollapseStateUpdate,
  } = useGraphEditorStore((state) => ({
    selectedEntityName: state.selectedEntityName,
    isLoading: state.isLoading,
    error: state.error,
    setGraphData: state.setGraphData,
    setSelectedEntity: state.setSelectedEntity,
    setLoading: state.setLoading,
    setError: state.setError,
    upsertEntity: state.upsertEntity,
    removeEntity: state.removeEntity,
    applyCollapseStateUpdate: state.applyCollapseStateUpdate,
  }));

  const requestGraphData = useCallback(() => {
    setLoading(true);
    sendRuntimeMessage<GraphResponse>({ type: "GRAPH_REQUEST_DATA" })
      .then((response) => {
        if (!response.success || !response.data) {
          setError(response.error ?? "Unable to load graph data");
          return;
        }
        setGraphData(response.data);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Unexpected error")
      )
      .finally(() => setLoading(false));
  }, [setGraphData, setLoading, setError]);

  useEffect(() => {
    requestGraphData();
  }, [requestGraphData]);

  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) {
      return;
    }

    const handler = (message: RuntimeMessage) => {
      // Handle selection updates from the editor
      if (message?.type === "GRAPH_UPDATE_SELECTION") {
        setSelectedEntity(
          message.payload.entityGuid,
          message.payload.entityName
        );
        return;
      }

      if (
        message?.type === "GRAPH_ENTITY_ADDED" ||
        message?.type === "GRAPH_ENTITY_UPDATED"
      ) {
        if (message.payload?.entity) {
          upsertEntity(message.payload.entity);
        }
        return;
      }

      if (message?.type === "GRAPH_ENTITY_REMOVED") {
        if (message.payload?.guid) {
          removeEntity(message.payload.guid);
        }
        return;
      }

      if (message?.type === "GRAPH_COLLAPSE_STATE_UPDATE") {
        if (message.payload?.guid) {
          applyCollapseStateUpdate(
            message.payload.guid,
            message.payload.collapsed
          );
        }
        return;
      }

      // We listen for GRAPH_PUSH_DATA which is now sent on selection changes
      // and initial load.
      if (message?.type !== "GRAPH_PUSH_DATA") {
        return;
      }

      const payload = message.payload;
      if (!payload.success || !payload.data) {
        setError(payload.error ?? "Unable to load graph data");
        return;
      }

      setGraphData(payload.data);
    };

    chrome.runtime.onMessage.addListener(handler);
    return () => {
      chrome.runtime?.onMessage?.removeListener(handler);
    };
  }, [
    setGraphData,
    setSelectedEntity,
    setError,
    upsertEntity,
    removeEntity,
    applyCollapseStateUpdate,
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-50">
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <div>
          <p className="text-lg font-semibold">PlayCanvas Visual Editor</p>
          <p className="text-sm text-slate-400">
            {selectedEntityName
              ? `Focused on: ${selectedEntityName}`
              : "Select an entity in the editor to see its name here"}
          </p>
        </div>
        <button
          className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white"
          onClick={requestGraphData}
        >
          Refresh
        </button>
      </header>
      <main className="relative flex flex-1 min-h-0 bg-slate-900">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
            <span className="text-sm uppercase tracking-[0.4em] text-slate-200">
              Loading
            </span>
          </div>
        )}
        {error && (
          <div className="z-50 absolute right-4 top-4 rounded-lg bg-rose-500/90 px-4 py-2 text-xs font-semibold text-white shadow-lg">
            {error}
          </div>
        )}
        <div className="flex-1 min-h-0">
          <ReactFlowProvider>
            <GraphEditorCanvas />
          </ReactFlowProvider>
        </div>
      </main>
    </div>
  );
}
