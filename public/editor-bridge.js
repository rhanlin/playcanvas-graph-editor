(function () {
  const randomId = () => Math.random().toString(36).slice(2, 10);

  function buildGraphData(entity) {
    const entityName = entity.get("name") || "Unnamed Entity";
    const entityId =
      entity.get("resource_id") || entity.get("resourceId") || randomId();
    const basePosition = { x: 50, y: 50 };

    const nodes = [
      {
        id: `entity-${entityId}`,
        nodeType: "entity",
        label: entityName,
        position: basePosition,
      },
    ];

    const edges = [];

    const scripts = entity.get("components.script.scripts") || {};
    Object.keys(scripts).forEach((scriptName, index) => {
      const nodeId = `entity-${entityId}-script-${scriptName}-${index}`;
      nodes.push({
        id: nodeId,
        nodeType: "script",
        label: scriptName,
        scriptName,
        scriptAttributes: scripts[scriptName]?.attributes || {},
        position: {
          x: basePosition.x + 320,
          y: basePosition.y + index * 180,
        },
      });

      edges.push({
        id: `edge-${entityId}-${scriptName}-${index}`,
        source: `entity-${entityId}`,
        target: nodeId,
      });
    });

    return {
      entityName,
      nodes,
      edges,
    };
  }

  function createGraphPayload() {
    const editor = window.editor;
    if (!editor) {
      return { success: false, error: "PlayCanvas editor not detected" };
    }

    const selection = editor.call?.("selector:items") || [];
    if (!selection.length) {
      return {
        success: true,
        data: {
          entityName: "No entity selected",
          nodes: [],
          edges: [],
        },
      };
    }

    const entity = selection[0];
    return { success: true, data: buildGraphData(entity) };
  }

  function respond(requestId, payload) {
    window.postMessage(
      {
        type: "PC_GRAPH_RESPONSE",
        requestId,
        ...payload,
      },
      "*"
    );
  }

  function broadcastSelection() {
    const payload = createGraphPayload();
    window.postMessage(
      {
        type: "PC_GRAPH_SELECTION",
        ...payload,
      },
      "*"
    );
  }

  function handleGraphRequest(requestId) {
    const payload = createGraphPayload();
    respond(requestId, payload);
  }

  function tryInitializeSelectorWatcher(retriesLeft = 20) {
    const editor = window.editor;
    if (!editor || typeof editor.on !== "function") {
      if (retriesLeft > 0) {
        setTimeout(() => tryInitializeSelectorWatcher(retriesLeft - 1), 250);
      }
      return;
    }

    editor.on("selector:change", () => {
      try {
        broadcastSelection();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("[GraphBridge] selector update failed", error);
      }
    });

    broadcastSelection();
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) {
      return;
    }

    const { type, requestId } = event.data || {};
    if (type !== "PC_GRAPH_FETCH" || !requestId) {
      return;
    }

    try {
      handleGraphRequest(requestId);
    } catch (error) {
      respond(requestId, {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  });

  tryInitializeSelectorWatcher();
})();
