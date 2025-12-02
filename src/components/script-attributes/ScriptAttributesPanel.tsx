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
import "@playcanvas/pcui/styles";
import { ColorPicker } from "@playcanvas/pcui/react";
import { findTypeHandler } from "./type-handlers";

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
  const [isAssetPickerOpen, setAssetPickerOpen] = useState(false);
  const [entityQuery, setEntityQuery] = useState("");
  const [assetQuery, setAssetQuery] = useState("");
  const [assets, setAssets] = useState<
    Array<{ id: string | number; name: string; type?: string }>
  >([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);
  const pickerAnchorRef = useRef<HTMLDivElement | null>(null);
  const pickerPanelRef = useRef<HTMLDivElement | null>(null);
  const searchButtonRef = useRef<HTMLButtonElement | null>(null);
  const assetPickerAnchorRef = useRef<HTMLDivElement | null>(null);
  const assetPickerPanelRef = useRef<HTMLDivElement | null>(null);
  const assetSearchButtonRef = useRef<HTMLButtonElement | null>(null);
  const [popupPlacement, setPopupPlacement] = useState<
    "right" | "left" | "bottom"
  >("bottom");
  const [assetPopupPlacement, setAssetPopupPlacement] = useState<
    "right" | "left" | "bottom"
  >("bottom");
  const getAssets = useGraphEditorStore((state) => state.getAssets);
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

  // Handle Color[] array types FIRST (before single Color types)
  // This is kept here because ColorArrayField depends on components from this file
  // TODO: Extract ColorArrayField to a separate file and move this to type-handlers
  const isColorArray =
    (type === "rgb" && definition?.array === true) ||
    (type === "rgba" && definition?.array === true) ||
    type === "array:gradient" ||
    type.startsWith("array:rgb") ||
    type.startsWith("array:rgba") ||
    definition?.type?.includes("Color[]") ||
    definition?.type?.includes("rgb[]") ||
    definition?.type?.includes("rgba[]") ||
    (definition?.color !== undefined && definition?.array === true) ||
    (type === "array" && definition?.color !== undefined) ||
    (type === "json" &&
      definition?.array === true &&
      definition?.color !== undefined);

  if (isColorArray) {
    // Determine channels based on type (rgba = 4, rgb = 3)
    const channels = type === "rgba" || definition?.color === 4 ? 4 : 3;

    // Normalize value: Color[] should be a 2D array [[r,g,b], [r,g,b], ...]
    // But based on the log, value might be a single color array [r,g,b,a]
    // We need to handle both cases
    const normalizeColorList = (val: unknown): number[][] => {
      if (!Array.isArray(val)) {
        return [];
      }

      // If it's already a 2D array (array of color arrays)
      if (val.length > 0 && Array.isArray(val[0])) {
        return (val as unknown[]).map((item) => {
          if (Array.isArray(item)) {
            const normalized = item.slice(0, channels) as number[];
            while (normalized.length < channels) {
              normalized.push(
                channels === 4 && normalized.length === 3 ? 1 : 0
              );
            }
            return normalized;
          }
          return channels === 4 ? [0, 0, 0, 1] : [0, 0, 0];
        });
      }

      // If it's a single color array [r,g,b,a], wrap it in an array
      // This shouldn't happen for Color[], but handle it gracefully
      if (val.length >= channels && val.every((v) => typeof v === "number")) {
        const normalized = val.slice(0, channels) as number[];
        while (normalized.length < channels) {
          normalized.push(channels === 4 && normalized.length === 3 ? 1 : 0);
        }
        return [normalized];
      }

      return [];
    };

    const colorList = normalizeColorList(value);

    return (
      <ColorArrayField
        current={colorList}
        onChange={onChange}
        channels={channels}
      />
    );
  }

  // Color and Vector types are now handled by type-handlers
  // (Removed old logic - now using type-handlers system)

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

  // Handle asset type - similar to entity picker
  if (type === "asset") {
    const currentAssetId = value ? String(value) : "";
    const assetType = definition?.assetType; // Filter by asset type if specified
    const currentAsset = assets.find((a) => a.id == currentAssetId);

    // Load assets when picker opens OR when we have a currentAssetId but assets are empty
    useEffect(() => {
      if (
        type === "asset" &&
        assets.length === 0 &&
        !isLoadingAssets &&
        (isAssetPickerOpen || currentAssetId) // Load if picker is open OR if we have a linked asset
      ) {
        setIsLoadingAssets(true);
        getAssets(assetType)
          .then((loadedAssets) => {
            setAssets(
              loadedAssets.map((asset) => ({
                id: asset.id,
                name: asset.name,
                type: asset.type,
              }))
            );
          })
          .catch((error) => {
            console.error(
              "[ScriptAttributesPanel] Failed to load assets:",
              error
            );
          })
          .finally(() => {
            setIsLoadingAssets(false);
          });
      }
    }, [
      type,
      isAssetPickerOpen,
      assetType,
      getAssets,
      assets.length,
      isLoadingAssets,
      currentAssetId, // Add currentAssetId as dependency
    ]);

    const assetMatches = useMemo(() => {
      if (type !== "asset") {
        return [];
      }
      const normalizedQuery = assetQuery.trim().toLowerCase();
      return assets
        .filter((asset) => {
          // Filter by asset type if specified
          if (assetType && asset.type !== assetType) {
            return false;
          }
          return true;
        })
        .filter((asset) => {
          if (!normalizedQuery) {
            return true;
          }
          const name = (asset.name || "").toLowerCase();
          const assetId = String(asset.id).toLowerCase();
          return (
            name.includes(normalizedQuery) || assetId.includes(normalizedQuery)
          );
        })
        .slice(0, 10);
    }, [type, assetQuery, assetType, assets]);

    // Asset picker popup placement logic (similar to entity picker)
    useEffect(() => {
      if (type !== "asset" || !isAssetPickerOpen) {
        return;
      }

      const updatePlacement = () => {
        if (!assetPickerAnchorRef.current || !assetPickerPanelRef.current) {
          return;
        }

        const anchorRect = assetPickerAnchorRef.current.getBoundingClientRect();
        const panelRect = assetPickerPanelRef.current.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        const spaceRight = viewportWidth - anchorRect.right;
        const spaceLeft = anchorRect.left;
        const spaceBottom = viewportHeight - anchorRect.bottom;

        if (spaceRight >= panelRect.width) {
          setAssetPopupPlacement("right");
        } else if (spaceLeft >= panelRect.width) {
          setAssetPopupPlacement("left");
        } else if (spaceBottom >= 300) {
          setAssetPopupPlacement("bottom");
        } else {
          setAssetPopupPlacement("right");
        }
      };

      updatePlacement();
      window.addEventListener("resize", updatePlacement);
      window.addEventListener("scroll", updatePlacement, true);

      return () => {
        window.removeEventListener("resize", updatePlacement);
        window.removeEventListener("scroll", updatePlacement, true);
      };
    }, [type, isAssetPickerOpen]);

    // Click outside to close asset picker
    useEffect(() => {
      if (type !== "asset" || !isAssetPickerOpen) {
        return;
      }

      const closePicker = () => {
        setAssetPickerOpen(false);
        setAssetQuery("");
      };

      const handlePointerDown = (event: MouseEvent) => {
        const target = event.target as Node;
        const clickedInsidePopup =
          !!assetPickerPanelRef.current &&
          assetPickerPanelRef.current.contains(target as Node);
        const clickedAnchor =
          !!assetPickerAnchorRef.current &&
          assetPickerAnchorRef.current.contains(target as Node);
        if (!clickedInsidePopup && !clickedAnchor) {
          closePicker();
        }
      };

      document.addEventListener("pointerdown", handlePointerDown);
      return () => {
        document.removeEventListener("pointerdown", handlePointerDown);
      };
    }, [type, isAssetPickerOpen]);

    // ESC key to close asset picker
    useEffect(() => {
      if (type !== "asset" || !isAssetPickerOpen) {
        return;
      }

      const handleEscape = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          setAssetPickerOpen(false);
        }
      };

      window.addEventListener("keydown", handleEscape);
      return () => {
        window.removeEventListener("keydown", handleEscape);
      };
    }, [type, isAssetPickerOpen]);

    const assetPopupPlacementClass =
      assetPopupPlacement === "right"
        ? "left-full top-0 ml-2"
        : assetPopupPlacement === "left"
        ? "right-full top-0 mr-2"
        : "top-full left-0 mt-2";

    return (
      <div className="rounded-xl border border-dashed border-pc-border-primary/60 bg-pc-dark/60 px-3 py-3 text-xs">
        <div className="flex flex-col gap-2 justify-between">
          <div>
            <p className="text-sm font-semibold text-pc-text-secondary">
              {currentAssetId
                ? "Linked to: " + (currentAsset?.name || currentAssetId)
                : "No asset linked"}
            </p>
            <p className="text-pc-text-dark">
              {assetType
                ? `Search to pick a ${assetType} asset.`
                : "Search to pick a target asset."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative inline-flex" ref={assetPickerAnchorRef}>
              <button
                type="button"
                ref={assetSearchButtonRef}
                onPointerDownCapture={stopReactFlowEventWithPreventDefault}
                onMouseUpCapture={stopReactFlowEventWithPreventDefault}
                onClick={withStopPropagation(() =>
                  setAssetPickerOpen((open) => !open)
                )}
                className="rounded-md border border-pc-border-primary/60 px-2 py-1 font-semibold text-pc-text-secondary hover:border-pc-text-active hover:text-pc-text-active"
              >
                {isAssetPickerOpen ? "Close" : "Search"}
              </button>
              {isAssetPickerOpen ? (
                <div
                  ref={assetPickerPanelRef}
                  className={cn(
                    "nodrag absolute z-40 w-72 rounded-2xl border border-pc-border-primary/70 bg-pc-darkest/95 p-3 shadow-2xl backdrop-blur",
                    assetPopupPlacementClass
                  )}
                  onPointerDownCapture={stopReactFlowEvent}
                  onMouseDown={stopReactFlowEvent}
                  onWheel={stopWheelPropagation}
                  onWheelCapture={stopWheelPropagation}
                >
                  <div className="space-y-3">
                    <Input
                      type="text"
                      value={assetQuery}
                      autoFocus
                      onChange={(val) => setAssetQuery(String(val))}
                      placeholder={
                        assetType
                          ? `Search ${assetType} asset by name`
                          : "Search asset by name"
                      }
                      deferUpdate={false}
                      className="w-full text-pc-text-primary"
                    />
                    <div
                      className="max-h-60 overflow-y-scroll overscroll-contain rounded-xl border border-pc-border-primary/30"
                      onMouseDown={stopReactFlowEvent}
                      onWheel={stopWheelPropagation}
                      onWheelCapture={stopWheelPropagation}
                    >
                      {assetMatches.length ? (
                        assetMatches.map((asset) => {
                          // Use == instead of === to handle type coercion (number vs string)
                          const isActive =
                            String(asset.id) === currentAssetId ||
                            asset.id == currentAssetId;
                          const displayName = asset.name || "(Unnamed asset)";
                          return (
                            <button
                              type="button"
                              key={asset.id}
                              onPointerDownCapture={
                                stopReactFlowEventWithPreventDefault
                              }
                              onMouseUpCapture={
                                stopReactFlowEventWithPreventDefault
                              }
                              onClick={withStopPropagation(() => {
                                onChange(asset.id);
                                setAssetPickerOpen(false);
                                setAssetQuery("");
                              })}
                              className={cn(
                                "flex w-full items-center justify-between px-3 py-2 text-left text-sm transition",
                                isActive
                                  ? "bg-pc-text-active/10 text-pc-text-primary font-semibold"
                                  : "text-pc-text-primary hover:bg-pc-dark"
                              )}
                            >
                              <div className="flex flex-col items-start gap-0.5 truncate pr-2">
                                <span className="truncate">{displayName}</span>
                                {asset.type && (
                                  <span className="text-[10px] text-pc-text-dark">
                                    {asset.type}
                                  </span>
                                )}
                              </div>
                              {isActive ? (
                                <span className="text-[10px] uppercase text-pc-text-active flex-shrink-0">
                                  Linked
                                </span>
                              ) : null}
                            </button>
                          );
                        })
                      ) : (
                        <p className="py-4 text-center text-xs text-pc-text-dark">
                          {isLoadingAssets
                            ? "Loading assets..."
                            : assets.length === 0
                            ? "No assets available."
                            : "No assets found."}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
            {currentAssetId && (
              <button
                type="button"
                onPointerDownCapture={stopReactFlowEventWithPreventDefault}
                onMouseUpCapture={stopReactFlowEventWithPreventDefault}
                onClick={withStopPropagation(() => {
                  onChange(null);
                  setAssetPickerOpen(false);
                  setAssetQuery("");
                })}
                className="rounded-md border border-pc-border-primary/60 px-2 py-1 font-semibold text-pc-text-secondary hover-border-pc-error hover:text-pc-error"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>
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

type ColorArrayItemProps = {
  index: number;
  colorValue: unknown;
  channels: 3 | 4;
  isCollapsed: boolean;
  onToggle: () => void;
  onChange: (nextColor: number[]) => void;
  onRemove: () => void;
};

const ColorArrayItem = memo(
  ({
    index,
    colorValue,
    channels,
    isCollapsed,
    onToggle,
    onChange,
    onRemove,
  }: ColorArrayItemProps) => {
    // Normalize color value
    const normalizedColor = useMemo(() => {
      if (Array.isArray(colorValue) && colorValue.length >= channels) {
        const normalized = colorValue.slice(0, channels);
        while (normalized.length < channels) {
          normalized.push(channels === 4 && normalized.length === 3 ? 1 : 0);
        }
        return normalized;
      }
      return channels === 4 ? [0, 0, 0, 1] : [0, 0, 0];
    }, [colorValue, channels]);

    // Use useRef to track the last update time and prevent rapid-fire updates
    const lastUpdateRef = useRef<number>(0);
    const pendingUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Use useCallback to stabilize the onChange handler
    const handleColorChange = useCallback(
      (newColor: number[]) => {
        // ColorPicker returns values in range 0-1, which is what we need
        // Ensure we only pass the correct number of channels
        const normalizedNewColor = newColor.slice(0, channels);

        // Compare with current value to prevent unnecessary updates
        const currentValue = Array.isArray(colorValue)
          ? colorValue.slice(0, channels)
          : null;
        if (currentValue && currentValue.length === normalizedNewColor.length) {
          const hasChanged = currentValue.some(
            (val, idx) => Math.abs(val - normalizedNewColor[idx]) > 0.0001
          );
          if (!hasChanged) {
            return; // Value hasn't changed, skip update
          }
        }

        // Clear any pending update
        if (pendingUpdateRef.current) {
          clearTimeout(pendingUpdateRef.current);
        }

        // Throttle updates to prevent too frequent state changes
        const now = Date.now();
        const timeSinceLastUpdate = now - lastUpdateRef.current;

        if (timeSinceLastUpdate > 50) {
          // Update immediately if enough time has passed
          lastUpdateRef.current = now;
          onChange(normalizedNewColor);
        } else {
          // Debounce rapid updates
          pendingUpdateRef.current = setTimeout(() => {
            lastUpdateRef.current = Date.now();
            onChange(normalizedNewColor);
            pendingUpdateRef.current = null;
          }, 50);
        }
      },
      [onChange, channels, colorValue]
    );

    // Cleanup pending update on unmount
    useEffect(() => {
      return () => {
        if (pendingUpdateRef.current) {
          clearTimeout(pendingUpdateRef.current);
        }
      };
    }, []);

    const getColorPreview = (): string => {
      if (!Array.isArray(normalizedColor) || normalizedColor.length < 3) {
        return "No color";
      }
      const r = Math.round((normalizedColor[0] || 0) * 255);
      const g = Math.round((normalizedColor[1] || 0) * 255);
      const b = Math.round((normalizedColor[2] || 0) * 255);
      return `rgb(${r}, ${g}, ${b})`;
    };

    const preview = getColorPreview();

    return (
      <div className="rounded-lg border border-pc-border-primary/50 bg-pc-dark overflow-hidden">
        {/* Collapsible header - same style as ArrayField */}
        <div className="flex items-center justify-between px-3 py-2 hover:bg-pc-darkest transition-colors">
          <button
            type="button"
            onPointerDownCapture={stopReactFlowEventWithPreventDefault}
            onMouseUpCapture={stopReactFlowEventWithPreventDefault}
            onClick={withStopPropagation(onToggle)}
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
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded border border-pc-border-primary"
                  style={{ backgroundColor: preview }}
                />
                <span className="text-xs text-pc-text-dark">{preview}</span>
              </div>
            )}
          </button>
          <button
            type="button"
            onPointerDownCapture={stopReactFlowEventWithPreventDefault}
            onMouseUpCapture={stopReactFlowEventWithPreventDefault}
            onClick={withStopPropagation(onRemove)}
            className="rounded-lg border border-pc-border-primary/60 px-2 py-1 text-xs text-pc-text-secondary hover:border-pc-error hover:text-pc-error transition-colors"
          >
            Remove
          </button>
        </div>
        {/* Expandable content - ColorPicker */}
        {!isCollapsed && (
          <ColorPicker
            value={normalizedColor}
            onChange={handleColorChange}
            channels={channels}
          />
          // <div className="px-3 pb-3 pt-2 nodrag">
          // </div>
        )}
      </div>
    );
  }
);
ColorArrayItem.displayName = "ColorArrayItem";

type ColorArrayFieldProps = {
  current: unknown[];
  onChange: (next: unknown[]) => void;
  channels: 3 | 4;
};

const ColorArrayField = ({
  current,
  onChange,
  channels,
}: ColorArrayFieldProps) => {
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
    // Add a default color array with correct channels
    const defaultColor = channels === 4 ? [0, 0, 0, 1] : [0, 0, 0];
    onChange([...current, defaultColor]);
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

  return (
    <div className="space-y-2">
      {current.map((entry, index) => {
        const colorValue = Array.isArray(entry)
          ? entry
          : channels === 4
          ? [0, 0, 0, 1]
          : [0, 0, 0];
        const isCollapsed = collapsedItems.has(index);

        return (
          <ColorArrayItem
            key={`color-${index}-${JSON.stringify(colorValue)}`}
            index={index}
            colorValue={colorValue}
            channels={channels}
            isCollapsed={isCollapsed}
            onToggle={() => toggleItem(index)}
            onChange={(nextColor) => handleItemChange(index, nextColor)}
            onRemove={() => removeItem(index)}
          />
        );
      })}
      <button
        type="button"
        onPointerDownCapture={stopReactFlowEventWithPreventDefault}
        onMouseUpCapture={stopReactFlowEventWithPreventDefault}
        onClick={withStopPropagation(addItem)}
        className="w-full rounded-lg border border-dashed border-pc-border-primary/60 px-3 py-2 text-sm text-pc-text-secondary hover:border-pc-text-active transition-colors"
      >
        + Add Color
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
