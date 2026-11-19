import { useState, useRef, useCallback } from "react";

export function useResizableColumns(initialWidths) {
  const [widths, setWidths] = useState(initialWidths);
  const dragging = useRef(null);

  const onMouseDown = useCallback((e, index) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = widths[index];

    const onMove = (moveEvent) => {
      const delta = moveEvent.clientX - startX;
      setWidths(prev => {
        const next = [...prev];
        next[index] = Math.max(50, startWidth + delta);
        return next;
      });
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      dragging.current = null;
    };

    dragging.current = index;
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [widths]);

  // Build a CSS grid-template-columns string from widths array
  const gridTemplateColumns = widths.map(w => `${w}px`).join(" ");

  return { widths, gridTemplateColumns, onMouseDown };
}