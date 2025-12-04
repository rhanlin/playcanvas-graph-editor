import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { WheelEvent } from "react";
import { Handle, Position } from "reactflow";
import "@playcanvas/pcui/styles";

import { useGraphEditorStore } from "@/stores/useGraphEditorStore";
import {
  stopReactFlowEvent,
  stopReactFlowEventWithPreventDefault,
  withStopPropagation,
} from "@/utils/events";
import type {
  EntityPayload,
  ScriptAttributeDefinition,
  ScriptAttributePayload,
} from "@/types/messaging";
import { FieldTooltip } from "./FieldTooltip";
import { cn } from "@/utils/cn";
import { Input } from "@/components/ui/Input";
import { findTypeHandler } from "./TypeHandlers";
import { evaluateVisibleIf } from "./utils/visibleIf";
import { getDefaultValueForSchemaField, parseArrayValue } from "./utils/schema";

type ScriptAttributesPanelProps = {
  entityGuid: string;
  scriptName: string;
  attributes?: Record<string, ScriptAttributePayload>;
};

export const ScriptAttributesPanel = memo(
  ({ entityGuid, scriptName, attributes = {} }: ScriptAttributesPanelProps) => {
    const updateScriptAttribute = useGraphEditorStore(
      (state) => state.updateScriptAttribute
    );
    const entities = useGraphEditorStore((state) => state.entities);

    // Filter and sort attributes based on visibleif conditions
    // This ensures that when attribute values change, visibleif conditions are re-evaluated
    const visibleAttributes = useMemo(() => {
      return Object.entries(attributes)
        .filter(([name, attribute]) => {
          if (!attribute) {
            return false;
          }
          // Evaluate visibleif condition - this will re-run when attributes change
          return evaluateVisibleIf(attribute.definition, attributes);
        })
        .sort(([aKey], [bKey]) => aKey.localeCompare(bKey));
    }, [attributes]);

    if (visibleAttributes.length === 0) {
      return (
        <p className="text-xs italic text-pc-text-dark">
          No script attributes detected for this script.
        </p>
      );
    }

    return (
      <div className="space-y-3">
        {visibleAttributes.map(([name, attribute]) => {
          if (!attribute) {
            return null;
          }
          return (
            <AttributeField
              key={name}
              attributeName={name}
              attribute={attribute}
              entityGuid={entityGuid}
              scriptName={scriptName}
              updateScriptAttribute={updateScriptAttribute}
              entities={entities}
            />
          );
        })}
      </div>
    );
  }
);
ScriptAttributesPanel.displayName = "ScriptAttributesPanel";

type AttributeFieldProps = {
  attributeName: string;
  attribute: ScriptAttributePayload;
  entityGuid: string;
  scriptName: string;
  updateScriptAttribute: (
    entityGuid: string,
    scriptName: string,
    attributeName: string,
    value: unknown
  ) => void;
  entities: Record<string, EntityPayload>;
};

const AttributeField = ({
  attributeName,
  attribute,
  entityGuid,
  scriptName,
  updateScriptAttribute,
  entities,
}: AttributeFieldProps) => {
  const { definition } = attribute;
  const label = definition?.title || attributeName;
  const description = definition?.description;

  const handleChange = (value: unknown) => {
    updateScriptAttribute(entityGuid, scriptName, attributeName, value);
  };

  return (
    <div className=" rounded-2xl border border-pc-border-primary/50 bg-pc-dark p-3 text-sm text-pc-text-primary">
      <div className="relative flex items-center justify-between gap-2">
        <div>
          <p className="font-semibold mb-1">{label}</p>
          {description ? (
            <p className="text-xs text-pc-text-dark">{description}</p>
          ) : null}
        </div>
        {definition?.placeholder ? (
          <span className="text-[10px] uppercase text-pc-text-dark">
            {definition.placeholder}
          </span>
        ) : null}

        {definition?.type === "entity" ? (
          <Handle
            type="source"
            position={Position.Right}
            id={attributeName}
            className="absolute -right-2 top-1/2 h-3 w-3 bg-pc-text-active"
            style={{ transform: "translateY(-50%)" }}
            onConnect={(params) => {}}
          />
        ) : null}
      </div>
      <div className="mt-3">
        <AttributeInput
          attribute={attribute}
          definition={definition}
          value={attribute.value}
          onChange={handleChange}
          entities={entities}
          entityGuid={entityGuid}
          attributeKey={attributeName}
        />
      </div>
    </div>
  );
};

