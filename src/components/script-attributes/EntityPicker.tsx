import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { WheelEvent } from "react";
import { Input } from "@/components/ui/Input";
import { cn } from "@/utils/cn";
import {
  stopReactFlowEvent,
  stopReactFlowEventWithPreventDefault,
  withStopPropagation,
} from "@/utils/events";
import type { EntityPayload } from "@/types/messaging";
import { useGraphEditorStore } from "@/stores/useGraphEditorStore";

type EntityPickerProps = {
  value: unknown;
  entities: Record<string, EntityPayload>;
  entityGuid: string;
  onChange: (value: unknown) => void;
};

export const EntityPicker: React.FC<EntityPickerProps> = ({
  value,
  entities,
  entityGuid,
  onChange,
}) => {
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
};

