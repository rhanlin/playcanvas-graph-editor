import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { WheelEvent } from "react";
import { ColorPickerWrapper } from "./ColorPickerWrapper";
import { Input } from "@/components/ui/Input";
import { Slider } from "@/components/ui/Slider";
import { stopReactFlowEvent } from "@/utils/events";
import type {
  EntityPayload,
  ScriptAttributeDefinition,
} from "@/types/messaging";
import { CurvePicker } from "./CurvePicker";
import { ColorArrayField } from "./ColorArrayField";
import { EntityPicker } from "./EntityPicker";
import { AssetPicker } from "./AssetPicker";

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

    const normalizedValue = normalizeColorList(value);

    return (
      <ColorArrayField
        current={normalizedValue}
        onChange={(next) => {
          // Ensure we maintain the 2D array structure
          onChange(next);
        }}
        channels={channels}
      />
    );
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
  render: ({
    value,
    type,
    definition,
    onChange,
    useState,
    useMemo,
    useCallback,
    useRef,
    useEffect,
  }) => {
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
      <ColorPickerWrapper
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
          value={
            typeof value === "number"
              ? String(value)
              : typeof value === "string"
              ? value
              : ""
          }
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
    const min =
      typeof definition?.min === "number" ? definition.min : undefined;
    const max =
      typeof definition?.max === "number" ? definition.max : undefined;
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
  render: ({ value, entities, entityGuid, onChange }) => {
    return (
      <EntityPicker
        value={value}
        entities={entities}
        entityGuid={entityGuid}
        onChange={onChange}
      />
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
  render: ({ value, definition, onChange }) => {
    return (
      <AssetPicker value={value} definition={definition} onChange={onChange} />
    );
  },
};

/**
 * Curve type handler (both regular curve and colorcurve)
 * Priority: 45 (between vector and entity)
 */
const curveHandler: TypeHandler = {
  priority: 45,
  match: ({ type, definition }) => {
    // Match 'curve' or 'colorcurve' type
    // Also check if type is 'curve' and definition has color (for @color tag)
    return !!(
      type === "curve" ||
      type === "colorcurve" ||
      (type === "curveset" && definition?.curves !== undefined) ||
      (definition?.type?.includes("Curve") &&
        !definition?.type?.includes("Color[]"))
    );
  },
  render: ({ value, type, definition, onChange, useMemo }) => {
    // Determine if this is a color curve
    const isColorCurve =
      type === "colorcurve" ||
      (type === "curve" && definition?.color !== undefined) ||
      (definition?.curves && definition?.color !== undefined);

    // Get curve configuration
    // For colorcurve, curves come from definition.color (e.g., 'rgba' -> ['r', 'g', 'b', 'a'])
    // For regular curve, curves come from definition.curves (e.g., ['Value'])
    const curves = useMemo(() => {
      if (isColorCurve && definition?.color) {
        // If color is a string like 'rgba', split it into ['r', 'g', 'b', 'a']
        if (typeof definition.color === "string") {
          return definition.color.split("");
        }
        // If color is an array, use it directly
        if (Array.isArray(definition.color)) {
          return definition.color;
        }
        // Default for color curve
        return ["r", "g", "b", "a"];
      }
      return definition?.curves || ["Value"];
    }, [isColorCurve, definition?.color, definition?.curves]);

    const min = definition?.min ?? (isColorCurve ? 0 : undefined);
    const max = definition?.max ?? (isColorCurve ? 1 : undefined);

    // Normalize curve value for CurvePicker
    const curveValue = useMemo((): {
      type: number;
      keys: number[][] | number[];
    } | null => {
      if (
        value &&
        typeof value === "object" &&
        "type" in value &&
        "keys" in value
      ) {
        const typedValue = value as { type: unknown; keys: unknown };
        if (
          typeof typedValue.type === "number" &&
          (Array.isArray(typedValue.keys) ||
            typeof typedValue.keys === "object")
        ) {
          return {
            type: typedValue.type,
            keys: typedValue.keys as number[][] | number[],
          };
        }
      }
      // Default curve value
      const defaultKeys = isColorCurve ? curves.map(() => [0, 0]) : [[0, 0]];
      return {
        type: 1, // Smooth Step
        keys: defaultKeys,
      };
    }, [value, isColorCurve, curves]);

    return (
      <CurvePicker
        value={curveValue}
        curves={curves}
        min={min}
        max={max}
        isColorCurve={isColorCurve}
        onChange={onChange}
      />
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
    const isArray =
      type === "array" || (type === "json" && definition?.array === true);
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
        value={
          typeof value === "string"
            ? value
            : typeof value === "number"
            ? String(value)
            : ""
        }
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
  curveHandler,
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
