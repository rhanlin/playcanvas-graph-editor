import { useEffect, useLayoutEffect, useRef } from "react";
import { ColorPicker } from "@playcanvas/pcui/react";

type ColorPickerWrapperProps = {
  value: number[];
  onChange: (color: number[]) => void;
  channels: 3 | 4;
};

/**
 * Wrapper component for PCUI ColorPicker that fixes popup positioning
 * and ensures proper interaction with the color spectrum.
 */
export const ColorPickerWrapper = ({
  value,
  onChange,
  channels,
}: ColorPickerWrapperProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const colorInputRef = useRef<HTMLDivElement | null>(null);

  // Find the ColorPicker input element (class: pcui-color-input)
  useLayoutEffect(() => {
    if (!containerRef.current) return;

    const findColorInput = () => {
      const colorInput = containerRef.current?.querySelector(
        ".pcui-color-input"
      ) as HTMLDivElement | null;
      if (colorInput) {
        colorInputRef.current = colorInput;
      }
    };

    // Initial find
    findColorInput();

    // Use MutationObserver to watch for ColorPicker initialization
    const observer = new MutationObserver(() => {
      findColorInput();
    });

    observer.observe(containerRef.current, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  // Position the popup when it appears
  useEffect(() => {
    if (!colorInputRef.current) return;

    const positionPopup = () => {
      // Find popup using multiple selectors for compatibility
      const popup =
        (document.querySelector(
          ".pcui-overlay:has(.pcui-color-picker)"
        ) as HTMLElement) ||
        (document
          .querySelector(".pcui-overlay .pcui-color-picker")
          ?.closest(".pcui-overlay") as HTMLElement) ||
        (document.querySelector(
          '[class*="pcui-overlay"][class*="color"]'
        ) as HTMLElement);

      if (!popup || !colorInputRef.current) return;

      const inputRect = colorInputRef.current.getBoundingClientRect();
      const popupRect = popup.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      const POPUP_WIDTH = popupRect.width || 280;
      const POPUP_HEIGHT = popupRect.height || 300;
      const POPUP_MARGIN = 16;

      // Calculate available space
      const spaceRight = viewportWidth - inputRect.right;
      const spaceLeft = inputRect.left;
      const spaceBottom = viewportHeight - inputRect.bottom;

      let top = inputRect.top;
      let left = inputRect.left;

      // Prefer right side, fallback to left, then bottom
      if (spaceRight >= POPUP_WIDTH + POPUP_MARGIN) {
        // Position to the right
        left = inputRect.right + POPUP_MARGIN;
        top = inputRect.top;
      } else if (spaceLeft >= POPUP_WIDTH + POPUP_MARGIN) {
        // Position to the left
        left = inputRect.left - POPUP_WIDTH - POPUP_MARGIN;
        top = inputRect.top;
      } else {
        // Position below
        left = inputRect.left;
        top = inputRect.bottom + POPUP_MARGIN;
      }

      // Ensure popup stays within viewport
      if (left + POPUP_WIDTH > viewportWidth) {
        left = viewportWidth - POPUP_WIDTH - POPUP_MARGIN;
      }
      if (left < 0) {
        left = POPUP_MARGIN;
      }
      if (top + POPUP_HEIGHT > viewportHeight) {
        top = viewportHeight - POPUP_HEIGHT - POPUP_MARGIN;
      }
      if (top < 0) {
        top = POPUP_MARGIN;
      }

      popup.style.position = "fixed";
      popup.style.left = `${left}px`;
      popup.style.top = `${top}px`;
      popup.style.zIndex = "9999";
      popup.style.transform = "none";
    };

    // Watch for popup appearance
    const observer = new MutationObserver(() => {
      const popup = document.querySelector(
        ".pcui-overlay:has(.pcui-color-picker)"
      ) as HTMLElement | null;
      if (popup) {
        // Use requestAnimationFrame to ensure DOM is fully rendered
        requestAnimationFrame(() => {
          positionPopup();
        });
      }
    });

    // Observe the document for popup creation
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Also check immediately in case popup is already open
    const checkInterval = setInterval(() => {
      if (document.querySelector(".pcui-overlay:has(.pcui-color-picker)")) {
        positionPopup();
        clearInterval(checkInterval);
      }
    }, 50);

    // Update position on scroll/resize
    const updatePosition = () => {
      if (
        document.querySelector(".pcui-overlay:has(.pcui-color-picker)") ||
        document.querySelector(".pcui-overlay .pcui-color-picker")
      ) {
        positionPopup();
      }
    };

    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      observer.disconnect();
      clearInterval(checkInterval);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="nodrag"
      style={{
        position: "relative",
        display: "inline-block",
        width: "auto",
        height: "auto",
      }}
    >
      <ColorPicker value={value} onChange={onChange} channels={channels} />
    </div>
  );
};
