import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { WheelEvent } from "react";
import { ColorPicker } from "@playcanvas/pcui/react";
import { Input } from "@/components/ui/Input";
import { Slider } from "@/components/ui/Slider";
import { cn } from "@/utils/cn";
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
import { useGraphEditorStore } from "@/stores/useGraphEditorStore";
// These components will be imported from ScriptAttributesPanel.tsx temporarily
// TODO: Extract these to separate files for better organization

/**
 * Type handler interface for polymorphic attribute input rendering.
 * Each handler defines:
 * - priority: Higher priority handlers are checked first (default: 0)
 * - match: Function to determine if this handler should handle the attribute
 * - render: Function to render the input component
 */
export type TypeHandler = {
  /**
   * Priority determines the order of evaluation.
   * Higher priority handlers are checked first.
   * Use this to ensure specific types (like Color[]) are checked before generic types (like Color).
   */
  priority: number;
  /**
   * Returns true if this handler should handle the given attribute.
   */
  match: (params: TypeHandlerMatchParams) => boolean;
  /**
   * Renders the input component for this type.
   * Returns null if the handler cannot render (fallback to next handler).
   */
  render: (params: TypeHandlerRenderParams) => React.ReactNode;
};

type TypeHandlerMatchParams = {
  type: string;
  definition?: ScriptAttributeDefinition;
  value: unknown;
  attributeKey: string;
};

type TypeHandlerRenderParams = {
  type: string;
  value: unknown;
  definition?: ScriptAttributeDefinition;
  onChange: (value: unknown) => void;
  entities: Record<string, EntityPayload>;
  entityGuid: string;
  attributeKey: string;
  // State hooks for handlers that need them (e.g., entity picker, asset picker)
  useState: typeof useState;
  useEffect: typeof useEffect;
  useLayoutEffect: typeof useLayoutEffect;
  useMemo: typeof useMemo;
  useCallback: typeof useCallback;
  useRef: typeof useRef;
};

/**
 * Enum type handler - handles @enum types with dropdown select
 * Priority: 100 (highest - enum should override generic types)
 */
const enumHandler: TypeHandler = {
  priority: 100,
  match: ({ definition }) => !!definition?.enum?.options,
  render: ({ value, definition, onChange }) => {
    if (!definition?.enum?.options) return null;

    const options = definition.enum.options;
    const order = definition.enum.order || Object.keys(options);

    // Determine the value type by checking the first option
    const firstValue = options[order[0]];
    const isNumberEnum = typeof firstValue === "number";
    const isBooleanEnum = typeof firstValue === "boolean";

    // Convert value to string for comparison in select element
    const stringValue = value != null ? String(value) : "";

    const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
      const selectedValue = event.target.value;
      // Convert back to original type
      if (isNumberEnum) {
        onChange(Number(selectedValue));
      } else if (isBooleanEnum) {
        onChange(selectedValue === "true");
      } else {
        onChange(selectedValue);
      }
    };

    return (
      <select
        value={stringValue}
        onPointerDownCapture={stopReactFlowEvent}
        onChange={handleChange}
        className="w-full rounded-lg border border-pc-border-primary bg-pc-darkest px-3 py-2 text-sm text-pc-text-primary outline-none focus:ring-2 focus:ring-pc-text-active"
      >
        {order.map((label: string) => {
          const val = options[label];
          if (val === undefined) return null;
          return (
            <option key={label} value={String(val)}>
              {label}
            </option>
          );
        })}
      </select>
    );
  },
};

/**
 * Color[] array type handler
 * Priority: 90 (high - must be checked before single Color handler)
 */
