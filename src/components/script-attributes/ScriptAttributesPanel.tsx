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

const evaluateVisibleIf = (
  definition: ScriptAttributeDefinition | undefined,
  attributes: Record<string, ScriptAttributePayload> | undefined
) => {
  if (!definition?.visibleif) {
    return true;
  }
  const conditions = definition.visibleif;
  const values =
    attributes &&
    Object.fromEntries(
      Object.entries(attributes).map(([key, attr]) => [key, attr?.value])
    );

  if (Array.isArray(conditions)) {
    return conditions.every((cond) => evaluateSingleCondition(cond, values));
  }
  if (typeof conditions === "object") {
    return Object.entries(conditions).every(([key, expected]) => {
      return values && values[key] === expected;
    });
  }
  return true;
};

const evaluateSingleCondition = (
  condition: any,
  values: Record<string, unknown> | undefined
) => {
  if (!condition) {
    return true;
  }
  const { lhs, rhs, operator = "==" } = condition;
  if (!values || !(lhs in values)) {
    return false;
  }
  const leftValue = values[lhs];
  switch (operator) {
    case "==":
      return leftValue === rhs;
    case "!=":
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

    const sortedAttributes = useMemo(
      () =>
        Object.entries(attributes).sort(([aKey], [bKey]) =>
          aKey.localeCompare(bKey)
        ),
      [attributes]
    );

    if (sortedAttributes.length === 0) {
      return (
        <p className="text-xs italic text-pc-text-dark">
          No script attributes detected for this script.
        </p>
      );
    }

    return (
      <div className="space-y-3">
        {sortedAttributes.map(([name, attribute]) => {
          if (!attribute) {
            return null;
          }
          if (!evaluateVisibleIf(attribute.definition, attributes)) {
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
          <p className="font-semibold">{label}</p>
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
};

const AttributeInput = ({
  value,
  attribute,
  definition,
  onChange,
  entities,
  entityGuid,
  attributeKey,
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
        {hasRange ? (
          <input
            type="range"
            min={definition?.min}
            max={definition?.max}
            step={definition?.step || 1}
            value={typeof value === "number" ? value : definition?.min || 0}
            onPointerDownCapture={stopReactFlowEvent}
            onChange={(event) => onChange(Number(event.target.value))}
            className="w-full"
          />
        ) : null}
        <input
          type="number"
          value={value ?? ""}
          onPointerDownCapture={stopReactFlowEvent}
          onChange={(event) => onChange(Number(event.target.value))}
          className="w-full rounded-lg border border-pc-border-primary bg-pc-darkest px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-pc-text-active"
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
                  className={`nodrag absolute z-40 w-72 rounded-2xl border border-pc-border-primary/70 bg-pc-darkest/95 p-3 shadow-2xl backdrop-blur ${popupPlacementClass}`}
                  onPointerDownCapture={stopReactFlowEvent}
                  onMouseDown={stopReactFlowEvent}
                  onWheel={stopWheelPropagation}
                  onWheelCapture={stopWheelPropagation}
                >
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={entityQuery}
                      autoFocus
                      onPointerDownCapture={stopReactFlowEvent}
                      onChange={(event) => setEntityQuery(event.target.value)}
                      placeholder="Search entity by name"
                      className="w-full rounded-lg border border-pc-border-primary bg-pc-darkest px-3 py-2 text-sm text-pc-text-primary outline-none focus:ring-2 focus:ring-pc-text-active"
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
                              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition ${
                                isActive
                                  ? "bg-pc-text-active/10 text-pc-text-primary font-semibold"
                                  : "text-pc-text-primary hover:bg-pc-dark"
                              }`}
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
                  className={`rounded-md border px-2 py-1 font-semibold transition ${
                    currentId
                      ? "border-pc-border-primary/60 text-pc-text-secondary hover:border-pc-text-active hover:text-pc-text-active"
                      : "cursor-not-allowed border-pc-border-primary/30 text-pc-text-dark"
                  }`}
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

  if (type === "array") {
    const list = Array.isArray(value) ? value : [];
    return <ArrayField current={list} onChange={onChange} />;
  }

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

  // string fallback
  return (
    <input
      type="text"
      value={value ?? ""}
      placeholder={definition?.placeholder}
      onPointerDownCapture={stopReactFlowEvent}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-lg border border-pc-border-primary bg-pc-darkest px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-pc-text-active"
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
  const [lockAxes, setLockAxes] = useState(false);
  const min = typeof definition?.min === "number" ? definition.min : undefined;
  const max = typeof definition?.max === "number" ? definition.max : undefined;
  const step = definition?.step || 0.1;

  const handleAxisChange = (axisIndex: number, nextValue: number) => {
    if (lockAxes) {
      const unified = Array.from({ length: size }, () => nextValue);
      onChange(unified);
      return;
    }
    const next = [...value];
    next[axisIndex] = nextValue;
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-pc-text-dark">
        <span>Interactive vector control</span>
        <label className="inline-flex items-center gap-1">
          <input
            type="checkbox"
            checked={lockAxes}
            onPointerDownCapture={stopReactFlowEvent}
            onChange={(event) => setLockAxes(event.target.checked)}
            className="h-3 w-3 accent-pc-text-active"
          />
          <span>Lock axes</span>
        </label>
      </div>
      <div className="space-y-2">
        {Array.from({ length: size }, (_, index) => (
          <div
            key={AXIS_LABELS[index]}
            className="rounded-xl bg-pc-darkest/80 px-3 py-2"
          >
            <div className="flex items-center justify-between text-xs text-pc-text-secondary">
              <span>{AXIS_LABELS[index]}</span>
              <span className="text-pc-text-primary font-semibold">
                {Number(value?.[index] ?? 0).toFixed(2)}
              </span>
            </div>
            <div className="mt-2 space-y-2">
              {typeof min === "number" && typeof max === "number" ? (
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={value?.[index] ?? min}
                  onPointerDownCapture={stopReactFlowEvent}
                  onChange={(event) =>
                    handleAxisChange(index, Number(event.target.value))
                  }
                  className="w-full"
                />
              ) : null}
              <input
                type="number"
                value={value?.[index] ?? 0}
                step={step}
                onPointerDownCapture={stopReactFlowEvent}
                onChange={(event) =>
                  handleAxisChange(index, Number(event.target.value))
                }
                className="w-full rounded-lg border border-pc-border-primary bg-pc-darkest px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-pc-text-active"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

type ArrayFieldProps = {
  current: unknown[];
  onChange: (next: unknown[]) => void;
};

const ArrayField = ({ current, onChange }: ArrayFieldProps) => {
  const handleItemChange = (index: number, next: string) => {
    const nextValues = [...current];
    nextValues[index] = parseArrayValue(next);
    onChange(nextValues);
  };

  const addItem = () => {
    onChange([...current, ""]);
  };

  const removeItem = (index: number) => {
    const next = current.filter((_, idx) => idx !== index);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {current.map((entry, index) => (
        <div
          key={`${index}-${String(entry)}`}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={String(entry ?? "")}
            onPointerDownCapture={stopReactFlowEvent}
            onChange={(event) => handleItemChange(index, event.target.value)}
            className="flex-1 rounded-lg border border-pc-border-primary bg-pc-darkest px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-pc-text-active"
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
