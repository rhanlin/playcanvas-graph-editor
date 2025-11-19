(function () {
  let scriptNameToAssetIdMap = null;
  const entityWatchers = new Map();
  const collapseListenerMap = new WeakMap();

  /**
   * Builds a map from script names (e.g., 'playerController') to their asset IDs.
   * This is done once and cached for performance.
   * @returns {Map<string, number>}
   */
  function buildScriptNameMap() {
    const newMap = new Map();
    const scriptAssets = editor.call("assets:list", { type: "script" });
    scriptAssets.forEach((asset) => {
      const assetScripts = asset.get("data.scripts");
      if (assetScripts) {
        Object.keys(assetScripts).forEach((scriptName) => {
          // A script name can exist in multiple files (e.g. forks),
          // but for now we'll just take the last one we find.
          newMap.set(scriptName, asset.get("id"));
        });
      }
    });
    return newMap;
  }
  /**
   * Extracts a serializable representation of an entity's components.
   * @param {object} entity - The PlayCanvas editor entity object.
   * @returns {object} A map of component data, keyed by component type.
   */
  function getEntityComponents(entity) {
    const components = {};
    // This is a simplified list. We may need to add more component types
    // and their relevant properties as the tool develops.
    const componentTypes = [
      "script",
      "model",
      "collision",
      "camera",
      "light",
      "rigidbody",
    ];

    componentTypes.forEach((type) => {
      const componentData = entity.get(`components.${type}`);
      if (componentData) {
        components[type] = JSON.parse(JSON.stringify(componentData));
      }
    });

    // Special handling for scripts to get attributes
    if (components.script && components.script.scripts) {
      // Now, iterate through the script instances on the entity
      Object.keys(components.script.scripts).forEach((scriptName) => {
        const scriptComponentInstance = components.script.scripts[scriptName];
        const newAttributes = {};

        // Find the corresponding asset ID from our global map
        const assetId = scriptNameToAssetIdMap.get(scriptName);
        if (!assetId) {
          // eslint-disable-next-line no-console
          console.warn(
            `[GraphBridge] Could not find asset ID for script "${scriptName}" in the project-wide map.`
          );
          return; // Skip this script if we can't find its definition
        }

        // Get the asset using the ID
        const asset = editor.call("assets:get", assetId);
        if (!asset) {
          // eslint-disable-next-line no-console
          console.warn(`[GraphBridge] Could not get asset with ID ${assetId}.`);
          return;
        }

        // Get the schema (definitions) from the asset data
        const definitions = asset.get(`data.scripts.${scriptName}.attributes`);
        // Get the values from the entity's component instance
        const values = scriptComponentInstance.attributes;
        if (definitions && values) {
          for (const attrName in definitions) {
            if (Object.prototype.hasOwnProperty.call(values, attrName)) {
              newAttributes[attrName] = {
                type: definitions[attrName].type,
                value: values[attrName],
              };
            }
          }
        }

        // Replace the old attributes object with our new, detailed one.
        scriptComponentInstance.attributes = newAttributes;
      });
    }

    return components;
  }

  function normalizeChildId(child) {
    if (!child) return null;
    if (typeof child === "string") return child;
    if (typeof child.get === "function") {
      return child.get("resource_id") || null;
    }
    return null;
  }

  function serializeEntityData(entity) {
    if (!entity || typeof entity.get !== "function") {
      return null;
    }

    const guid = entity.get("resource_id");
    if (!guid) {
      return null;
    }

    const childrenRaw = entity.get("children") || [];
    const children =
      Array.isArray(childrenRaw) && childrenRaw.length > 0
        ? childrenRaw
            .map((child) => normalizeChildId(child))
            .filter((id) => !!id)
        : [];

    return {
      guid,
      name: entity.get("name"),
      parentId: entity.get("parent") || null,
      children,
      components: getEntityComponents(entity),
    };
  }

  function postGraphMessage(type, payload) {
    window.postMessage(
      {
        type,
        payload,
      },
      "*"
    );
  }

  function getHierarchyTreeView() {
    const editor = window.editor;
    if (!editor || typeof editor.call !== "function") {
      return null;
    }
    try {
      return editor.call("entities:hierarchy");
    } catch {
      return null;
    }
  }

  function getCollapsedStateSnapshot() {
    const editor = window.editor;
    if (!editor) {
      return {};
    }
    const treeView = getHierarchyTreeView();
    const rootEntity = editor.call("entities:root");
    if (
      !treeView ||
      !rootEntity ||
      typeof treeView.getExpandedState !== "function"
    ) {
      return {};
    }

    const expandedState = treeView.getExpandedState(rootEntity) || {};
    const rootGuid = rootEntity.get("resource_id");
    const collapsedState = {};
    Object.keys(expandedState).forEach((guid) => {
      if (guid !== rootGuid && expandedState[guid] === false) {
        collapsedState[guid] = true;
      }
    });
    return collapsedState;
  }

  function emitCollapseUpdateFromItem(item, collapsed) {
    if (!item || !item.entity || typeof item.entity.get !== "function") {
      return;
    }
    const guid = item.entity.get("resource_id");
    if (!guid) {
      return;
    }
    postGraphMessage("PC_GRAPH_COLLAPSE_STATE", {
      guid,
      collapsed,
    });
  }

  function hookTreeItemForCollapse(item) {
    if (
      !item ||
      typeof item.on !== "function" ||
      collapseListenerMap.has(item)
    ) {
      return;
    }

    const handleOpen = () => emitCollapseUpdateFromItem(item, false);
    const handleClose = () => emitCollapseUpdateFromItem(item, true);

    item.on("open", handleOpen);
    item.on("close", handleClose);

    const cleanup = () => {
      if (typeof item.off === "function") {
        item.off("open", handleOpen);
        item.off("close", handleClose);
      }
      collapseListenerMap.delete(item);
    };

    if (typeof item.once === "function") {
      item.once("destroy", cleanup);
    }

    collapseListenerMap.set(item, { handleOpen, handleClose });
  }

  function hookExistingTreeItems(treeView) {
    if (!treeView) {
      return;
    }
    if (typeof treeView._traverseDepthFirst === "function") {
      treeView._traverseDepthFirst((item) => hookTreeItemForCollapse(item));
      return;
    }
    if (treeView._rootItem && typeof treeView._rootItem._dfs === "function") {
      treeView._rootItem._dfs((item) => hookTreeItemForCollapse(item));
    }
  }

  function patchHierarchyAppend(treeView) {
    if (
      !treeView ||
      treeView.__pcGraphCollapsePatched ||
      typeof treeView._onAppendTreeViewItem !== "function"
    ) {
      return;
    }
    const original = treeView._onAppendTreeViewItem;
    treeView._onAppendTreeViewItem = function patched(item) {
      hookTreeItemForCollapse(item);
      return original.call(this, item);
    };
    treeView.__pcGraphCollapsePatched = true;
  }

  function initializeHierarchyCollapseWatcher(retriesLeft = 20) {
    const treeView = getHierarchyTreeView();
    if (!treeView) {
      if (retriesLeft > 0) {
        setTimeout(
          () => initializeHierarchyCollapseWatcher(retriesLeft - 1),
          300
        );
      }
      return;
    }
    hookExistingTreeItems(treeView);
    patchHierarchyAppend(treeView);
  }

  /**
   * Recursively traverses the entity hierarchy to build a flat map of entities.
   * @param {object} entity - The current entity to process.
   * @param {Map<string, object>} entitiesMap - The map to store entity data.
   * @param {string|null} parentId - The GUID of the parent entity.
   */
  function traverseEntity(entity, entitiesMap, parentId) {
    const guid = entity.get("resource_id");
    if (!guid || entitiesMap.has(guid)) {
      return;
    }

    const childrenGuids = (entity.get("children") || []).map((child) => {
      if (typeof child === "string") return child;
      // In some cases children might be objects, we need their guid
      return child.get("resource_id");
    });

    entitiesMap.set(guid, {
      guid,
      name: entity.get("name"),
      parentId,
      children: childrenGuids,
      components: getEntityComponents(entity),
    });

    childrenGuids.forEach((childGuid) => {
      const childEntity = editor.call("entities:get", childGuid);
      if (childEntity) {
        traverseEntity(childEntity, entitiesMap, guid);
      }
    });
  }

  /**
   * Creates the main data payload by traversing the entire scene graph.
   * @returns {object} The success/fail status and the scene data.
   */
  function createSceneGraphPayload() {
    const editor = window.editor;
    if (!editor || !editor.call) {
      return { success: false, error: "PlayCanvas editor not detected" };
    }

    // Initialize the script map on the first run.
    if (!scriptNameToAssetIdMap) {
      scriptNameToAssetIdMap = buildScriptNameMap();
    }

    const rootEntity = editor.call("entities:root");
    if (!rootEntity) {
      return { success: false, error: "Scene root not found" };
    }

    const entitiesMap = new Map();
    traverseEntity(rootEntity, entitiesMap, null);

    // The root is not part of its own children list, so we add it manually
    // to kick off the traversal on the other side.
    const rootGuid = rootEntity.get("resource_id");

    const config = window.config || {};
    const projectId = config.project?.id ?? null;
    const sceneId = config.scene?.id ?? null;
    const collapsedState = getCollapsedStateSnapshot();

    return {
      success: true,
      data: {
        rootGuid,
        entities: Object.fromEntries(entitiesMap),
        selectedEntityName:
          editor.call("selector:items")?.[0]?.get("name") || null,
        projectId,
        sceneId,
        collapsedState,
      },
    };
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
    // This function will now broadcast the entire scene graph,
    // but the name indicates it's triggered by selection change.
    // We can rename it later if it becomes confusing.
    const payload = createSceneGraphPayload();
    window.postMessage(
      {
        type: "PC_GRAPH_SCENE_UPDATE", // New message type for full updates
        ...payload,
      },
      "*"
    );
  }

  function broadcastSelectionUpdate() {
    const editor = window.editor;
    if (!editor) return;

    const selection = editor.call("selector:items") || [];
    const selectedGuid =
      selection.length > 0 ? selection[0].get("resource_id") : null;
    const selectedName = selection.length > 0 ? selection[0].get("name") : null;

    window.postMessage(
      {
        type: "PC_GRAPH_SELECTION_UPDATE",
        payload: {
          entityGuid: selectedGuid,
          entityName: selectedName,
        },
      },
      "*"
    );
  }

  function handleGraphRequest(requestId) {
    const payload = createSceneGraphPayload();
    respond(requestId, payload);
  }

  function handleSetSelection(payload) {
    const editor = window.editor;
    if (!editor) return;

    const { entityGuid } = payload;
    const entity = editor.call("entities:get", entityGuid);
    if (entity) {
      editor.call("selector:set", "entity", [entity]);
    } else {
      editor.call("selector:clear");
    }
  }

  function handleCollapseStateRequest(payload) {
    const editor = window.editor;
    if (!editor || !payload || !payload.entityGuid) {
      return;
    }

    const treeView = getHierarchyTreeView();
    if (!treeView || typeof treeView.getTreeItemForEntity !== "function") {
      return;
    }

    const item = treeView.getTreeItemForEntity(payload.entityGuid);
    if (!item) {
      return;
    }

    const desiredOpen = !payload.collapsed;
    if (item.open !== desiredOpen) {
      item.open = desiredOpen;
    }
  }

  function handleReparentRequest(payload) {
    const editor = window.editor;
    if (!editor || !payload || !payload.entityGuid) {
      return;
    }

    const entity = editor.call("entities:get", payload.entityGuid);
    if (!entity) {
      console.error(
        `[GraphBridge] Cannot reparent: entity ${payload.entityGuid} not found`
      );
      return;
    }

    const newParentGuid = payload.newParentGuid || null;
    const parent = newParentGuid
      ? editor.call("entities:get", newParentGuid)
      : editor.call("entities:root");

    if (!parent) {
      console.error(
        `[GraphBridge] Cannot reparent: parent ${newParentGuid} not found`
      );
      return;
    }

    try {
      editor.call(
        "entities:reparent",
        [
          {
            entity,
            parent,
            index:
              typeof payload.insertIndex === "number"
                ? payload.insertIndex
                : undefined,
          },
        ],
        payload.preserveTransform !== false
      );
    } catch (error) {
      console.error("[GraphBridge] Failed to reparent entity", error);
    }
  }

  function registerEntityWatcher(entity) {
    if (!entity || typeof entity.get !== "function") {
      return;
    }

    const guid = entity.get("resource_id");
    if (!guid || entityWatchers.has(guid)) {
      return;
    }

    const disposers = [];

    const emitEntityUpdate = () => {
      const serialized = serializeEntityData(entity);
      if (serialized) {
        postGraphMessage("PC_GRAPH_ENTITY_UPDATED", { entity: serialized });
      }
    };

    const nameHandler = emitEntityUpdate;
    const parentHandler = emitEntityUpdate;
    const childrenHandler = emitEntityUpdate;
    const scriptAttributeHandler = (path) => {
      if (typeof path !== "string") {
        return;
      }
      if (!path.startsWith("components.script")) {
        return;
      }
      emitEntityUpdate();
    };

    if (typeof entity.on === "function") {
      entity.on("name:set", nameHandler);
      entity.on("parent:set", parentHandler);
      entity.on("children:insert", childrenHandler);
      entity.on("children:remove", childrenHandler);
      entity.on("children:move", childrenHandler);
      entity.on("*:set", scriptAttributeHandler);
      entity.on("*:unset", scriptAttributeHandler);
    }

    disposers.push(() => {
      if (typeof entity.off === "function") {
        entity.off("name:set", nameHandler);
        entity.off("parent:set", parentHandler);
        entity.off("children:insert", childrenHandler);
        entity.off("children:remove", childrenHandler);
        entity.off("children:move", childrenHandler);
        entity.off("*:set", scriptAttributeHandler);
        entity.off("*:unset", scriptAttributeHandler);
      }
    });

    entityWatchers.set(guid, disposers);
  }

  function unregisterEntityWatcher(entityOrGuid) {
    const guid =
      typeof entityOrGuid === "string"
        ? entityOrGuid
        : entityOrGuid && typeof entityOrGuid.get === "function"
        ? entityOrGuid.get("resource_id")
        : null;

    if (!guid || !entityWatchers.has(guid)) {
      return;
    }

    const disposers = entityWatchers.get(guid);
    if (Array.isArray(disposers)) {
      disposers.forEach((dispose) => {
        try {
          dispose();
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn("[GraphBridge] Failed to dispose entity watcher", err);
        }
      });
    }

    entityWatchers.delete(guid);
  }

  function tryInitializeSelectorWatcher(retriesLeft = 20) {
    const editor = window.editor;
    if (!editor || typeof editor.on !== "function") {
      if (retriesLeft > 0) {
        setTimeout(() => tryInitializeSelectorWatcher(retriesLeft - 1), 250);
      }
      return;
    }

    // The 'editor:ready' event fires when the editor is fully initialized.
    // This is the correct and reliable time to perform our one-time setup.
    editor.once("assets:load", () => {
      // eslint-disable-next-line no-console
      console.log("[GraphBridge] Editor is ready. Initializing script map...");
      scriptNameToAssetIdMap = buildScriptNameMap();

      const existingEntities = editor.call("entities:list") || [];
      if (Array.isArray(existingEntities)) {
        existingEntities.forEach((entity) => {
          registerEntityWatcher(entity);
        });
      }

      initializeHierarchyCollapseWatcher();
      editor.on("entities:load", () => {
        initializeHierarchyCollapseWatcher();
      });

      editor.on("entities:add", (entity) => {
        try {
          registerEntityWatcher(entity);
          const serialized = serializeEntityData(entity);
          if (serialized) {
            postGraphMessage("PC_GRAPH_ENTITY_ADDED", { entity: serialized });
          }
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error("[GraphBridge] Failed to handle entity add", error);
        }
      });

      editor.on("entities:remove", (entity) => {
        try {
          const guid =
            entity && typeof entity.get === "function"
              ? entity.get("resource_id")
              : null;
          unregisterEntityWatcher(entity);
          if (guid) {
            postGraphMessage("PC_GRAPH_ENTITY_REMOVED", { guid });
          }
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error("[GraphBridge] Failed to handle entity removal", error);
        }
      });

      // Now that we are ready, set up the selector watcher for live updates.
      editor.on("selector:change", () => {
        try {
          broadcastSelectionUpdate();
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error("[GraphBridge] selector update failed", error);
        }
      });

      // And perform the initial broadcast to load the scene graph.
      broadcastSelection();
      // Also broadcast initial selection state
      broadcastSelectionUpdate();
    });
  }

  function handleAttributeUpdate(payload) {
    const editor = window.editor;
    const { entityGuid, scriptName, attributeName, targetEntityGuid } = payload;

    if (!editor || !entityGuid || !scriptName || !attributeName) {
      console.error("[GraphBridge] Invalid attribute update payload", payload);
      return;
    }

    const entity = editor.call("entities:get", entityGuid);
    if (!entity) {
      console.error(
        `[GraphBridge] Could not find entity with GUID: ${entityGuid}`
      );
      return;
    }

    const path = `components.script.scripts.${scriptName}.attributes.${attributeName}`;
    const oldValue = entity.get(path);

    const history =
      editor && editor.api && editor.api.globals
        ? editor.api.globals.history
        : null;

    if (history && typeof history.add === "function") {
      history.add({
        name: `Update ${scriptName}.${attributeName}`,
        undo: () => {
          entity.set(path, oldValue);
        },
        redo: () => {
          entity.set(path, targetEntityGuid);
        },
      });
    }

    // Apply the change immediately; history undo/redo callbacks handle symmetry
    entity.set(path, targetEntityGuid);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) {
      return;
    }

    const { type, requestId, payload } = event.data || {};

    if (type === "GRAPH_SET_SELECTION") {
      try {
        handleSetSelection(payload);
      } catch (e) {
        console.error("[GraphBridge] Failed to handle set selection:", e);
      }
      return;
    }

    if (type === "GRAPH_SET_COLLAPSE_STATE") {
      try {
        handleCollapseStateRequest(payload);
      } catch (e) {
        console.error("[GraphBridge] Failed to handle collapse update:", e);
      }
      return;
    }

    if (type === "GRAPH_REPARENT_ENTITY") {
      try {
        handleReparentRequest(payload);
      } catch (e) {
        console.error("[GraphBridge] Failed to handle reparent request:", e);
      }
      return;
    }

    if (type === "GRAPH_UPDATE_ATTRIBUTE") {
      try {
        handleAttributeUpdate(payload);
      } catch (e) {
        console.error("[GraphBridge] Failed to handle attribute update:", e);
      }
      return;
    }

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
