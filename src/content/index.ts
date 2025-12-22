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

// Helper function to safely send messages, ignoring errors when popup is not open
function safeSendMessage(message: any) {
  if (!chrome?.runtime?.sendMessage) {
    return;
  }

  try {
    chrome.runtime.sendMessage(message, () => {
      // Check for errors silently - this is expected when popup is not open
      const lastError = chrome.runtime?.lastError;
      if (lastError) {
        // Extension popup is not open, which is expected during initialization
        // This is not an error condition, so we silently ignore it
      }
    });
  } catch (error) {
    // Silently ignore any errors during message sending
    // This can happen if the extension context is invalidated
  }
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
    safeSendMessage({
      type: "GRAPH_PUSH_DATA",
      payload: {
        success: data.success,
        error: data.error,
        data: data.data,
      },
    });
    return;
  }

  // Forward scene updates from editor bridge
  if (data?.type === "PC_GRAPH_SCENE_UPDATE") {
    safeSendMessage({
      type: "GRAPH_PUSH_DATA",
      payload: data,
    });
    return;
  }

  if (data?.type === "PC_GRAPH_ENTITY_ADDED") {
    const mutationPayload = (data as { payload?: unknown }).payload;
    safeSendMessage({
      type: "GRAPH_ENTITY_ADDED",
      payload: mutationPayload,
    });
    return;
  }

  if (data?.type === "PC_GRAPH_ENTITY_UPDATED") {
    const mutationPayload = (data as { payload?: unknown }).payload;
    safeSendMessage({
      type: "GRAPH_ENTITY_UPDATED",
      payload: mutationPayload,
    });
    return;
  }

  if (data?.type === "PC_GRAPH_ENTITY_REMOVED") {
    const mutationPayload = (data as { payload?: unknown }).payload;
    safeSendMessage({
      type: "GRAPH_ENTITY_REMOVED",
      payload: mutationPayload,
    });
    return;
  }

  if (data?.type === "PC_GRAPH_COLLAPSE_STATE") {
    const collapsePayload = (
      data as {
        payload?: { guid?: string; collapsed?: boolean };
      }
    ).payload;
    if (collapsePayload?.guid) {
      safeSendMessage({
        type: "GRAPH_COLLAPSE_STATE_UPDATE",
        payload: {
          guid: collapsePayload.guid,
          collapsed: !!collapsePayload.collapsed,
        },
      });
    }
    return;
  }

  // Forward selection updates from editor bridge
  if (data?.type === "PC_GRAPH_SELECTION_UPDATE") {
    const selectionData = data as {
      type: string;
      payload?: { entityGuid: string | null; entityName?: string | null };
    };
    safeSendMessage({
      type: "GRAPH_UPDATE_SELECTION",
      payload: selectionData.payload || { entityGuid: null },
    });
    return;
  }

  if (data?.type === "PC_GRAPH_EDITOR_FOCUS") {
    const focusPayload = (
      data as { payload?: { entityGuid?: string; entityName?: string | null } }
    ).payload;
    if (focusPayload?.entityGuid) {
      safeSendMessage({
        type: "GRAPH_EDITOR_FOCUS",
        payload: {
          entityGuid: focusPayload.entityGuid,
          entityName: focusPayload.entityName ?? null,
        },
      });
    }
    return;
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Handle data requests (existing functionality)
  if (message?.type === "GRAPH_REQUEST_DATA") {
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
  }

  // Handle assets requests
  if (message?.type === "GRAPH_REQUEST_ASSETS") {
    const requestId = createRequestId();
    const timeoutId = window.setTimeout(() => {
      resolveRequest(requestId, {
        success: false,
        error: "Timed out waiting for assets",
      });
    }, REQUEST_TIMEOUT_MS);

    pendingRequests.set(requestId, {
      timeoutId,
      resolve: sendResponse,
    });

    window.postMessage(
      {
        type: "GRAPH_REQUEST_ASSETS",
        requestId,
        payload: { assetType: message.assetType },
      },
      "*"
    );

    return true;
  }

  // Forward selection and attribute updates to editor bridge
  if (
    message?.type === "GRAPH_SET_SELECTION" ||
    message?.type === "GRAPH_UPDATE_ATTRIBUTE" ||
    message?.type === "GRAPH_SET_COLLAPSE_STATE" ||
    message?.type === "GRAPH_REPARENT_ENTITY" ||
    message?.type === "GRAPH_FOCUS_ENTITY" ||
    message?.type === "GRAPH_ADD_ENTITY"
  ) {
    window.postMessage(message, "*");
    sendResponse({ success: true });
    return false;
  }

  return false;
});
