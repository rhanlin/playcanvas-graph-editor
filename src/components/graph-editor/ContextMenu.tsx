import React, { useRef, useLayoutEffect } from "react";
import { cn } from "@/utils/cn";

interface ContextMenuProps {
  x: number;
  y: number;
  targetNodeId: string | null;
  onAddEntity: () => void;
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  targetNodeId,
  onAddEntity,
  onClose,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    // Click outside handler
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{ top: y, left: x }}
      className={cn(
        "fixed z-50 min-w-[160px] overflow-hidden rounded-md border border-pc-border-primary bg-pc-darker shadow-lg",
        "flex flex-col py-1"
      )}
    >
      <button
        className="flex w-full items-center px-3 py-2 text-left text-sm text-pc-text-primary hover:bg-pc-primary hover:text-white"
        onClick={() => {
          onAddEntity();
          onClose();
        }}
      >
        {targetNodeId ? "Add Child Entity" : "Add Entity"}
      </button>
    </div>
  );
};

