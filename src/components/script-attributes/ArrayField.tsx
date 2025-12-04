import { useEffect, useState } from "react";
import type {
  EntityPayload,
  ScriptAttributeDefinition,
} from "@/types/messaging";
import {
  stopReactFlowEventWithPreventDefault,
  withStopPropagation,
} from "@/utils/events";
import { cn } from "@/utils/cn";
import { Input } from "@/components/ui/Input";
import { getDefaultValueForSchemaField, parseArrayValue } from "./utils/schema";
import { JsonObjectField } from "./JsonObjectField";
import type { AttributeInputProps } from "./ScriptAttributesPanel";

type ArrayFieldProps = {
  current: unknown[];
  onChange: (next: unknown[]) => void;
  definition?: ScriptAttributeDefinition;
  entities?: Record<string, EntityPayload>;
  entityGuid?: string;
  // AttributeInput component to render nested fields
  AttributeInput: React.ComponentType<AttributeInputProps>;
};

export const ArrayField = ({
  current,
  onChange,
  definition,
  entities,
  entityGuid,
  AttributeInput,
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
                    AttributeInput={AttributeInput}
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

