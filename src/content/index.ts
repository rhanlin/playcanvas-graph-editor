import type { GraphResponse } from "@/types/messaging";

const REQUEST_TIMEOUT_MS = 5000;

type PendingRequest = {
  timeoutId: number;
  resolve: (payload: GraphResponse) => void;
};

const pendingRequests = new Map<string, PendingRequest>();

function createRequestId() {
  return `graph-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function resolveRequest(requestId: string, payload: GraphResponse) {
  const pending = pendingRequests.get(requestId);
  if (!pending) {
    return;
  }

  clearTimeout(pending.timeoutId);
  pending.resolve(payload);
  pendingRequests.delete(requestId);
}

window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window) {
    return;
  }

  const data = event.data as {
    type?: string;
    requestId?: string;
  } & GraphResponse;

  if (data?.type === "PC_GRAPH_RESPONSE" && data.requestId) {
    resolveRequest(data.requestId, {
      success: data.success,
      error: data.error,
      data: data.data,
    });
    return;
  }

  if (data?.type === "PC_GRAPH_SELECTION") {
    chrome.runtime?.sendMessage?.({
      type: "GRAPH_PUSH_DATA",
      payload: {
        success: data.success,
        error: data.error,
        data: data.data,
      },
    });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "GRAPH_REQUEST_DATA") {
    return false;
  }

  const requestId = createRequestId();
  const timeoutId = window.setTimeout(() => {
    resolveRequest(requestId, {
      success: false,
      error: "Timed out waiting for PlayCanvas editor",
    });
  }, REQUEST_TIMEOUT_MS);

  pendingRequests.set(requestId, {
    timeoutId,
    resolve: sendResponse,
  });

  window.postMessage(
    {
      type: "PC_GRAPH_FETCH",
      requestId,
    },
    "*"
  );

  return true;
});
