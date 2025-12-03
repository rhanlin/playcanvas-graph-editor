import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ColorPicker } from "@playcanvas/pcui/react";
import { cn } from "@/utils/cn";
import {
  stopReactFlowEventWithPreventDefault,
  withStopPropagation,
} from "@/utils/events";

type ColorArrayItemProps = {
  index: number;
  colorValue: unknown;
  channels: 3 | 4;
  isCollapsed: boolean;
  onToggle: () => void;
  onChange: (nextColor: number[]) => void;
  onRemove: () => void;
};

export const ColorArrayItem = memo(
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
    // Use useRef to store the latest colorValue to avoid stale closures in debounce
    const colorValueRef = useRef<unknown>(colorValue);

    // Update ref when colorValue changes
    useEffect(() => {
      colorValueRef.current = colorValue;
    }, [colorValue]);

    // Use useCallback to stabilize the onChange handler
    // Remove colorValue from dependencies to prevent function recreation on every color change
    const handleColorChange = useCallback(
      (newColor: number[]) => {
        // ColorPicker returns values in range 0-1, which is what we need
        // Ensure we only pass the correct number of channels
        const normalizedNewColor = newColor.slice(0, channels);

        // Compare with current value using ref to get the latest value
        const currentValue = Array.isArray(colorValueRef.current)
          ? (colorValueRef.current as number[]).slice(0, channels)
          : null;
        if (currentValue && currentValue.length === normalizedNewColor.length) {
          const hasChanged = currentValue.some(
            (val, idx) => Math.abs(val - normalizedNewColor[idx]) > 0.0001
          );
          if (!hasChanged) {
            return; // Value hasn't changed, skip update
          }
        }

        // Clear any pending update and execute it immediately with the new value
        if (pendingUpdateRef.current) {
          clearTimeout(pendingUpdateRef.current);
          pendingUpdateRef.current = null;
        }

        // Throttle updates to prevent too frequent state changes
        const now = Date.now();
        const timeSinceLastUpdate = now - lastUpdateRef.current;

        if (timeSinceLastUpdate > 50) {
          // Update immediately if enough time has passed
          lastUpdateRef.current = now;
          onChange(normalizedNewColor);
        } else {
          // Debounce rapid updates - but always use the latest value
          pendingUpdateRef.current = setTimeout(() => {
            lastUpdateRef.current = Date.now();
            onChange(normalizedNewColor);
            pendingUpdateRef.current = null;
          }, 50);
        }
      },
      [onChange, channels]
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

export const ColorArrayField = ({
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

  // Use useRef to store the latest current array to avoid stale closures in debounce
  const currentRef = useRef<unknown[]>(current);
  useEffect(() => {
    currentRef.current = current;
  }, [current]);

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

  const handleItemChange = useCallback(
    (index: number, next: unknown) => {
      // Use ref to get the latest current array, ensuring we always work with the most up-to-date state
      // This prevents issues when multiple items update simultaneously with debounce
      const latestCurrent = currentRef.current;
      const nextValues = [...latestCurrent];
      nextValues[index] = next;
      onChange(nextValues);
    },
    [onChange]
  );

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
            key={`color-${index}`}
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

