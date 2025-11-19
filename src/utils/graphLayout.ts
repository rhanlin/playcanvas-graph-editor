import type { Edge, Node, XYPosition } from "reactflow";

import type { EntityPayload, SceneGraphPayload } from "@/types/messaging";

export interface PositionOverride {
  x: number;
  y: number;
  parentId: string | null;
}

export interface BuildLayoutOptions {
  payload: SceneGraphPayload;
  manualPositions: Record<string, PositionOverride>;
  collapsedState: Record<string, boolean>;
  projectId?: number | string | null;
  sceneId?: number | string | null;
}

interface EntityLayoutInfo {
  width: number;
  height: number;
  childOrder: string[];
  childSizes: Record<string, { width: number; height: number }>;
  scriptCount: number;
}

const ENTITY_MIN_WIDTH = 340;
const ENTITY_HEADER_HEIGHT = 76;
const ENTITY_PADDING = 24;
const SECTION_GAP = 24;
const CHILD_VERTICAL_GAP = 24;
const SCRIPT_VERTICAL_GAP = 12;
const SCRIPT_NODE_WIDTH = 280;
const SCRIPT_NODE_HEIGHT = 84;

const ROOT_COLUMN_GAP = 120;
const ROOT_ROW_GAP = 80;

export function buildGraphLayout({
  payload,
  manualPositions,
  collapsedState,
}: BuildLayoutOptions): { nodes: Node[]; edges: Edge[] } {
  const entities = payload.entities;
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const layoutInfoCache = new Map<string, EntityLayoutInfo>();
  const rootGuid = payload.rootGuid;

  const computeLayoutInfo = (guid: string): EntityLayoutInfo => {
    if (layoutInfoCache.has(guid)) {
      return layoutInfoCache.get(guid)!;
    }

    const entity = entities[guid];
    if (!entity) {
      const fallback: EntityLayoutInfo = {
        width: ENTITY_MIN_WIDTH,
        height: ENTITY_HEADER_HEIGHT + ENTITY_PADDING * 2,
        childOrder: [],
        childSizes: {},
        scriptCount: 0,
      };
      layoutInfoCache.set(guid, fallback);
      return fallback;
    }

    const scriptComponent = entity.components?.script;
    const scriptEntries = scriptComponent?.scripts
      ? Object.entries(scriptComponent.scripts)
      : [];

    const scriptSectionHeight = scriptEntries.length
      ? scriptEntries.length * SCRIPT_NODE_HEIGHT +
        (scriptEntries.length - 1) * SCRIPT_VERTICAL_GAP
      : 0;

    const childOrder: string[] = [];
    const childSizes: Record<string, { width: number; height: number }> = {};
    let childSectionHeight = 0;
    let childMaxWidth = 0;

    if (guid !== rootGuid) {
      entity.children.forEach((childGuid, index) => {
        const child = entities[childGuid];
        if (!child) {
          return;
        }
        childOrder.push(childGuid);
        const childInfo = computeLayoutInfo(childGuid);
        childSizes[childGuid] = {
          width: childInfo.width,
          height: childInfo.height,
        };
        childMaxWidth = Math.max(childMaxWidth, childInfo.width);
        childSectionHeight += childInfo.height;
        if (index < entity.children.length - 1) {
          childSectionHeight += CHILD_VERTICAL_GAP;
        }
      });
    }

    const paddingWidth = Math.max(
      childMaxWidth + ENTITY_PADDING * 2,
      SCRIPT_NODE_WIDTH + ENTITY_PADDING * 2
    );

    const collapsed = !!collapsedState[guid];
    const dynamicHeight = collapsed
      ? 0
      : scriptSectionHeight +
        (scriptSectionHeight > 0 && childSectionHeight > 0 ? SECTION_GAP : 0) +
        childSectionHeight;

    const height =
      ENTITY_HEADER_HEIGHT +
      ENTITY_PADDING * 2 +
      dynamicHeight +
      (dynamicHeight > 0 ? SECTION_GAP : 0);

    const layoutInfo: EntityLayoutInfo = {
      width: Math.max(ENTITY_MIN_WIDTH, paddingWidth),
      height,
      childOrder,
      childSizes,
      scriptCount: scriptEntries.length,
    };
    layoutInfoCache.set(guid, layoutInfo);
    return layoutInfo;
  };

  Object.keys(entities).forEach((guid) => computeLayoutInfo(guid));
  const topLevelEntities = Object.values(entities).filter(
    (entity) => !entity.parentId || entity.parentId === rootGuid
  );

  const columnCount = Math.max(
    1,
    Math.ceil(Math.sqrt(Math.max(1, topLevelEntities.length)))
  );
  const columnWidth = ENTITY_MIN_WIDTH + 300;

  let currentRowY = 0;
  let currentCol = 0;
  let nextRowY = 0;

  const getStoredPosition = (
    id: string,
    parentId: string | null,
    fallback: XYPosition
  ): XYPosition => {
    const stored = manualPositions[id];
    if (stored && stored.parentId === parentId) {
      return { x: stored.x, y: stored.y };
    }
    return fallback;
  };

  const scriptEdgesMap: Edge[] = [];

  const buildSubtree = (
    guid: string,
    parentId: string | null,
    defaultPosition: XYPosition
  ) => {
    const entity = entities[guid];
    if (!entity) {
      return;
    }
    const layout = layoutInfoCache.get(guid)!;
    const collapsed = !!collapsedState[guid];
    const position = getStoredPosition(guid, parentId, defaultPosition);

    const entityNode: Node = {
      id: guid,
      type: "entity",
      data: {
        label: entity.name,
        childrenCount: entity.children.length,
        collapsed,
      },
      position,
      parentNode: parentId ?? undefined,
      draggable: true,
      extent: parentId ? "parent" : undefined,
      style: {
        width: layout.width,
        height: layout.height,
      },
    };

    nodes.push(entityNode);

    if (collapsed) {
      return;
    }

    let contentY = ENTITY_HEADER_HEIGHT + SECTION_GAP;

    const scriptComponent = entity.components?.script;
    const scriptEntries = scriptComponent?.scripts
      ? Object.entries(scriptComponent.scripts)
      : [];

    scriptEntries.forEach(([scriptName, scriptDataRaw], index) => {
      const scriptNodeId = `${guid}-${scriptName}`;
      const defaultScriptPosition: XYPosition = {
        x: ENTITY_PADDING,
        y: contentY,
      };
      const scriptPosition = getStoredPosition(
        scriptNodeId,
        guid,
        defaultScriptPosition
      );

      const scriptData = scriptDataRaw as {
        attributes?: Record<string, { type: string; value: any }>;
      };

      nodes.push({
        id: scriptNodeId,
        type: "script",
        parentNode: guid,
        draggable: true,
        extent: "parent",
        position: scriptPosition,
        style: {
          width: SCRIPT_NODE_WIDTH,
          height: SCRIPT_NODE_HEIGHT,
        },
        data: {
          label: scriptName,
          scriptName,
          attributes: scriptData.attributes || {},
        },
      });

      if (scriptData.attributes) {
        Object.entries(scriptData.attributes).forEach(
          ([attributeName, attrDataRaw]) => {
            const attr = attrDataRaw as { type?: string; value?: any };
            if (attr.type === "entity" && attr.value) {
              const targetGuid = String(attr.value);
              if (!entities[targetGuid]) {
                return;
              }
              scriptEdgesMap.push({
                id: `${scriptNodeId}-${attributeName}-${targetGuid}`,
                source: scriptNodeId,
                sourceHandle: attributeName,
                target: targetGuid,
                type: "smoothstep",
                animated: true,
                style: { stroke: "#ec4899", strokeWidth: 2 },
              });
            }
          }
        );
      }

      contentY += SCRIPT_NODE_HEIGHT;
      if (index < scriptEntries.length - 1) {
        contentY += SCRIPT_VERTICAL_GAP;
      }
    });

    if (scriptEntries.length > 0 && layout.childOrder.length > 0) {
      contentY += SECTION_GAP;
    }

    if (guid === rootGuid) {
      return;
    }

    layout.childOrder.forEach((childGuid, index) => {
      const childSize = layout.childSizes[childGuid];
      const childDefaultPos: XYPosition = {
        x: ENTITY_PADDING,
        y: contentY,
      };
      buildSubtree(childGuid, guid, childDefaultPos);
      contentY += childSize.height;
      if (index < layout.childOrder.length - 1) {
        contentY += CHILD_VERTICAL_GAP;
      }
    });
  };

  topLevelEntities.forEach((entity, index) => {
    const layout = layoutInfoCache.get(entity.guid)!;
    if (currentCol >= columnCount) {
      currentCol = 0;
      currentRowY = nextRowY;
    }
    const defaultTopPosition: XYPosition = {
      x: currentCol * (columnWidth + ROOT_COLUMN_GAP),
      y: currentRowY,
    };
    const position = getStoredPosition(entity.guid, null, defaultTopPosition);

    buildSubtree(entity.guid, null, position);

    currentCol += 1;
    nextRowY = Math.max(nextRowY, currentRowY + layout.height + ROOT_ROW_GAP);
  });

  edges.push(...scriptEdgesMap);

  return { nodes, edges };
}