type AttributeInputProps = {
  value: any;
  attribute: ScriptAttributePayload;
  definition?: ScriptAttributeDefinition;
  onChange: (value: unknown) => void;
  entities: Record<string, EntityPayload>;
  entityGuid: string;
  attributeKey: string;
  // Context for evaluating nested visibleif conditions
  parentContext?: Record<string, any>;
};

const AttributeInput = ({
  value,
  attribute,
  definition,
  onChange,
  entities,
  entityGuid,
  attributeKey,
  parentContext,
}: AttributeInputProps) => {
  const type = attribute.type || definition?.type || "string";

  // Try to find a matching type handler
  // For complex types (entity, asset, array, json, colorArray), we still use the old logic below
  const handler = findTypeHandler({
    type,
    definition,
    value,
    attributeKey,
  });

  // If handler exists and returns a valid component (not null), use it
  if (handler) {
    const rendered = handler.render({
      type,
      value,
      definition,
      onChange,
      entities,
      entityGuid,
      attributeKey,
      useState,
      useEffect,
      useLayoutEffect,
      useMemo,
      useCallback,
      useRef,
    });

    // If handler returned null, it means it needs special handling (e.g., ColorArrayField, ArrayField)
    // Fall through to the old logic below
    if (rendered !== null) {
      return <>{rendered}</>;
    }
  }

  // Handle array types (both "array" and "json" with array: true)
  if (type === "array" || (type === "json" && definition?.array === true)) {
    const list = Array.isArray(value) ? value : [];
    return (
      <ArrayField
        current={list}
        onChange={onChange}
        definition={definition}
        entities={entities}
        entityGuid={entityGuid}
      />
    );
  }

  // Handle non-array json/object types
  if (type === "json" || type === "object") {
    return (
      <textarea
        value={JSON.stringify(value ?? {}, null, 2)}
        onPointerDownCapture={stopReactFlowEvent}
        onChange={(event) => {
          try {
            const parsed = JSON.parse(event.target.value);
            onChange(parsed);
          } catch {
            // ignore parse errors until valid
          }
        }}
        className="min-h-[120px] w-full rounded-xl border border-pc-border-primary bg-pc-darkest px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-pc-text-active"
      />
    );
  }

  // string fallback - use unified Input component
  return (
    <Input
      type="text"
      value={value ?? ""}
      placeholder={definition?.placeholder}
      onChange={onChange}
      className="w-full"
    />
  );
};

// VectorField has been moved to type-handlers.tsx

// Component to render a single object in an array:json field
type JsonObjectFieldProps = {
  value: Record<string, any>;
  schema: NonNullable<ScriptAttributeDefinition["schema"]>;
  onChange: (next: Record<string, any>) => void;
  entities?: Record<string, EntityPayload>;
  entityGuid?: string;
  // Context for evaluating visibleif - the current object's values
  context?: Record<string, any>;
};

