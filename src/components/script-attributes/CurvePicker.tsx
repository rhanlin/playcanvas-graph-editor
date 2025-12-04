import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/utils/cn";
import {
  stopReactFlowEvent,
  stopReactFlowEventWithPreventDefault,
} from "@/utils/events";

// Curve types
const CURVE_LINEAR = 0;
const CURVE_SMOOTHSTEP = 1;
const CURVE_LEGACY_SPLINE = 2;
const CURVE_SPLINE = 4;
const CURVE_STEP = 5;

// Colors for different curves
const CURVE_COLORS = [
  "rgb(255, 0, 0)", // R
  "rgb(0, 255, 0)", // G
  "rgb(133, 133, 252)", // B
  "rgb(255, 255, 255)", // A
];

interface CurveKey {
  time: number;
  value: number;
}

interface CurveData {
  type: number;
  keys: CurveKey[][];
}

interface CurvePickerProps {
  value: { type: number; keys: number[][] | number[] } | null | undefined;
  curves: string[]; // Curve names like ['Value'] or ['r', 'g', 'b', 'a']
  min?: number;
  max?: number;
  isColorCurve?: boolean;
  onChange: (value: { type: number; keys: number[][] | number[] }) => void;
}

export const CurvePicker: React.FC<CurvePickerProps> = ({
  value,
  curves,
  min,
  max,
  isColorCurve = false,
  onChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gradientCanvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedCurveIndex, setSelectedCurveIndex] = useState(0);
  const [selectedKeyIndex, setSelectedKeyIndex] = useState<number | null>(null);
  const [hoveredCurveIndex, setHoveredCurveIndex] = useState<number | null>(
    null
  );
  const [hoveredKeyIndex, setHoveredKeyIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(
    null
  );
  const [curveType, setCurveType] = useState(CURVE_SMOOTHSTEP);
  const [enabledCurves, setEnabledCurves] = useState<boolean[]>(
    new Array(curves.length).fill(true)
  );

  // Local state for dragging - used to show immediate feedback without waiting for store update
  const [localCurveData, setLocalCurveData] = useState<CurveData | null>(null);

  // Normalize value to CurveData format
  const curveData = useMemo(() => {
    if (!value || typeof value !== "object") {
      // Default: one key at (0, 0)
      return {
        type: CURVE_SMOOTHSTEP,
        keys: curves.map(() => [{ time: 0, value: 0 }]),
      };
    }

    const type = value.type ?? CURVE_SMOOTHSTEP;
    let keys: CurveKey[][] = [];

    if (Array.isArray(value.keys)) {
      if (value.keys.length === 0) {
        keys = curves.map(() => [{ time: 0, value: 0 }]);
      } else if (Array.isArray(value.keys[0])) {
        // Multi-dimensional array: array of flat arrays
        // Format: [[time1, value1, time2, value2, ...], [time1, value1, ...], ...]
        // Each element is a flat array [time, value, time, value, ...]
        keys = (value.keys as number[][]).map((curveKeys: number[]) => {
          const result: CurveKey[] = [];
          // Parse flat array [time, value, time, value, ...]
          for (let i = 0; i < curveKeys.length - 1; i += 2) {
            result.push({
              time: curveKeys[i] ?? 0,
              value: curveKeys[i + 1] ?? 0,
            });
          }
          return result;
        });
      } else {
        // Flat array: [time, value, time, value, ...] for single curve
        const flatKeys = value.keys as number[];
        const singleCurveKeys: CurveKey[] = [];
        for (let i = 0; i < flatKeys.length - 1; i += 2) {
          singleCurveKeys.push({
            time: flatKeys[i] ?? 0,
            value: flatKeys[i + 1] ?? 0,
          });
        }
        keys = [singleCurveKeys];
      }
    }

    // Ensure we have keys for all curves
    while (keys.length < curves.length) {
      keys.push([{ time: 0, value: 0 }]);
    }

    return { type, keys };
  }, [value, curves]);

  // Use local curve data if dragging, otherwise use normalized value
  const displayCurveData: CurveData =
    isDragging && localCurveData ? localCurveData : curveData;

  // Use refs to store latest values for drag operations
  const curveDataRef = useRef(displayCurveData);
  const selectedCurveIndexRef = useRef(selectedCurveIndex);
  const selectedKeyIndexRef = useRef<number | null>(selectedKeyIndex);
  const hoveredCurveIndexRef = useRef<number | null>(null);
  const hoveredKeyIndexRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);

  // Update curveType when value changes
  useEffect(() => {
    if (curveData.type !== undefined) {
      setCurveType(curveData.type);
    }
  }, [curveData.type]);

  // Keep refs in sync with state
  useEffect(() => {
    curveDataRef.current = displayCurveData;
  }, [displayCurveData]);

  // Reset local curve data when dragging ends
  useEffect(() => {
    if (!isDragging && localCurveData) {
      setLocalCurveData(null);
    }
  }, [isDragging, localCurveData]);

  useEffect(() => {
    selectedCurveIndexRef.current = selectedCurveIndex;
  }, [selectedCurveIndex]);

  useEffect(() => {
    selectedKeyIndexRef.current = selectedKeyIndex;
  }, [selectedKeyIndex]);

  useEffect(() => {
    hoveredCurveIndexRef.current = hoveredCurveIndex;
  }, [hoveredCurveIndex]);

  useEffect(() => {
    hoveredKeyIndexRef.current = hoveredKeyIndex;
  }, [hoveredKeyIndex]);

  useEffect(() => {
    isDraggingRef.current = isDragging;
  }, [isDragging]);

  // Canvas dimensions
  const canvasWidth = 400;
  const canvasHeight = 200;
  const padding = 20;
  const axisSpacing = 20;
  const anchorRadius = 4;
  const anchorHoverRadius = 8;

  // Calculate value range - match Editor's logic
  // Editor uses: maxLimit = Math.ceil(2 * Math.max(Math.abs(min), Math.abs(max)))
  // Then creates symmetric range: [-maxLimit, maxLimit]
  const actualValueRange = useMemo(() => {
    let actualMin = Infinity;
    let actualMax = -Infinity;

    // Find min/max from all curve keys
    curveData.keys.forEach((keys) => {
      keys.forEach((key) => {
        actualMin = Math.min(actualMin, key.value);
        actualMax = Math.max(actualMax, key.value);
      });
    });

    // If no keys found, use defaults (Editor default: verticalValue = 5)
    if (actualMin === Infinity) {
      return { min: -5, max: 5 };
    }

    // Editor's logic: maxLimit = Math.ceil(2 * Math.max(Math.abs(min), Math.abs(max)))
    const maxAbsValue = Math.max(Math.abs(actualMin), Math.abs(actualMax));
    let maxLimit = Math.ceil(2 * maxAbsValue);

    // If maxLimit is 0, use default (Editor uses verticalValue = 5)
    if (maxLimit === 0) {
      maxLimit = 5;
    }

    // Create symmetric range
    let rangeMin = -maxLimit;
    let rangeMax = maxLimit;

    // Apply provided min/max constraints if available
    if (min !== undefined) {
      rangeMin = Math.max(rangeMin, min);
    }
    if (max !== undefined) {
      rangeMax = Math.min(rangeMax, max);
    }

    return { min: rangeMin, max: rangeMax };
  }, [displayCurveData.keys, min, max]);

  const valueMin = actualValueRange.min;
  const valueMax = actualValueRange.max;
  // Ensure valueRange is never zero (add small epsilon if needed)
  const valueRange = Math.max(valueMax - valueMin, 0.0001);

  // Convert canvas coordinates to curve coordinates
  // Match Editor's calculateAnchorValue logic:
  // return pc.math.lerp(verticalTopValue, verticalBottomValue, (coords[1] - top) / height)
  // Editor also clamps coords to grid before converting
  const canvasToCurve = useCallback(
    (x: number, y: number): { time: number; value: number } => {
      // Clamp x to grid bounds (like Editor does)
      const gridLeft = padding;
      const gridRight = canvasWidth - padding;
      const gridTop = padding;
      const gridBottom = canvasHeight - padding;

      const clampedX = Math.max(gridLeft, Math.min(gridRight, x));
      const clampedY = Math.max(gridTop, Math.min(gridBottom, y));

      const time = Math.max(
        0,
        Math.min(1, (clampedX - gridLeft) / (gridRight - gridLeft))
      );
      // Editor uses lerp: lerp(verticalTopValue, verticalBottomValue, t)
      // where t = (y - top) / height
      const t = (clampedY - gridTop) / (gridBottom - gridTop);
      const value = valueMax + (valueMin - valueMax) * t;

      return {
        time,
        value: Math.max(valueMin, Math.min(valueMax, value)),
      };
    },
    [valueMin, valueMax, valueRange]
  );

  // Convert curve coordinates to canvas coordinates
  // Match Editor's calculateAnchorCoords logic:
  // coords[1] = top + gridHeight() * (value - verticalTopValue) / (verticalBottomValue - verticalTopValue)
  const curveToCanvas = useCallback(
    (time: number, value: number): { x: number; y: number } => {
      const x = padding + time * (canvasWidth - padding * 2);
      // Editor uses: (value - verticalTopValue) / (verticalBottomValue - verticalTopValue)
      // where verticalTopValue is max and verticalBottomValue is min
      const y =
        padding +
        ((value - valueMax) / (valueMin - valueMax)) *
          (canvasHeight - padding * 2);
      return { x, y };
    },
    [valueMin, valueMax, valueRange]
  );

  // Interpolate curve value at given time
  const interpolateCurve = useCallback(
    (keys: CurveKey[], time: number, type: number): number => {
      if (keys.length === 0) return 0;
      if (keys.length === 1) return keys[0].value;

      // Find the two keys that bracket the time
      let leftIndex = 0;
      let rightIndex = keys.length - 1;

      for (let i = 0; i < keys.length - 1; i++) {
        if (keys[i].time <= time && keys[i + 1].time >= time) {
          leftIndex = i;
          rightIndex = i + 1;
          break;
        }
      }

      // Clamp to edges
      if (time <= keys[0].time) return keys[0].value;
      if (time >= keys[keys.length - 1].time)
        return keys[keys.length - 1].value;

      const leftKey = keys[leftIndex];
      const rightKey = keys[rightIndex];
      const t = (time - leftKey.time) / (rightKey.time - leftKey.time);

      switch (type) {
        case CURVE_LINEAR:
          return leftKey.value + (rightKey.value - leftKey.value) * t;
        case CURVE_SMOOTHSTEP:
          const smoothT = t * t * (3 - 2 * t);
          return leftKey.value + (rightKey.value - leftKey.value) * smoothT;
        case CURVE_STEP:
          return leftKey.value;
        case CURVE_SPLINE:
        case CURVE_LEGACY_SPLINE:
          // Simplified spline - use smoothstep for now
          const splineT = t * t * (3 - 2 * t);
          return leftKey.value + (rightKey.value - leftKey.value) * splineT;
        default:
          return leftKey.value + (rightKey.value - leftKey.value) * t;
      }
    },
    []
  );

  // Draw curve on canvas
  const drawCurve = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      keys: CurveKey[],
      color: string,
      type: number
    ) => {
      if (keys.length === 0) return;

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();

      if (keys.length === 1) {
        const { x, y } = curveToCanvas(keys[0].time, keys[0].value);
        ctx.moveTo(x, y);
        ctx.lineTo(x, y);
      } else {
        const sortedKeys = [...keys].sort((a, b) => a.time - b.time);
        const step = 1 / (canvasWidth - padding * 2);

        for (let t = 0; t <= 1; t += step) {
          const value = interpolateCurve(sortedKeys, t, type);
          const { x, y } = curveToCanvas(t, value);
          if (t === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
      }

      ctx.stroke();
    },
    [curveToCanvas, interpolateCurve]
  );

  // Render canvas
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Draw background
    ctx.fillStyle = "#293538";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Draw grid
    ctx.strokeStyle = "#20292b";
    ctx.lineWidth = 1;

    // Vertical grid lines
    for (let i = 0; i <= 10; i++) {
      const x = padding + (i / 10) * (canvasWidth - padding * 2);
      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, canvasHeight - padding);
      ctx.stroke();
    }

    // Horizontal grid lines
    for (let i = 0; i <= 10; i++) {
      const y = padding + (i / 10) * (canvasHeight - padding * 2);
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(canvasWidth - padding, y);
      ctx.stroke();
    }

    // Draw zero line if 0 is within the value range
    if (valueMin <= 0 && valueMax >= 0) {
      const { x: zeroX, y: zeroY } = curveToCanvas(0, 0);
      ctx.strokeStyle = "#4a5568";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(padding, zeroY);
      ctx.lineTo(canvasWidth - padding, zeroY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw curves
    displayCurveData.keys.forEach((keys, index) => {
      if (enabledCurves[index] && keys.length > 0) {
        const color = CURVE_COLORS[index % CURVE_COLORS.length];
        drawCurve(ctx, keys, color, curveType);
      }
    });

    // Draw anchors (control points) - draw normal anchors first
    displayCurveData.keys.forEach((keys, curveIndex) => {
      if (enabledCurves[curveIndex]) {
        const color = CURVE_COLORS[curveIndex % CURVE_COLORS.length];
        keys.forEach((key, keyIndex) => {
          const isSelected =
            selectedCurveIndex === curveIndex && selectedKeyIndex === keyIndex;
          const isHovered =
            hoveredCurveIndex === curveIndex && hoveredKeyIndex === keyIndex;

          // Skip drawing if it's selected or hovered (will draw later on top)
          if (!isSelected && !isHovered) {
            const { x, y } = curveToCanvas(key.time, key.value);
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(x, y, anchorRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        });
      }
    });

    // Draw hovered and selected anchors on top (like Editor does)
    displayCurveData.keys.forEach((keys, curveIndex) => {
      if (enabledCurves[curveIndex]) {
        const color = CURVE_COLORS[curveIndex % CURVE_COLORS.length];
        keys.forEach((key, keyIndex) => {
          const isSelected =
            selectedCurveIndex === curveIndex && selectedKeyIndex === keyIndex;
          const isHovered =
            hoveredCurveIndex === curveIndex && hoveredKeyIndex === keyIndex;

          if (isSelected || isHovered) {
            const { x, y } = curveToCanvas(key.time, key.value);
            ctx.fillStyle = isSelected ? "#ffff00" : color;
            ctx.beginPath();
            ctx.arc(x, y, anchorHoverRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "#ffff00";
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        });
      }
    });
  }, [
    displayCurveData,
    enabledCurves,
    selectedCurveIndex,
    selectedKeyIndex,
    hoveredCurveIndex,
    hoveredKeyIndex,
    curveType,
    curveToCanvas,
    drawCurve,
  ]);

  // Render gradient canvas (for color curves)
  const renderGradient = useCallback(() => {
    if (!isColorCurve) return;

    const canvas = gradientCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Draw checkerboard pattern
    ctx.fillStyle = "#949a9c";
    ctx.fillRect(0, 0, 8, 8);
    ctx.fillRect(8, 8, 8, 8);
    ctx.fillStyle = "#657375";
    ctx.fillRect(8, 0, 8, 8);
    ctx.fillRect(0, 8, 8, 8);

    // Create gradient from curves
    const gradient = ctx.createLinearGradient(0, 0, width, 0);

    for (let t = 0; t <= width; t += 2) {
      const time = t / width;
      const rgb: number[] = [];

      // Evaluate each curve at this time
      curveData.keys.forEach((keys, index) => {
        if (index < 4) {
          rgb[index] = interpolateCurve(keys, time, curveType);
        }
      });

      // Normalize to 0-255
      const r = Math.round((rgb[0] ?? 0) * 255);
      const g = Math.round((rgb[1] ?? 0) * 255);
      const b = Math.round((rgb[2] ?? 0) * 255);
      const a = rgb[3] ?? 1;

      gradient.addColorStop(time, `rgba(${r}, ${g}, ${b}, ${a})`);
    }

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }, [isColorCurve, displayCurveData, curveType, interpolateCurve]);

  // Update curve value
  const updateCurveValue = useCallback(() => {
    const keys: number[][] = curveData.keys.map((curveKeys) =>
      curveKeys.flatMap((key) => [key.time, key.value])
    );

    onChange({
      type: curveType,
      keys: keys.length === 1 ? keys[0] : keys,
    });
  }, [curveData, curveType, onChange]);

  // Handle mouse down
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // Only handle left mouse button
      if (e.button !== 0) return;

      // Prevent React Flow from handling this event
      e.stopPropagation();
      // Don't preventDefault here - it might prevent mousemove events
      // e.preventDefault();

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Check if clicking within grid bounds (like Editor does)
      const gridLeft = padding;
      const gridRight = canvasWidth - padding;
      const gridTop = padding;
      const gridBottom = canvasHeight - padding;

      const inGrid =
        x >= gridLeft && x <= gridRight && y >= gridTop && y <= gridBottom;
      if (!inGrid) return;

      const { time, value } = canvasToCurve(x, y);

      // Check if clicking on an anchor
      let clickedAnchor = false;
      const currentCurveData = curveDataRef.current;

      currentCurveData.keys.forEach((keys, curveIndex) => {
        if (!enabledCurves[curveIndex]) return;

        keys.forEach((key, keyIndex) => {
          const { x: keyX, y: keyY } = curveToCanvas(key.time, key.value);
          const dist = Math.sqrt((x - keyX) ** 2 + (y - keyY) ** 2);

          if (dist < anchorHoverRadius) {
            setSelectedCurveIndex(curveIndex);
            setSelectedKeyIndex(keyIndex);
            setIsDragging(true);
            setDragStart({ x, y });
            clickedAnchor = true;

            // Update refs immediately
            selectedCurveIndexRef.current = curveIndex;
            selectedKeyIndexRef.current = keyIndex;
            isDraggingRef.current = true;
          }
        });
      });

      // If not clicking on anchor, add a new key
      if (!clickedAnchor && enabledCurves[selectedCurveIndexRef.current]) {
        const currentCurveIndex = selectedCurveIndexRef.current;
        const newKeys = [...currentCurveData.keys[currentCurveIndex]];
        newKeys.push({ time, value });
        newKeys.sort((a, b) => a.time - b.time);

        const updatedKeys = [...currentCurveData.keys];
        updatedKeys[currentCurveIndex] = newKeys;

        const newKeyIndex = newKeys.findIndex(
          (k) =>
            Math.abs(k.time - time) < 0.001 && Math.abs(k.value - value) < 0.001
        );

        setSelectedKeyIndex(newKeyIndex);
        setIsDragging(true);
        setDragStart({ x, y });

        // Update refs immediately
        selectedKeyIndexRef.current = newKeyIndex;

        // Update value immediately
        const keys: number[][] = updatedKeys.map((curveKeys) =>
          curveKeys.flatMap((key) => [key.time, key.value])
        );
        onChange({
          type: curveType,
          keys: keys.length === 1 ? keys[0] : keys,
        });
      }
    },
    [canvasToCurve, enabledCurves, curveType, onChange, curveToCanvas]
  );

  // Get hovered anchor (like Editor's getHoveredAnchor)
  const getHoveredAnchor = useCallback(
    (
      x: number,
      y: number
    ): { curveIndex: number | null; keyIndex: number | null } => {
      const currentCurveData = curveDataRef.current;
      let hoveredCurve: number | null = null;
      let hoveredKey: number | null = null;

      // Check anchors first (from back to front, like Editor)
      for (
        let curveIndex = currentCurveData.keys.length - 1;
        curveIndex >= 0;
        curveIndex--
      ) {
        if (!enabledCurves[curveIndex]) continue;

        const keys = currentCurveData.keys[curveIndex];
        for (let keyIndex = keys.length - 1; keyIndex >= 0; keyIndex--) {
          const key = keys[keyIndex];
          const { x: keyX, y: keyY } = curveToCanvas(key.time, key.value);
          const dist = Math.sqrt((x - keyX) ** 2 + (y - keyY) ** 2);

          if (dist < anchorHoverRadius) {
            return { curveIndex, keyIndex };
          }
        }
      }

      return { curveIndex: null, keyIndex: null };
    },
    [enabledCurves, curveToCanvas]
  );

  // Handle mouse move - handles both dragging and hover detection
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      // Prevent default to avoid text selection
      e.preventDefault();

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // If dragging, update anchor position
      if (isDraggingRef.current && selectedKeyIndexRef.current !== null) {
        // Clamp coordinates to grid bounds (like Editor does)
        const gridLeft = padding;
        const gridRight = canvasWidth - padding;
        const gridTop = padding;
        const gridBottom = canvasHeight - padding;

        const clampedX = Math.max(gridLeft, Math.min(gridRight, x));
        const clampedY = Math.max(gridTop, Math.min(gridBottom, y));

        const { time, value } = canvasToCurve(clampedX, clampedY);

        // Use refs to get latest values
        const currentCurveData = curveDataRef.current;
        const currentCurveIndex = selectedCurveIndexRef.current;
        const currentKeyIndex = selectedKeyIndexRef.current;

        if (currentKeyIndex !== null && currentCurveIndex >= 0) {
          const updatedKeys = [...currentCurveData.keys];
          const curveKeys = [...updatedKeys[currentCurveIndex]];

          // Update the key at the selected index
          if (currentKeyIndex < curveKeys.length) {
            // Check if there's another key with the same time (like Editor does)
            let finalValue = value;
            for (let i = 0; i < curveKeys.length; i++) {
              if (
                i !== currentKeyIndex &&
                Math.abs(curveKeys[i].time - time) < 0.001
              ) {
                // Make them have the same value
                finalValue = curveKeys[i].value;
                break;
              }
            }

            curveKeys[currentKeyIndex] = { time, value: finalValue };
            curveKeys.sort((a, b) => a.time - b.time);

            // Update selectedKeyIndex after sort
            const newKeyIndex = curveKeys.findIndex(
              (k) =>
                Math.abs(k.time - time) < 0.001 &&
                Math.abs(k.value - finalValue) < 0.001
            );
            updatedKeys[currentCurveIndex] = curveKeys;

            // Update local state immediately for visual feedback
            const updatedCurveData: CurveData = {
              type: curveType,
              keys: updatedKeys,
            };
            setLocalCurveData(updatedCurveData);
            curveDataRef.current = updatedCurveData;

            // Don't call onChange during drag - only update on mouseup
            // This prevents the laggy feeling from store updates

            if (newKeyIndex >= 0) {
              setSelectedKeyIndex(newKeyIndex);
              selectedKeyIndexRef.current = newKeyIndex;
            }
          }
        }
      } else {
        // Not dragging - check for hover (like Editor does)
        const hovered = getHoveredAnchor(x, y);
        if (
          hovered.curveIndex !== hoveredCurveIndexRef.current ||
          hovered.keyIndex !== hoveredKeyIndexRef.current
        ) {
          setHoveredCurveIndex(hovered.curveIndex);
          setHoveredKeyIndex(hovered.keyIndex);
          hoveredCurveIndexRef.current = hovered.curveIndex;
          hoveredKeyIndexRef.current = hovered.keyIndex;

          // Update cursor (like Editor does)
          if (canvasRef.current) {
            canvasRef.current.style.cursor =
              hovered.curveIndex !== null || hovered.keyIndex !== null
                ? "pointer"
                : "";
          }
          // Note: React will automatically re-render when hover state changes
        }
      }
    },
    [canvasToCurve, curveType, onChange, getHoveredAnchor]
  );

  // Handle mouse up
  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      // Only handle left mouse button
      if (e.button !== 0) return;

      if (isDraggingRef.current) {
        // Update store with final position when drag ends
        if (localCurveData) {
          const keys: number[][] = localCurveData.keys.map((curveKeys) =>
            curveKeys.flatMap((key) => [key.time, key.value])
          );
          onChange({
            type: localCurveData.type,
            keys: keys.length === 1 ? keys[0] : keys,
          });
        }

        setIsDragging(false);
        setDragStart(null);
        isDraggingRef.current = false;
      }
    },
    [localCurveData, onChange]
  );

  // Store handlers in refs to avoid recreating event listeners
  const handleMouseMoveRef = useRef(handleMouseMove);
  const handleMouseUpRef = useRef(handleMouseUp);

  // Update refs when handlers change
  useEffect(() => {
    handleMouseMoveRef.current = handleMouseMove;
  }, [handleMouseMove]);

  useEffect(() => {
    handleMouseUpRef.current = handleMouseUp;
  }, [handleMouseUp]);

  // Set up mouse event listeners - always listen for both hover and drag
  // Like Editor, we always listen to mousemove and mouseup
  // Use refs in the event listeners to avoid dependency issues
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      handleMouseMoveRef.current(e);
    };

    const handleUp = (e: MouseEvent) => {
      handleMouseUpRef.current(e);
    };

    // Always listen for mousemove (for both hover and drag)
    window.addEventListener("mousemove", handleMove, { passive: false });
    // Always listen for mouseup (to end drag)
    window.addEventListener("mouseup", handleUp, { passive: false });

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, []); // Empty deps - only set up once on mount

  // Render on changes
  useEffect(() => {
    render();
  }, [render]);

  // Also render when displayCurveData changes directly (in case render dependency doesn't catch it)
  useEffect(() => {
    render();
  }, [displayCurveData, render]);

  useEffect(() => {
    renderGradient();
  }, [renderGradient]);

  // Handle curve type change
  const handleCurveTypeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newType = parseInt(e.target.value, 10);
      setCurveType(newType);
      updateCurveValue();
    },
    [updateCurveValue]
  );

  // Handle curve toggle
  const handleCurveToggle = useCallback(
    (index: number) => {
      const newEnabled = [...enabledCurves];
      newEnabled[index] = !newEnabled[index];
      setEnabledCurves(newEnabled);
    },
    [enabledCurves]
  );

  // Handle delete key
  const handleDeleteKey = useCallback(() => {
    if (selectedKeyIndex === null) return;

    const updatedKeys = [...curveData.keys];
    const curveKeys = [...updatedKeys[selectedCurveIndex]];
    if (curveKeys.length > 1) {
      curveKeys.splice(selectedKeyIndex, 1);
      updatedKeys[selectedCurveIndex] = curveKeys;

      const keys: number[][] = updatedKeys.map((curveKeys) =>
        curveKeys.flatMap((key) => [key.time, key.value])
      );
      onChange({
        type: curveType,
        keys: keys.length === 1 ? keys[0] : keys,
      });

      setSelectedKeyIndex(null);
    }
  }, [
    selectedKeyIndex,
    selectedCurveIndex,
    displayCurveData,
    curveType,
    onChange,
  ]);

  // Handle reset curve
  const handleResetCurve = useCallback(() => {
    const updatedKeys = [...displayCurveData.keys];
    updatedKeys[selectedCurveIndex] = [{ time: 0, value: 0 }];

    const keys: number[][] = updatedKeys.map((curveKeys) =>
      curveKeys.flatMap((key) => [key.time, key.value])
    );
    onChange({
      type: curveType,
      keys: keys.length === 1 ? keys[0] : keys,
    });

    setSelectedKeyIndex(null);
  }, [selectedCurveIndex, displayCurveData, curveType, onChange]);

  return (
    <div
      className="nodrag rounded-lg border border-pc-border-primary bg-pc-dark p-3"
      onPointerDownCapture={stopReactFlowEvent}
      onMouseDown={stopReactFlowEvent}
      // Don't stop mousemove here - we need it to reach window listeners for dragging
      // onPointerMove={stopReactFlowEvent}
      // onMouseMove={stopReactFlowEvent}
    >
      <div className="flex flex-col gap-2">
        {/* Header */}
        <div className="flex items-center gap-2">
          <select
            value={curveType}
            onChange={handleCurveTypeChange}
            className="rounded border border-pc-border-primary bg-pc-dark px-2 py-1 text-xs text-pc-text-secondary"
            onPointerDownCapture={stopReactFlowEvent}
            onMouseDown={stopReactFlowEvent}
          >
            <option value={CURVE_LINEAR}>Linear</option>
            <option value={CURVE_SMOOTHSTEP}>Smooth Step</option>
            <option value={CURVE_SPLINE}>Spline</option>
            <option value={CURVE_STEP}>Step</option>
          </select>

          {/* Curve toggles */}
          {curves.map((name, index) => (
            <button
              key={index}
              type="button"
              onClick={() => handleCurveToggle(index)}
              className={cn(
                "rounded px-2 py-1 text-xs font-semibold",
                enabledCurves[index]
                  ? "bg-pc-primary text-pc-text-primary"
                  : "bg-pc-dark text-pc-text-dark"
              )}
              style={{
                color: enabledCurves[index]
                  ? CURVE_COLORS[index % CURVE_COLORS.length]
                  : undefined,
              }}
              onPointerDownCapture={stopReactFlowEvent}
              onMouseDown={stopReactFlowEvent}
            >
              {name}
            </button>
          ))}
        </div>

        {/* Gradient canvas (for color curves) */}
        {isColorCurve && (
          <canvas
            ref={gradientCanvasRef}
            width={canvasWidth}
            height={32}
            className="rounded border border-pc-border-primary"
            style={{ imageRendering: "pixelated" }}
          />
        )}

        {/* Main canvas */}
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          className="rounded border border-pc-border-primary"
          onMouseDown={handleMouseDown}
          onPointerDownCapture={stopReactFlowEvent}
          // Don't handle mousemove here - we use window listeners instead
          // This allows dragging to work even when mouse moves outside canvas
          onMouseLeave={() => {
            // Clear hover when mouse leaves canvas
            setHoveredCurveIndex(null);
            setHoveredKeyIndex(null);
            hoveredCurveIndexRef.current = null;
            hoveredKeyIndexRef.current = null;
            if (canvasRef.current) {
              canvasRef.current.style.cursor = "";
            }
          }}
        />

        {/* Footer */}
        <div className="flex items-center gap-2">
          {selectedKeyIndex !== null && (
            <>
              <div className="text-xs text-pc-text-secondary">
                Time:{" "}
                {curveData.keys[selectedCurveIndex][
                  selectedKeyIndex
                ]?.time.toFixed(2)}
              </div>
              <div className="text-xs text-pc-text-secondary">
                Value:{" "}
                {curveData.keys[selectedCurveIndex][
                  selectedKeyIndex
                ]?.value.toFixed(2)}
              </div>
              <button
                type="button"
                onClick={handleDeleteKey}
                className="rounded bg-red-600 px-2 py-1 text-xs text-white"
                onPointerDownCapture={stopReactFlowEvent}
                onMouseDown={stopReactFlowEvent}
              >
                Delete
              </button>
            </>
          )}
          <button
            type="button"
            onClick={handleResetCurve}
            className="rounded bg-pc-primary px-2 py-1 text-xs text-pc-text-primary"
            onPointerDownCapture={stopReactFlowEvent}
            onMouseDown={stopReactFlowEvent}
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
};
