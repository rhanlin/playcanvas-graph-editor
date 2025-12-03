import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/Input";
import { cn } from "@/utils/cn";
import {
  stopReactFlowEvent,
  stopReactFlowEventWithPreventDefault,
  withStopPropagation,
} from "@/utils/events";
import type { ScriptAttributeDefinition } from "@/types/messaging";
import { useGraphEditorStore } from "@/stores/useGraphEditorStore";

type AssetPickerProps = {
  value: unknown;
  definition?: ScriptAttributeDefinition;
  onChange: (value: unknown) => void;
};

export const AssetPicker: React.FC<AssetPickerProps> = ({
  value,
  definition,
  onChange,
}) => {
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
            "[AssetPicker] Failed to load assets:",
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
};

