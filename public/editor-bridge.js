(function () {
  let scriptNameToAssetIdMap = null;
  const entityWatchers = new Map();
  const collapseListenerMap = new WeakMap();
  let cameraFocusListenerRegistered = false;

  function inferAttributeType(value) {
    if (value === null || value === undefined) {
      return null;
    }
    if (Array.isArray(value)) {
      if (value.length === 2) return "vec2";
      if (value.length === 3) return "vec3";
      if (value.length === 4) return "vec4";
      return "array";
    }
    const type = typeof value;
    if (type === "string") return "string";
    if (type === "number") return "number";
    if (type === "boolean") return "boolean";
    if (type === "object") return "json";
    return null;
  }

  function cloneDefinition(definition) {
    if (!definition) {
      return undefined;
    }
    try {
      return JSON.parse(JSON.stringify(definition));
    } catch {
      return definition;
    }
  }

  function resolveAttributeValue(definition, value) {
    if (value !== undefined) {
      return value;
    }
    if (
      definition &&
      Object.prototype.hasOwnProperty.call(definition, "default")
    ) {
      return definition.default;
    }
    return null;
  }

  /**
   * Builds a map from script names (e.g., 'playerController') to their asset IDs.
   * This is done once and cached for performance.
   * @returns {Map<string, number>}
   */
  function buildScriptNameMap() {
    const newMap = new Map();
    const editor = window.editor;
    if (!editor || !editor.call) {
      console.warn("[GraphBridge] Editor not available for buildScriptNameMap");
      return newMap;
    }

    const scriptAssets = editor.call("assets:list", { type: "script" });

    scriptAssets.forEach((asset) => {
      try {
        const assetId = asset.get("id");
        const assetScripts = asset.get("data.scripts");
        // Only process assets that have data.scripts loaded
        // Some assets may not have data.scripts yet (e.g., still loading), which is normal
        if (assetScripts && typeof assetScripts === "object") {
          const scriptNames = Object.keys(assetScripts);
          scriptNames.forEach((scriptName) => {
            // A script name can exist in multiple files (e.g. forks),
            // but for now we'll just take the last one we find.
            newMap.set(scriptName, assetId);
          });
        }
        // Silently skip assets without data.scripts (they may be loading or not script assets)
      } catch (error) {
        console.error(
          `[GraphBridge] Error processing asset in buildScriptNameMap:`,
          error
        );
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
    const editor = window.editor;
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
    if (components.script && components.script.scripts && editor) {
      // Ensure map is initialized once before the loop
      if (!scriptNameToAssetIdMap) {
        scriptNameToAssetIdMap = buildScriptNameMap();
      }

      // Now, iterate through the script instances on the entity
      Object.keys(components.script.scripts).forEach((scriptName) => {
        const scriptComponentInstance = components.script.scripts[scriptName];
        const newAttributes = {};

        // Find the corresponding asset ID from our global map
        let assetId = scriptNameToAssetIdMap.get(scriptName);
        let definitions = null;

        if (!assetId) {
          // Try to find the asset by searching for it directly (lazy lookup)
          // This avoids rebuilding the entire map
          const scriptAssets = editor.call("assets:list", { type: "script" });
          let foundAssetId = null;
          let maxAssetId = 0;

          for (const asset of scriptAssets) {
            try {
              const assetScripts = asset.get("data.scripts");
              if (assetScripts && typeof assetScripts === "object") {
                if (
                  Object.prototype.hasOwnProperty.call(assetScripts, scriptName)
                ) {
                  const candidateId = asset.get("id");
                  // If multiple assets have the same script name (e.g., after re-upload),
                  // choose the one with the highest ID (newest asset)
                  if (candidateId > maxAssetId) {
                    maxAssetId = candidateId;
                    foundAssetId = candidateId;
                  }
                }
              }
            } catch (error) {
              // Skip assets that can't be read
            }
          }

          if (foundAssetId) {
            assetId = foundAssetId;
            // Update the map for future lookups
            scriptNameToAssetIdMap.set(scriptName, assetId);
          }
        }

        if (!assetId) {
          console.warn(
            `[GraphBridge] Could not find asset ID for script "${scriptName}" in the project-wide map. Falling back to inferred attribute types.`
          );
        } else {
          // Get the asset using the ID
          let asset = editor.call("assets:get", assetId);
          if (!asset) {
            // Asset might have been re-uploaded and the ID is stale.
            // Try lazy lookup again to find the new asset ID
            // When multiple assets have the same script name, choose the one with highest ID (newest)
            const scriptAssets = editor.call("assets:list", { type: "script" });
            let foundAsset = null;
            let foundAssetId = null;
            let maxAssetId = 0;

            for (const candidateAsset of scriptAssets) {
              try {
                const assetScripts = candidateAsset.get("data.scripts");
                if (assetScripts && typeof assetScripts === "object") {
                  if (
                    Object.prototype.hasOwnProperty.call(
                      assetScripts,
                      scriptName
                    )
                  ) {
                    const candidateId = candidateAsset.get("id");
                    const candidateAssetObj = editor.call(
                      "assets:get",
                      candidateId
                    );
                    if (candidateAssetObj) {
                      // If multiple assets have the same script name, choose the one with highest ID (newest)
                      if (candidateId > maxAssetId) {
                        maxAssetId = candidateId;
                        foundAsset = candidateAssetObj;
                        foundAssetId = candidateId;
                      }
                    }
                  }
                }
              } catch (error) {
                // Skip assets that can't be read
              }
            }

            if (foundAsset && foundAssetId) {
              asset = foundAsset;
              // Update the map with the new asset ID
              scriptNameToAssetIdMap.set(scriptName, foundAssetId);
              assetId = foundAssetId;
            }
          }

          if (!asset) {
            console.warn(
              `[GraphBridge] Could not get asset for script "${scriptName}". Falling back to inferred attribute types.`
            );
          } else {
            // Get the schema (definitions) from the asset data
            definitions =
              asset.get(`data.scripts.${scriptName}.attributes`) || null;
          }
        }
        // Get the values from the entity's component instance
        const values = scriptComponentInstance.attributes || {};

        const attributeNames = new Set([
          ...Object.keys(definitions || {}),
          ...Object.keys(values || {}),
        ]);

        attributeNames.forEach((attrName) => {
          const definition = definitions ? definitions[attrName] : null;
          const rawValue = Object.prototype.hasOwnProperty.call(
            values,
            attrName
          )
            ? values[attrName]
            : undefined;
          const resolvedValue = resolveAttributeValue(definition, rawValue);
          const attributeType =
            (definition && definition.type) ||
            inferAttributeType(rawValue) ||
            "json";

          newAttributes[attrName] = {
            type: attributeType,
            value: resolvedValue,
            definition: cloneDefinition(definition),
          };
        });

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

  function registerCameraFocusListener() {
    const editor = window.editor;
    if (
      !editor ||
      typeof editor.on !== "function" ||
      cameraFocusListenerRegistered
    ) {
      return;
    }

    cameraFocusListenerRegistered = true;

    const handleCameraFocus = () => {
      try {
        if (editor.call("selector:type") !== "entity") {
          return;
        }
        const selection = editor.call("selector:items") || [];
        if (!selection.length) {
          return;
        }
        const observer = selection[0];
        if (!observer || typeof observer.get !== "function") {
          return;
        }
        const entityGuid = observer.get("resource_id");
        if (!entityGuid) {
          return;
        }
        const entityName = observer.get("name");
        postGraphMessage("PC_GRAPH_EDITOR_FOCUS", {
          entityGuid,
          entityName,
        });
      } catch (error) {
        console.error("[GraphBridge] Failed to emit editor focus event", error);
      }
    };

    editor.on("camera:focus", handleCameraFocus);
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

  function handleFocusRequest(payload) {
    const editor = window.editor;
    if (!editor || !payload || !payload.entityGuid) {
      return;
    }

    const entity = editor.call("entities:get", payload.entityGuid);
    if (!entity) {
      console.warn(
        `[GraphBridge] Cannot focus entity: ${payload.entityGuid} not found`
      );
      return;
    }

    editor.call("selector:set", "entity", [entity]);
    setTimeout(() => {
      try {
        editor.call("viewport:focus");
      } catch (error) {
        console.error("[GraphBridge] Failed to focus viewport", error);
      }
    }, 0);
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

      registerCameraFocusListener();

      // Listen for scripts being added to the registry
      // Reference: assets-script-registry.ts - this event fires when data.scripts is fully parsed
      // Event signature: assets:scripts:add(asset, scriptName)
      // This is more reliable than assets:add because it only fires when the script is actually parsed and added to the registry
      editor.on("assets:scripts:add", (asset, scriptName) => {
        try {
          const assetId = asset.get("id");
          // Ensure map is initialized
          if (!scriptNameToAssetIdMap) {
            scriptNameToAssetIdMap = new Map();
          }
          // Update the map with this script
          scriptNameToAssetIdMap.set(scriptName, assetId);

          // Find all entities that use this script and re-broadcast their data
          // This ensures that entities that were serialized before the script was parsed
          // will get updated with the correct schema
          const allEntities = editor.call("entities:list") || [];
          allEntities.forEach((entity) => {
            try {
              const scriptComponent = entity.get("components.script");
              if (scriptComponent && scriptComponent.scripts) {
                // Check if this entity uses the script that was just added
                if (
                  Object.prototype.hasOwnProperty.call(
                    scriptComponent.scripts,
                    scriptName
                  )
                ) {
                  // Re-serialize and broadcast this entity's update
                  const serialized = serializeEntityData(entity);
                  if (serialized) {
                    postGraphMessage("PC_GRAPH_ENTITY_UPDATED", {
                      entity: serialized,
                    });
                  }
                }
              }
            } catch (error) {
              // Skip entities that can't be processed
            }
          });
        } catch (error) {
          console.error(
            "[GraphBridge] Error handling assets:scripts:add event:",
            error
          );
        }
      });

      // Listen for scripts being removed from the registry
      // Reference: assets-script-registry.ts - this event fires when script is removed
      // Event signature: assets:scripts:remove(asset, scriptName)
      editor.on("assets:scripts:remove", (asset, scriptName) => {
        try {
          const removedAssetId = asset.get("id");
          // Remove this script from the map if it maps to the removed asset
          if (scriptNameToAssetIdMap) {
            const currentAssetId = scriptNameToAssetIdMap.get(scriptName);
            if (currentAssetId === removedAssetId) {
              scriptNameToAssetIdMap.delete(scriptName);
            }
          }
        } catch (error) {
          console.error(
            "[GraphBridge] Error handling assets:scripts:remove event:",
            error
          );
        }
      });

      editor.on("entities:add", (entity) => {
        try {
          registerEntityWatcher(entity);
          const serialized = serializeEntityData(entity);
          if (serialized) {
            postGraphMessage("PC_GRAPH_ENTITY_ADDED", { entity: serialized });
          }
        } catch (error) {
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
          console.error("[GraphBridge] Failed to handle entity removal", error);
        }
      });

      // Now that we are ready, set up the selector watcher for live updates.
      editor.on("selector:change", () => {
        try {
          broadcastSelectionUpdate();
        } catch (error) {
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
    const { entityGuid, scriptName, attributeName } = payload || {};

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
    const nextValue = Object.prototype.hasOwnProperty.call(payload, "value")
      ? payload.value
      : payload?.targetEntityGuid ?? null;

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
          entity.set(path, nextValue);
        },
      });
    }

    // Apply the change immediately; history undo/redo callbacks handle symmetry
    entity.set(path, nextValue);
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

    if (type === "GRAPH_FOCUS_ENTITY") {
      try {
        handleFocusRequest(payload);
      } catch (e) {
        console.error("[GraphBridge] Failed to handle focus request:", e);
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
