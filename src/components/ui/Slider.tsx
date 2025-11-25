import React from "react";
import { stopReactFlowEvent } from "@/utils/events";
import { cn } from "@/utils/cn";

type SliderProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "onChange"
> & {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
};

export const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ value, onChange, min, max, step = 0.1, className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDownCapture={stopReactFlowEvent}
        onPointerDown={stopReactFlowEvent}
        onMouseDownCapture={stopReactFlowEvent}
        onMouseDown={stopReactFlowEvent}
        onPointerMoveCapture={stopReactFlowEvent}
        onPointerMove={stopReactFlowEvent}
        onChange={(event) => onChange(Number(event.target.value))}
        className={cn(
          "w-full h-2 cursor-pointer rounded-lg bg-pc-darkest accent-pc-text-active",
          className
        )}
        {...props}
      />
    );
  }
);

Slider.displayName = "Slider";
