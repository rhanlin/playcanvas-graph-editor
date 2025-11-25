import React, {
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
import { evaluate } from "@/utils/expr-eval";
import { Input } from "@/components/ui/Input";
import { Slider } from "@/components/ui/Slider";

type ScriptAttributesPanelProps = {
  entityGuid: string;
  scriptName: string;
  attributes?: Record<string, ScriptAttributePayload>;
};

const AXIS_LABELS = ["X", "Y", "Z", "W"];

const ensureVector = (value: unknown, size: number): number[] => {
  if (Array.isArray(value)) {
    const next = value.slice(0, size).map((v) => Number(v) || 0);
    while (next.length < size) {
      next.push(0);
    }
    return next;
  }
  return Array.from({ length: size }, () => 0);
};

/**
 * Evaluates a visibleif condition for script attributes.
 * Supports multiple formats:
 * 1. String expressions (e.g., "someAttribute === true", "value > 5")
 * 2. Array of condition objects with lhs, rhs, operator
 * 3. Object with key-value pairs (simple equality checks)
 *
 * This mirrors the behavior of the native PlayCanvas Editor's visibleif evaluation.
 */
const evaluateVisibleIf = (
  definition: ScriptAttributeDefinition | undefined,
  attributes: Record<string, ScriptAttributePayload> | undefined
): boolean => {
  if (!definition?.visibleif) {
    return true;
  }

  const visibleIf = definition.visibleif;
  const values =
    attributes &&
    Object.fromEntries(
      Object.entries(attributes).map(([key, attr]) => [key, attr?.value])
    );

  // Handle string expressions (e.g., "someAttribute === true")
  if (typeof visibleIf === "string") {
    return evaluateStringExpression(visibleIf, values);
  }

  // Handle array of conditions
  if (Array.isArray(visibleIf)) {
    return visibleIf.every((cond) => evaluateSingleCondition(cond, values));
  }

  // Handle object with key-value pairs (simple equality checks)
  if (typeof visibleIf === "object" && visibleIf !== null) {
    return Object.entries(visibleIf).every(([key, expected]) => {
      return values && values[key] === expected;
    });
  }

  return true;
};

/**
 * Evaluates a string expression using the same parser as native PlayCanvas Editor.
 * This ensures 100% compatibility with Editor's visibleif/enabledif expressions.
 */
const evaluateStringExpression = (
  expression: string,
  values: Record<string, unknown> | undefined
): boolean => {
  if (!values || !expression.trim()) {
    return true;
  }

  try {
    // Create evaluation context with attribute values
    // Include null, undefined, true, false as they are commonly used in expressions
    const context: Record<string, unknown> = {
      ...values,
      null: null,
      undefined: undefined,
      true: true,
      false: false,
    };

    // Use the same parse and evaluate functions as native Editor
    const result = evaluate(expression, context);
    return !!result;
  } catch (error) {
    console.warn(
      `[ScriptAttributesPanel] Failed to evaluate visibleif expression: "${expression}"`,
      error
    );
    // On error, default to visible (fail-safe)
    return true;
  }
};

/**
 * Evaluates a single condition object with lhs, rhs, and operator.
 */
const evaluateSingleCondition = (
  condition: any,
  values: Record<string, unknown> | undefined
): boolean => {
  if (!condition) {
    return true;
  }

  // If condition is a string, treat it as an expression
  if (typeof condition === "string") {
    return evaluateStringExpression(condition, values);
  }

  // Handle condition object format
  const { lhs, rhs, operator = "==" } = condition;
  if (!values || !(lhs in values)) {
    return false;
  }

  const leftValue = values[lhs];
  switch (operator) {
    case "==":
    case "===":
      return leftValue === rhs;
    case "!=":
    case "!==":
      return leftValue !== rhs;
    case ">":
      return Number(leftValue) > Number(rhs);
    case ">=":
      return Number(leftValue) >= Number(rhs);
    case "<":
      return Number(leftValue) < Number(rhs);
    case "<=":
      return Number(leftValue) <= Number(rhs);
    default:
      return true;
  }
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
  const [isEntityPickerOpen, setEntityPickerOpen] = useState(false);
  const [entityQuery, setEntityQuery] = useState("");
  const pickerAnchorRef = useRef<HTMLDivElement | null>(null);
  const pickerPanelRef = useRef<HTMLDivElement | null>(null);
  const searchButtonRef = useRef<HTMLButtonElement | null>(null);
  const [popupPlacement, setPopupPlacement] = useState<
    "right" | "left" | "bottom"
  >("bottom");
  const stopWheelPropagation = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      stopReactFlowEvent(event);
    },
    []
  );
  const focusEntity = useGraphEditorStore((state) => state.focusEntity);
  const entityMatches = useMemo(() => {
    if (type !== "entity") {
      return [];
    }
    const normalizedQuery = entityQuery.trim().toLowerCase();
    return Object.values(entities)
      .filter((candidate) => candidate.guid !== entityGuid)
      .filter((candidate) => {
        if (!normalizedQuery) {
          return true;
        }
        const name = (candidate.name || "").toLowerCase();
        return (
          name.includes(normalizedQuery) ||
          candidate.guid.toLowerCase().includes(normalizedQuery)
        );
      })
      .slice(0, 10);
  }, [type, entityQuery, entities, entityGuid]);

  useEffect(() => {
    if (type !== "entity" || !isEntityPickerOpen) {
      return;
    }

    const closePicker = () => {
      setEntityPickerOpen(false);
      setEntityQuery("");
    };

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedInsidePopup =
        !!pickerPanelRef.current &&
        pickerPanelRef.current.contains(target as Node);
      const clickedAnchor =
        !!pickerAnchorRef.current &&
        pickerAnchorRef.current.contains(target as Node);
      if (!clickedInsidePopup && !clickedAnchor) {
        closePicker();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePicker();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [type, isEntityPickerOpen]);

  useLayoutEffect(() => {
    if (type !== "entity" || !isEntityPickerOpen) {
      return;
    }

    const POPUP_WIDTH = 288;
    const POPUP_MARGIN = 16;

    const updatePlacement = () => {
      const button = searchButtonRef.current;
      if (!button) {
        setPopupPlacement("bottom");
        return;
      }

      const rect = button.getBoundingClientRect();
      const availableRight = window.innerWidth - rect.right;
      const availableLeft = rect.left;

      if (availableRight >= POPUP_WIDTH + POPUP_MARGIN) {
        setPopupPlacement("right");
      } else if (availableLeft >= POPUP_WIDTH + POPUP_MARGIN) {
        setPopupPlacement("left");
      } else {
        setPopupPlacement("bottom");
      }
    };

    updatePlacement();
    window.addEventListener("resize", updatePlacement);
    return () => {
      window.removeEventListener("resize", updatePlacement);
    };
  }, [type, isEntityPickerOpen]);

  const popupPlacementClass = useMemo(() => {
    switch (popupPlacement) {
      case "right":
        return "left-full top-0 ml-3";
      case "left":
        return "right-full top-0 mr-3";
      default:
        return "left-1/2 top-full mt-2 -translate-x-1/2";
    }
  }, [popupPlacement]);

  if (type === "boolean") {
    return (
      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={!!value}
          onPointerDownCapture={stopReactFlowEvent}
          onChange={(event) => onChange(event.target.checked)}
          className="h-4 w-4 accent-pc-text-active"
        />
        <span className="text-pc-text-secondary">
          {definition?.placeholder || "Toggle"}
        </span>
      </label>
    );
  }

  if (type === "number") {
    const hasRange =
      typeof definition?.min === "number" &&
      typeof definition?.max === "number";
    return (
      <div className="space-y-2">
        {hasRange &&
        typeof definition.min === "number" &&
        typeof definition.max === "number" ? (
          <Slider
            min={definition.min}
            max={definition.max}
            step={definition?.step || 1}
            value={typeof value === "number" ? value : definition.min || 0}
            onChange={(val) => onChange(val)}
          />
        ) : null}
        <Input
          type="number"
          value={value ?? ""}
          onChange={(val) => onChange(Number(val))}
          className="w-full"
        />
      </div>
    );
  }

  if (type.startsWith("vec")) {
    const size = Number(type.replace("vec", "")) || 3;
    return (
      <VectorField
        size={size as 2 | 3 | 4}
        value={ensureVector(value, size)}
        onChange={onChange}
        definition={definition}
      />
    );
  }

  if (type === "entity") {
    const currentId = value ? String(value) : "";
    const currentEntity = currentId ? entities[currentId] : undefined;

    return (
      <div className="rounded-xl border border-dashed border-pc-border-primary/60 bg-pc-dark/60 px-3 py-3 text-xs">
        <div className="flex flex-col gap-2 justify-between">
          <div>
            <p className="text-sm font-semibold text-pc-text-secondary">
              {currentId
                ? "Linked to: " + (currentEntity?.name || currentId)
                : "No entity linked"}
            </p>
            <p className="text-pc-text-dark">
              Drag from the connector or search to pick a target entity.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative inline-flex" ref={pickerAnchorRef}>
              <button
                type="button"
                ref={searchButtonRef}
                onPointerDownCapture={stopReactFlowEventWithPreventDefault}
                onMouseUpCapture={stopReactFlowEventWithPreventDefault}
                onClick={withStopPropagation(() =>
                  setEntityPickerOpen((open) => !open)
                )}
                className="rounded-md border border-pc-border-primary/60 px-2 py-1 font-semibold text-pc-text-secondary hover:border-pc-text-active hover:text-pc-text-active"
              >
                {isEntityPickerOpen ? "Close" : "Search"}
              </button>
              {isEntityPickerOpen ? (
                <div
                  ref={pickerPanelRef}
                  className={cn(
                    "nodrag absolute z-40 w-72 rounded-2xl border border-pc-border-primary/70 bg-pc-darkest/95 p-3 shadow-2xl backdrop-blur",
                    popupPlacementClass
                  )}
                  onPointerDownCapture={stopReactFlowEvent}
                  onMouseDown={stopReactFlowEvent}
                  onWheel={stopWheelPropagation}
                  onWheelCapture={stopWheelPropagation}
                >
                  <div className="space-y-3">
                    <Input
                      type="text"
                      value={entityQuery}
                      autoFocus
                      onChange={(val) => setEntityQuery(String(val))}
                      placeholder="Search entity by name"
                      deferUpdate={false}
                      className="w-full text-pc-text-primary"
                    />
                    <div
                      className="max-h-60 overflow-y-scroll overscroll-contain rounded-xl border border-pc-border-primary/30"
                      onMouseDown={stopReactFlowEvent}
                      onWheel={stopWheelPropagation}
                      onWheelCapture={stopWheelPropagation}
                    >
                      {entityMatches.length ? (
                        entityMatches.map((candidate) => {
                          const isActive = candidate.guid === currentId;
                          const displayName =
                            candidate.name || "(Unnamed entity)";
                          return (
                            <button
                              type="button"
                              key={candidate.guid}
                              onPointerDownCapture={
                                stopReactFlowEventWithPreventDefault
                              }
                              onMouseUpCapture={
                                stopReactFlowEventWithPreventDefault
                              }
                              onClick={withStopPropagation(() => {
                                onChange(candidate.guid);
                                setEntityPickerOpen(false);
                                setEntityQuery("");
                              })}
                              className={cn(
                                "flex w-full items-center justify-between px-3 py-2 text-left text-sm transition",
                                isActive
                                  ? "bg-pc-text-active/10 text-pc-text-primary font-semibold"
                                  : "text-pc-text-primary hover:bg-pc-dark"
                              )}
                            >
                              <span className="truncate pr-2">
                                {displayName}
                              </span>
                              {isActive ? (
                                <span className="text-[10px] uppercase text-pc-text-active">
                                  Linked
                                </span>
                              ) : null}
                            </button>
                          );
                        })
                      ) : (
                        <p className="py-4 text-center text-xs text-pc-text-dark">
                          No entities found.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
            {currentId && (
              <>
                <button
                  type="button"
                  disabled={!currentId}
                  onPointerDownCapture={stopReactFlowEventWithPreventDefault}
                  onMouseUpCapture={stopReactFlowEventWithPreventDefault}
                  onClick={withStopPropagation(() => {
                    if (currentId) {
                      focusEntity(currentId);
                    }
                  })}
                  className={cn(
                    "rounded-md border px-2 py-1 font-semibold transition",
                    currentId
                      ? "border-pc-border-primary/60 text-pc-text-secondary hover:border-pc-text-active hover:text-pc-text-active"
                      : "cursor-not-allowed border-pc-border-primary/30 text-pc-text-dark"
                  )}
                >
                  Focus
                </button>
                <button
                  type="button"
                  onPointerDownCapture={stopReactFlowEventWithPreventDefault}
                  onMouseUpCapture={stopReactFlowEventWithPreventDefault}
                  onClick={withStopPropagation(() => {
                    onChange(null);
                    setEntityPickerOpen(false);
                    setEntityQuery("");
                  })}
                  className="rounded-md border border-pc-border-primary/60 px-2 py-1 font-semibold text-pc-text-secondary hover-border-pc-error hover:text-pc-error"
                >
                  Clear
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (definition?.enum?.options) {
    const options = definition.enum.options;
    return (
      <select
        value={value ?? ""}
        onPointerDownCapture={stopReactFlowEvent}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-pc-border-primary bg-pc-darkest px-3 py-2 text-sm text-pc-text-primary outline-none focus:ring-2 focus:ring-pc-text-active"
      >
        {Object.entries(options).map(([label, val]) => (
          <option key={label} value={String(val)}>
            {label}
          </option>
        ))}
      </select>
    );
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

type VectorFieldProps = {
  size: 2 | 3 | 4;
  value: number[];
  definition?: ScriptAttributeDefinition;
  onChange: (next: number[]) => void;
};

const VectorField = ({
  size,
  value,
  definition,
  onChange,
}: VectorFieldProps) => {
  const min = typeof definition?.min === "number" ? definition.min : undefined;
  const max = typeof definition?.max === "number" ? definition.max : undefined;
  const step = definition?.step || 0.1;
  const hasRange = typeof min === "number" && typeof max === "number";

  const handleAxisChange = (axisIndex: number, nextValue: number) => {
    const next = [...value];
    next[axisIndex] = nextValue;
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {/* Compact inline input fields - similar to Blender/Unity */}
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: size }, (_, index) => (
          <div key={AXIS_LABELS[index]} className="flex-1 w-[80px] space-y-1">
            <label className="block text-[10px] font-medium text-pc-text-secondary">
              {AXIS_LABELS[index]}
            </label>
            <Input
              type="number"
              value={value?.[index] ?? 0}
              step={step}
              min={min}
              max={max}
              onChange={(val) => handleAxisChange(index, Number(val))}
              deferUpdate={false}
              className="w-full text-xs"
            />
          </div>
        ))}
      </div>
      {/* Optional sliders for range-limited vectors */}
      {hasRange && (
        <div className="space-y-2">
          {Array.from({ length: size }, (_, index) => (
            <div key={`slider-${AXIS_LABELS[index]}`} className="space-y-1">
              <div className="flex items-center justify-between text-xs text-pc-text-dark">
                <span>{AXIS_LABELS[index]}</span>
                <span className="text-pc-text-secondary">
                  {Number(value?.[index] ?? 0).toFixed(2)}
                </span>
              </div>
              <Slider
                min={min}
                max={max}
                step={step}
                value={value?.[index] ?? min}
                onChange={(val) => handleAxisChange(index, val)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Helper to get default value for a schema field
const getDefaultValueForSchemaField = (
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

const parseArrayValue = (raw: string) => {
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