const colorArrayHandler: TypeHandler = {
  priority: 90,
  match: ({ type, definition }) => {
    return (
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
        definition?.color !== undefined)
    );
  },
  render: ({ value, type, definition, onChange }) => {
    // Determine channels based on type (rgba = 4, rgb = 3)
    const channels = type === "rgba" || definition?.color === 4 ? 4 : 3;

    // Normalize value: Color[] should be a 2D array [[r,g,b], [r,g,b], ...]
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
      if (val.length >= channels && val.every((v) => typeof v === "number")) {
        const normalized = val.slice(0, channels) as number[];
        while (normalized.length < channels) {
          normalized.push(channels === 4 && normalized.length === 3 ? 1 : 0);
        }
        return [normalized];
      }

      return [];
    };

    // ColorArrayField is complex and depends on components from ScriptAttributesPanel
    // Return null to indicate this needs special handling in ScriptAttributesPanel
    return null;
  },
};

/**
 * Single Color type handler
 * Priority: 80 (must be checked after Color[] handler)
 */
const colorHandler: TypeHandler = {
  priority: 80,
  match: ({ type, definition }) => {
    return (
      type === "rgb" ||
      type === "rgba" ||
      (definition?.color !== undefined &&
        !definition?.array &&
        type !== "array" &&
        type !== "json")
    );
  },
  render: ({ value, type, definition, onChange, useState, useMemo, useCallback, useRef, useEffect }) => {
    const channels = type === "rgba" || definition?.color === 4 ? 4 : 3;

    // Memoize colorValue to prevent unnecessary re-renders
    const colorValue = useMemo(() => {
      if (Array.isArray(value) && value.length >= channels) {
        return value.slice(0, channels);
      }
      return channels === 4 ? [0, 0, 0, 1] : [0, 0, 0];
    }, [value, channels]);

    // Use useRef to track the last update time and prevent rapid-fire updates
    const lastUpdateRef = useRef<number>(0);
    const pendingUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Use useCallback to stabilize the onChange handler
    const handleColorChange = useCallback(
      (newColor: number[]) => {
        const normalizedColor = newColor.slice(0, channels);

        // Compare with current value to prevent unnecessary updates
        const currentValue = Array.isArray(value)
          ? value.slice(0, channels)
          : null;
        if (currentValue && currentValue.length === normalizedColor.length) {
          const hasChanged = currentValue.some(
            (val, idx) => Math.abs(val - normalizedColor[idx]) > 0.0001
          );
          if (!hasChanged) {
            return;
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
          lastUpdateRef.current = now;
          onChange(normalizedColor);
        } else {
          pendingUpdateRef.current = setTimeout(() => {
            lastUpdateRef.current = Date.now();
            onChange(normalizedColor);
            pendingUpdateRef.current = null;
          }, 50);
        }
      },
      [onChange, channels, value]
    );

    // Cleanup pending update on unmount
    useEffect(() => {
      return () => {
        if (pendingUpdateRef.current) {
          clearTimeout(pendingUpdateRef.current);
        }
      };
    }, []);

    return (
      <ColorPicker
        value={colorValue}
        onChange={handleColorChange}
        channels={channels}
      />
    );
  },
};

/**
 * Boolean type handler
 * Priority: 70
 */
const booleanHandler: TypeHandler = {
  priority: 70,
  match: ({ type }) => type === "boolean",
  render: ({ value, definition, onChange }) => {
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
  },
};

/**
 * Number type handler
 * Priority: 60
 */
const numberHandler: TypeHandler = {
  priority: 60,
  match: ({ type }) => type === "number",
  render: ({ value, definition, onChange }) => {
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
  },
};

/**
 * Vector type handler (vec2, vec3, vec4)
 * Priority: 50
 */
const vectorHandler: TypeHandler = {
  priority: 50,
  match: ({ type }) => type.startsWith("vec"),
  render: ({ value, type, definition, onChange }) => {
    const size = Number(type.replace("vec", "")) || 3;
    const ensureVector = (val: unknown, size: number): number[] => {
      if (Array.isArray(val)) {
        const next = val.slice(0, size).map((v) => Number(v) || 0);
        while (next.length < size) {
          next.push(0);
        }
        return next;
      }
      return Array.from({ length: size }, () => 0);
    };
    const min = typeof definition?.min === "number" ? definition.min : undefined;
    const max = typeof definition?.max === "number" ? definition.max : undefined;
    const step = definition?.step || 0.1;
    const hasRange = typeof min === "number" && typeof max === "number";
    const AXIS_LABELS = ["X", "Y", "Z", "W"];

    const handleAxisChange = (axisIndex: number, nextValue: number) => {
      const next = [...ensureVector(value, size)];
      next[axisIndex] = nextValue;
      onChange(next);
    };

    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: size }, (_, index) => (
            <div key={AXIS_LABELS[index]} className="flex-1 w-[80px] space-y-1">
              <label className="block text-[10px] font-medium text-pc-text-secondary">
                {AXIS_LABELS[index]}
              </label>
              <Input
                type="number"
                value={ensureVector(value, size)[index] ?? 0}
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
        {hasRange && (
          <div className="space-y-2">
            {Array.from({ length: size }, (_, index) => (
              <div key={`slider-${AXIS_LABELS[index]}`} className="space-y-1">
                <div className="flex items-center justify-between text-xs text-pc-text-dark">
                  <span>{AXIS_LABELS[index]}</span>
                  <span className="text-pc-text-secondary">
                    {Number(ensureVector(value, size)[index] ?? 0).toFixed(2)}
                  </span>
                </div>
                <Slider
                  min={min}
                  max={max}
                  step={step}
                  value={ensureVector(value, size)[index] ?? min}
                  onChange={(val) => handleAxisChange(index, val)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  },
};

/**
 * Entity type handler
 * Priority: 40
 */
const entityHandler: TypeHandler = {
  priority: 40,
  match: ({ type }) => type === "entity",
  render: ({ value, entities, entityGuid, onChange, useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef }) => {
    const [isEntityPickerOpen, setEntityPickerOpen] = useState(false);
    const [entityQuery, setEntityQuery] = useState("");
    const pickerAnchorRef = useRef<HTMLDivElement | null>(null);
    const pickerPanelRef = useRef<HTMLDivElement | null>(null);
    const searchButtonRef = useRef<HTMLButtonElement | null>(null);
    const [popupPlacement, setPopupPlacement] = useState<
      "right" | "left" | "bottom"
    >("bottom");
    const focusEntity = useGraphEditorStore((state) => state.focusEntity);
    const stopWheelPropagation = useCallback(
      (event: WheelEvent<HTMLDivElement>) => {
        stopReactFlowEvent(event);
      },
      []
    );

    const currentId = value ? String(value) : "";
    const currentEntity = currentId ? entities[currentId] : undefined;

    const entityMatches = useMemo(() => {
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
    }, [entityQuery, entities, entityGuid]);

    useEffect(() => {
      if (!isEntityPickerOpen) {
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
    }, [isEntityPickerOpen]);

    useLayoutEffect(() => {
      if (!isEntityPickerOpen) {
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
    }, [isEntityPickerOpen]);

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

    // Entity picker UI (same as before, but extracted)
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
  },
};

/**
 * Asset type handler
 * Priority: 35
 */
const assetHandler: TypeHandler = {
  priority: 35,
  match: ({ type }) => type === "asset",
  render: ({ value, definition, onChange, useState, useEffect, useMemo, useRef }) => {
    const [isAssetPickerOpen, setAssetPickerOpen] = useState(false);
    const [assetQuery, setAssetQuery] = useState("");
    const [assets, setAssets] = useState<
      Array<{ id: string | number; name: string; type?: string }>
    >([]);
    const [isLoadingAssets, setIsLoadingAssets] = useState(false);
    const assetPickerAnchorRef = useRef<HTMLDivElement | null>(null);
    const assetPickerPanelRef = useRef<HTMLDivElement | null>(null);
    const assetSearchButtonRef = useRef<HTMLButtonElement | null>(null);
    const [assetPopupPlacement, setAssetPopupPlacement] = useState<
      "right" | "left" | "bottom"
    >("bottom");
    const getAssets = useGraphEditorStore((state) => state.getAssets);

    const currentAssetId = value ? String(value) : "";
    const assetType = definition?.assetType;
    const currentAsset = assets.find((a) => a.id == currentAssetId);

    // Load assets when picker opens OR when we have a currentAssetId but assets are empty
    useEffect(() => {
      if (
        assets.length === 0 &&
        !isLoadingAssets &&
        (isAssetPickerOpen || currentAssetId)
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
      isAssetPickerOpen,
      assetType,
      getAssets,
      assets.length,
      isLoadingAssets,
      currentAssetId,
    ]);

    const assetMatches = useMemo(() => {
      const normalizedQuery = assetQuery.trim().toLowerCase();
      return assets
        .filter((asset) => {
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
    }, [assetQuery, assetType, assets]);

    // Asset picker popup placement logic
    useEffect(() => {
      if (!isAssetPickerOpen) {
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
    }, [isAssetPickerOpen]);

    // Click outside to close asset picker
    useEffect(() => {
      if (!isAssetPickerOpen) {
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
    }, [isAssetPickerOpen]);

    // ESC key to close asset picker
    useEffect(() => {
      if (!isAssetPickerOpen) {
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
    }, [isAssetPickerOpen]);

    const assetPopupPlacementClass =
      assetPopupPlacement === "right"
        ? "left-full top-0 ml-2"
        : assetPopupPlacement === "left"
        ? "right-full top-0 mr-2"
        : "top-full left-0 mt-2";

    // Asset picker UI (same as before, but extracted)
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
                    <div className="max-h-60 overflow-y-scroll overscroll-contain rounded-xl border border-pc-border-primary/30">
                      {assetMatches.length ? (
                        assetMatches.map((asset) => {
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
  },
};

/**
 * Array type handler (array or json with array: true, but not Color[])
 * Priority: 30
 */
const arrayHandler: TypeHandler = {
  priority: 30,
  match: ({ type, definition }) => {
    // Exclude Color[] arrays (handled by colorArrayHandler)
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
    
    return (
      (type === "array" || (type === "json" && definition?.array === true)) &&
      !isColorArray
    );
  },
  render: () => {
    // ArrayField is complex and depends on components from ScriptAttributesPanel
    // Return null to indicate this needs special handling in ScriptAttributesPanel
    return null;
  },
};

/**
 * JSON/Object type handler (non-array json/object)
 * Priority: 20
 */
const jsonHandler: TypeHandler = {
  priority: 20,
  match: ({ type, definition }) => {
    // Exclude arrays (handled by arrayHandler)
    const isArray = type === "array" || (type === "json" && definition?.array === true);
    return (type === "json" || type === "object") && !isArray;
  },
  render: ({ value, onChange }) => {
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
  },
};

/**
 * String type handler (fallback)
 * Priority: 10 (lowest - catch-all)
 */
const stringHandler: TypeHandler = {
  priority: 10,
  match: () => true, // Always matches as fallback
  render: ({ value, definition, onChange }) => {
    return (
      <Input
        type="text"
        value={value ?? ""}
        placeholder={definition?.placeholder}
        onChange={onChange}
        className="w-full"
      />
    );
  },
};

/**
 * All type handlers, sorted by priority (highest first).
 * When adding a new handler, ensure its priority is appropriate:
 * - Specific types (like Color[]) should have higher priority than generic types (like Color)
 * - Enum should have the highest priority to override all other types
 */
export const TYPE_HANDLERS: TypeHandler[] = [
  enumHandler,
  colorArrayHandler,
  colorHandler,
  booleanHandler,
  numberHandler,
  vectorHandler,
  entityHandler,
  assetHandler,
  arrayHandler,
  jsonHandler,
  stringHandler, // Fallback - always matches
].sort((a, b) => b.priority - a.priority); // Sort by priority descending

/**
 * Finds the first matching handler for the given attribute.
 */
export const findTypeHandler = (
  params: TypeHandlerMatchParams
): TypeHandler | null => {
  return TYPE_HANDLERS.find((handler) => handler.match(params)) || null;
};

