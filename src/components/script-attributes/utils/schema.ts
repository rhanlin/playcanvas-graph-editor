import type { ScriptAttributeDefinition } from "@/types/messaging";

/**
 * Get default value for a schema field based on its type
 */
export const getDefaultValueForSchemaField = (
  field: NonNullable<ScriptAttributeDefinition["schema"]>[0]
): any => {
  if (field.default !== undefined) {
    return field.default;
  }
  switch (field.type) {
    case "number":
      return 0;
    case "boolean":
      return false;
    case "string":
      return "";
    case "entity":
      return null;
    case "vec2":
      return [0, 0];
    case "vec3":
      return [0, 0, 0];
    case "vec4":
      return [0, 0, 0, 0];
    default:
      return null;
  }
};

/**
 * Parse array value from string input
 */
export const parseArrayValue = (raw: string) => {
  if (raw === "") {
    return "";
  }
  if (!Number.isNaN(Number(raw))) {
    return Number(raw);
  }
  if (raw === "true") return true;
  if (raw === "false") return false;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

