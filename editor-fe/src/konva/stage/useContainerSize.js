import { useState, useEffect } from 'react';

// Tracks the pixel dimensions of a DOM element via ResizeObserver.
// Returns [size, ref] where size is null until the first real measurement fires.
// This ensures consumers never compute canvas-space coordinates against a stale default.
export function useContainerSize() {
  const [size, setSize] = useState(null);
  const [el, setEl] = useState(null);

  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);

  return [size, setEl];
}
