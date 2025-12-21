import React, { useEffect, useState } from "react";
import { stopReactFlowEvent } from "@/utils/events";
import { cn } from "@/utils/cn";

type InputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "onBlur" | "value"
> & {
  value: string | number;
  onChange: (value: string | number) => void;
  onBlur?: (value: string | number) => void;
  /**
   * If false, disables deferred updates.
   * Default: true - updates are deferred until blur/Enter to prevent re-renders during typing.
   * Use false when you need immediate updates (e.g., search inputs).
   */
  deferUpdate?: boolean;
  /**
   * If false, disables ESC key cancel behavior.
   * Default: true - ESC key will cancel changes and restore original value.
   */
  allowCancel?: boolean;
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      value,
      onChange,
      onBlur,
      deferUpdate = true,
      allowCancel = true,
      type = "text",
      className,
      ...props
    },
    ref
  ) => {
    // Local state for deferred updates
    const [localValue, setLocalValue] = useState(
      deferUpdate ? String(value ?? "") : value
    );

    // Sync local value when prop value changes (from external updates)
    useEffect(() => {
      if (deferUpdate) {
        setLocalValue(String(value ?? ""));
      }
    }, [value, deferUpdate]);

    const handleSave = () => {
      if (deferUpdate) {
        const stringValue = String(localValue);
        const originalValue = String(value ?? "");
        if (stringValue !== originalValue) {
          onChange(stringValue);
        }
        onBlur?.(stringValue);
      } else {
        onBlur?.(value);
      }
    };

    const handleCancel = () => {
      if (deferUpdate && allowCancel) {
        setLocalValue(String(value ?? ""));
      }
    };

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
      if (deferUpdate) {
        // Only update local state during typing, don't trigger store update
        setLocalValue(event.target.value);
      } else {
        // For non-deferred inputs, update immediately
        const newValue =
          type === "number" ? Number(event.target.value) : event.target.value;
        onChange(newValue);
      }
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (!deferUpdate) {
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        handleSave();
        // Blur the input to trigger onBlur as well
        event.currentTarget.blur();
      } else if (event.key === "Escape" && allowCancel) {
        event.preventDefault();
        handleCancel();
        // Blur the input
        event.currentTarget.blur();
      }
    };

    const inputValue = deferUpdate ? localValue : value;
    const inputClassName = cn(
      "rounded-lg border border-pc-border-primary bg-pc-darkest px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-pc-text-active",
      className
    );

    return (
      <input
        ref={ref}
        type={type}
        value={inputValue}
        onPointerDownCapture={stopReactFlowEvent}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleSave}
        className={inputClassName}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";
