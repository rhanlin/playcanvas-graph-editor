import type { SyntheticEvent } from "react";

type NativeEventLike = {
  stopImmediatePropagation?: () => void;
};

export const stopReactFlowEvent = (event: SyntheticEvent) => {
  event.stopPropagation();
  const native = event.nativeEvent as NativeEventLike | undefined;
  if (native?.stopImmediatePropagation) {
    native.stopImmediatePropagation();
  }
};

export const stopReactFlowEventWithPreventDefault = (event: SyntheticEvent) => {
  event.preventDefault();
  stopReactFlowEvent(event);
};

export const withStopPropagation = <T extends SyntheticEvent>(
  handler?: (event: T) => void
) => {
  return (event: T) => {
    stopReactFlowEvent(event);
    handler?.(event);
  };
};
