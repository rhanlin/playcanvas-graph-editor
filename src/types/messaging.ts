export type GraphNodeType = "entity" | "script"; // This might expand later

export interface ComponentPayload {
  [key: string]: any;
  attributes?: Record<string, { type: string; value: any }>;
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
}

export interface UpdateAttributePayload {
  entityGuid: string;
  scriptName: string;
  attributeName: string;
  targetEntityGuid: string | null; // null to clear the attribute
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
  | { type: "GRAPH_ENTITY_REMOVED"; payload: EntityRemovalPayload };
