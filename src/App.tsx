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
    focusEntity,
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
    focusEntity: state.focusEntity,
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
          message.payload.entityName,
          null,
          { broadcast: false }
        );
        return;
      }

      if (message?.type === "GRAPH_EDITOR_FOCUS") {
        if (message.payload?.entityGuid) {
          focusEntity(message.payload.entityGuid, {
            broadcast: false,
            requestViewportFocus: false,
            preserveSelection: true,
          });
        }
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
    focusEntity,
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-pc-darkest text-pc-text-primary">
      <header className="flex items-center justify-between border-b border-pc-border-primary/40 px-6 py-4">
        <div>
          <p className="text-lg font-bold">PlayCanvas Visual Editor</p>
          <p className="text-sm text-pc-text-secondary">
            {selectedEntityName
              ? `Focused on: ${selectedEntityName}`
              : "Select an entity in the editor to see its name here"}
          </p>
        </div>
        <button
          className="rounded-lg bg-pc-dark px-4 py-2 text-sm font-bold text-pc-text-primary hover:bg-pc-darker transition-colors"
          onClick={requestGraphData}
        >
          Refresh
        </button>
      </header>
      <main className="relative flex flex-1 min-h-0 bg-pc-darker">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-pc-darkest/80">
            <span className="text-sm uppercase tracking-[0.4em] text-pc-text-secondary">
              Loading
            </span>
          </div>
        )}
        {error && (
          <div className="z-50 absolute right-4 top-4 rounded-lg bg-pc-error/90 px-4 py-2 text-xs font-bold text-pc-text-primary shadow-lg">
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
