import React, { useState } from "react";
import { FloatingPortal } from "@floating-ui/react";
import {
  offset,
  flip,
  shift,
  autoUpdate,
  useFloating,
  useHover,
  useInteractions,
  useDismiss,
  Placement,
} from "@floating-ui/react";

interface FieldTooltipProps {
  label: string;
  description?: string;
  placement?: Placement;
  children: React.ReactElement;
}

export const FieldTooltip = ({
  label,
  description,
  placement = "right",
  children,
}: FieldTooltipProps) => {
  const [tooltipOpen, setTooltipOpen] = useState(false);

  const { refs, context, floatingStyles } = useFloating({
    open: tooltipOpen,
    onOpenChange: setTooltipOpen,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(8),
      flip({
        fallbackAxisSideDirection: "start",
      }),
      shift(),
    ],
  });

  const { getReferenceProps, getFloatingProps } = useInteractions([
    useHover(context, {
      delay: { open: 200, close: 200 },
    }),
    useDismiss(context),
  ]);

  const tooltipContent = description ? (
    <div className="space-y-1">
      <div className="text-xs font-semibold text-pc-text-primary">{label}</div>
      <div className="text-[10px] text-pc-text-dark leading-tight">
        {description}
      </div>
    </div>
  ) : (
    <div className="text-xs font-semibold text-pc-text-primary">{label}</div>
  );

  const triggerElement = children
    ? React.cloneElement(children, {
        ref: refs.setReference,
        ...getReferenceProps(),
      })
    : null;

  return (
    <>
      {triggerElement}
      <FloatingPortal>
        {tooltipOpen && (
          <div
            ref={refs.setFloating}
            style={{ ...floatingStyles, zIndex: 9999 }}
            {...getFloatingProps()}
            className="max-w-xs rounded-lg border border-pc-border-primary/70 bg-pc-darkest/95 px-3 py-2 shadow-xl backdrop-blur-sm"
          >
            {tooltipContent}
          </div>
        )}
      </FloatingPortal>
    </>
  );
};
