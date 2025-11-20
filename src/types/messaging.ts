export type GraphNodeType = "entity" | "script"; // This might expand later

export interface ScriptAttributeDefinition {
  type: string;
  title?: string;
  description?: string;
  default?: any;
  placeholder?: string;
  enum?: { options?: Record<string, string | number | boolean> };
  options?: Record<string, any>;
  min?: number;
  max?: number;
  step?: number;
  visibleif?: unknown;
  array?: boolean;
  [key: string]: any;
}

export interface ScriptAttributePayload {
  type: string;
  value: any;
  definition?: ScriptAttributeDefinition;
}

export interface ComponentPayload {
  [key: string]: any;
  attributes?: Record<string, ScriptAttributePayload>;
}

export interface EntityPayload {
  guid: string;
  name: string;
  parentId: string | null;
  children: string[];
  components: Record<string, ComponentPayload>;
}

export interface SceneGraphPayload {
  rootGuid: string;
  entities: Record<string, EntityPayload>;
  selectedEntityName: string | null;
  projectId: number | string | null;
  sceneId: number | string | null;
  collapsedState?: Record<string, boolean>;
}

export interface UpdateAttributePayload {
  entityGuid: string;
  scriptName: string;
  attributeName: string;
  value: any;
}

export interface UpdateSelectionPayload {
  entityGuid: string | null;
  entityName?: string | null;
}

export interface GraphResponse {
  success: boolean;
  error?: string;
  data?: SceneGraphPayload;
}

export interface EntityMutationPayload {
  entity: EntityPayload;
}

export interface EntityRemovalPayload {
  guid: string;
}

export interface CollapseStateUpdatePayload {
  guid: string;
  collapsed: boolean;
}

export interface ReparentEntityPayload {
  entityGuid: string;
  newParentGuid: string | null;
  insertIndex?: number | null;
  preserveTransform?: boolean;
}

export type RuntimeMessage =
  | { type: "GRAPH_REQUEST_DATA" }
  | { type: "GRAPH_RESPONSE_DATA"; payload: SceneGraphPayload }
  | { type: "GRAPH_ERROR"; error: string }
  | { type: "GRAPH_PUSH_DATA"; payload: GraphResponse }
  | { type: "GRAPH_UPDATE_ATTRIBUTE"; payload: UpdateAttributePayload }
  | { type: "GRAPH_UPDATE_SELECTION"; payload: UpdateSelectionPayload }
  | { type: "GRAPH_SET_SELECTION"; payload: UpdateSelectionPayload }
  | { type: "GRAPH_ENTITY_ADDED"; payload: EntityMutationPayload }
  | { type: "GRAPH_ENTITY_UPDATED"; payload: EntityMutationPayload }
  | { type: "GRAPH_ENTITY_REMOVED"; payload: EntityRemovalPayload }
  | {
      type: "GRAPH_COLLAPSE_STATE_UPDATE";
      payload: CollapseStateUpdatePayload;
    }
  | {
      type: "GRAPH_SET_COLLAPSE_STATE";
      payload: CollapseStateUpdatePayload;
    }
  | { type: "GRAPH_REPARENT_ENTITY"; payload: ReparentEntityPayload };
