import { useCallback, useEffect } from "react";

import { GraphEditorCanvas } from "@/components/graph-editor/GraphEditorCanvas";
import { useGraphEditorStore } from "@/stores/useGraphEditorStore";
import type { GraphResponse, RuntimeMessage } from "@/types/messaging";
import { sendRuntimeMessage } from "@/utils/runtime";

export default function App() {
  const { entityName, isLoading, error, setGraphData, setLoading, setError } =
    useGraphEditorStore((state) => ({
      entityName: state.entityName,
      isLoading: state.isLoading,
      error: state.error,
      setGraphData: state.setGraphData,
      setLoading: state.setLoading,
      setError: state.setError,
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
      );
  }, [setGraphData, setLoading, setError]);

  useEffect(() => {
    requestGraphData();
  }, [requestGraphData]);

  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) {
      return;
    }

    const handler = (message: RuntimeMessage) => {
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
  }, [setGraphData, setError]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-50">
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <div>
          <p className="text-lg font-semibold">PlayCanvas Visual Editor</p>
          <p className="text-sm text-slate-400">
            {entityName
              ? `Focused on: ${entityName}`
              : "Select an entity in the editor"}
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
          <GraphEditorCanvas />
        </div>
      </main>
    </div>
  );
}