const JsonObjectField = ({
  value,
  schema,
  onChange,
  entities,
  entityGuid,
  context,
}: JsonObjectFieldProps) => {
  const handleFieldChange = (fieldName: string, fieldValue: any) => {
    onChange({
      ...value,
      [fieldName]: fieldValue,
    });
  };

  // Filter schema fields based on visibleif conditions
  // Use the current object's values as context for evaluation
  const evaluationContext = context || value;
  const visibleFields = useMemo(() => {
    return schema.filter((field) => {
      // Convert schema fields to attribute format for evaluation
      const attributesForContext: Record<string, ScriptAttributePayload> = {};
      schema.forEach((f) => {
        attributesForContext[f.name] = {
          type: f.type,
          value:
            evaluationContext?.[f.name] ?? getDefaultValueForSchemaField(f),
          definition: f,
        };
      });
      return evaluateVisibleIf(field, attributesForContext);
    });
  }, [schema, evaluationContext]);

  return (
    <div className="space-y-3 rounded-xl border border-pc-border-primary/50 bg-pc-dark p-3">
      {visibleFields.map((field) => {
        const fieldValue =
          value?.[field.name] ?? getDefaultValueForSchemaField(field);
        const fieldLabel = field.title || field.name;
        const fieldDescription = field.description;

        return (
          <div key={field.name} className="space-y-1">
            <FieldTooltip
              label={fieldLabel}
              description={fieldDescription}
              placement="right"
            >
              <p className="w-full text-xs font-semibold text-pc-text-primary">
                {fieldLabel}
              </p>
            </FieldTooltip>
            {entities && entityGuid ? (
              <AttributeInput
                value={fieldValue}
                attribute={{
                  type: field.type,
                  value: fieldValue,
                  definition: field,
                }}
                definition={field}
                onChange={(next) => handleFieldChange(field.name, next)}
                entities={entities}
                entityGuid={entityGuid}
                attributeKey={field.name}
                // Pass context for nested visibleif evaluation
                parentContext={evaluationContext}
              />
            ) : (
              <div className="text-xs text-pc-text-dark">
                Entity context required for editing
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

type ArrayFieldProps = {
  current: unknown[];
  onChange: (next: unknown[]) => void;
  definition?: ScriptAttributeDefinition;
  entities?: Record<string, EntityPayload>;
  entityGuid?: string;
  updateScriptAttribute?: (
    entityGuid: string,
    scriptName: string,
    attributeName: string,
    value: any
  ) => void;
  scriptName?: string;
};

const ArrayField = ({
  current,
  onChange,
  definition,
  entities,
  entityGuid,
}: ArrayFieldProps) => {
  const hasSchema =
    definition?.schema &&
    Array.isArray(definition.schema) &&
    definition.schema.length > 0;

  const [collapsedItems, setCollapsedItems] = useState<Set<number>>(() => {
    const set = new Set<number>();
    // First item (index 0) is expanded by default, others are collapsed
    for (let i = 1; i < current.length; i++) {
      set.add(i);
    }
    return set;
  });

  useEffect(() => {
    setCollapsedItems((prev) => {
      const next = new Set(prev);
      for (let i = 0; i < current.length; i++) {
        if (!prev.has(i) && i !== 0) {
          next.add(i);
        }
      }
      for (const idx of prev) {
        if (idx >= current.length) {
          next.delete(idx);
        }
      }
      return next;
    });
  }, [current.length]);

  const toggleItem = (index: number) => {
    setCollapsedItems((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleItemChange = (index: number, next: unknown) => {
    const nextValues = [...current];
    nextValues[index] = next;
    onChange(nextValues);
  };

  const addItem = () => {
    if (hasSchema) {
      // Create a new object with default values from schema
      const newObject: Record<string, any> = {};
      definition.schema!.forEach((field) => {
        newObject[field.name] = getDefaultValueForSchemaField(field);
      });
      onChange([...current, newObject]);
    } else {
      // Simple array, add empty string
      onChange([...current, ""]);
    }
  };

  const removeItem = (index: number) => {
    const next = current.filter((_, idx) => idx !== index);
    onChange(next);
    setCollapsedItems((prev) => {
      const next = new Set(prev);
      next.delete(index);
      const shifted = new Set<number>();
      for (const idx of next) {
        if (idx < index) {
          shifted.add(idx);
        } else if (idx > index) {
          shifted.add(idx - 1);
        }
      }
      return shifted;
    });
  };

  const getItemPreview = (objValue: Record<string, any>): string => {
    if (!hasSchema || !definition.schema) return "";
    const firstField = definition.schema[0];
    if (!firstField) return "";
    const firstValue = objValue[firstField.name];
    if (firstValue === null || firstValue === undefined || firstValue === "") {
      return "Empty";
    }
    if (typeof firstValue === "string") {
      return firstValue.length > 30
        ? firstValue.substring(0, 30) + "..."
        : firstValue;
    }
    if (typeof firstValue === "number" || typeof firstValue === "boolean") {
      return String(firstValue);
    }
    if (typeof firstValue === "object") {
      return JSON.stringify(firstValue).substring(0, 30) + "...";
    }
    return String(firstValue);
  };

  if (hasSchema) {
    return (
      <div className="space-y-2">
        {current.map((entry, index) => {
          const objValue =
            typeof entry === "object" && entry !== null && !Array.isArray(entry)
              ? (entry as Record<string, any>)
              : {};

          const isCollapsed = collapsedItems.has(index);
          const preview = getItemPreview(objValue);
          const firstFieldName =
            definition.schema?.[0]?.title || definition.schema?.[0]?.name || "";

          return (
            <div
              key={`${index}-${JSON.stringify(entry)}`}
              className="rounded-lg border border-pc-border-primary/50 bg-pc-dark overflow-hidden"
            >
              {/* Collapsible header */}
              <div className="flex items-center justify-between px-3 py-2 hover:bg-pc-darkest transition-colors">
                <button
                  type="button"
                  onPointerDownCapture={stopReactFlowEventWithPreventDefault}
                  onMouseUpCapture={stopReactFlowEventWithPreventDefault}
                  onClick={withStopPropagation(() => toggleItem(index))}
                  className="flex items-center gap-2 flex-1 text-left group"
                >
                  <span
                    className={cn(
                      "text-xs transition-transform",
                      isCollapsed ? "rotate-0" : "rotate-90"
                    )}
                  >
                    ▾
                  </span>
                  <span className="text-xs font-semibold text-pc-text-secondary">
                    {index + 1}.
                  </span>
                  {preview && (
                    <span className="text-xs text-pc-text-dark">
                      {firstFieldName && `${firstFieldName}: `}
                      {preview}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onPointerDownCapture={stopReactFlowEventWithPreventDefault}
                  onMouseUpCapture={stopReactFlowEventWithPreventDefault}
                  onClick={withStopPropagation(() => removeItem(index))}
                  className="rounded-lg border border-pc-border-primary/60 px-2 py-1 text-xs text-pc-text-secondary hover:border-pc-error hover:text-pc-error transition-colors"
                >
                  Remove
                </button>
              </div>
              {/* Expandable content */}
              {!isCollapsed && (
                <div className="px-3 pb-3 pt-2">
                  <JsonObjectField
                    value={objValue}
                    schema={definition.schema!}
                    onChange={(next) => handleItemChange(index, next)}
                    entities={entities}
                    entityGuid={entityGuid}
                    context={objValue}
                  />
                </div>
              )}
            </div>
          );
        })}
        <button
          type="button"
          onPointerDownCapture={stopReactFlowEventWithPreventDefault}
          onMouseUpCapture={stopReactFlowEventWithPreventDefault}
          onClick={withStopPropagation(addItem)}
          className="w-full rounded-lg border border-dashed border-pc-border-primary/60 px-3 py-2 text-sm text-pc-text-secondary hover:border-pc-text-active transition-colors"
        >
          + Add Item
        </button>
      </div>
    );
  }

  // Render simple array (fallback to original behavior)
  return (
    <div className="space-y-2">
      {current.map((entry, index) => (
        <div
          key={`${index}-${String(entry)}`}
          className="flex items-center gap-2"
        >
          <Input
            type="text"
            value={String(entry ?? "")}
            onChange={(val) => {
              const parsed = parseArrayValue(String(val));
              handleItemChange(index, parsed);
            }}
            className="flex-1"
          />
          <button
            type="button"
            onPointerDownCapture={stopReactFlowEventWithPreventDefault}
            onMouseUpCapture={stopReactFlowEventWithPreventDefault}
            onClick={withStopPropagation(() => removeItem(index))}
            className="rounded-lg border border-pc-border-primary/60 px-2 py-1 text-xs text-pc-text-secondary hover:border-pc-error hover:text-pc-error"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onPointerDownCapture={stopReactFlowEventWithPreventDefault}
        onMouseUpCapture={stopReactFlowEventWithPreventDefault}
        onClick={withStopPropagation(addItem)}
        className="w-full rounded-lg border border-dashed border-pc-border-primary/60 px-3 py-2 text-sm text-pc-text-secondary hover:border-pc-text-active"
      >
        + Add Item
      </button>
    </div>
  );
};
