import { useCallback, useRef } from 'react';

interface UseLongPressOptions {
  onLongPress: () => void;
  delay?: number; // milliseconds to wait before triggering
}

/**
 * Hook to detect long press gestures
 * Useful for mobile multi-select patterns
 */
export function useLongPress({ onLongPress, delay = 500 }: UseLongPressOptions) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef(false);

  const start = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      isLongPressRef.current = false;
      timeoutRef.current = setTimeout(() => {
        isLongPressRef.current = true;
        onLongPress();
      }, delay);
    },
    [onLongPress, delay]
  );

  const clear = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const end = useCallback(() => {
    clear();
  }, [clear]);

  return {
    onTouchStart: start,
    onTouchEnd: end,
    onTouchMove: clear, // Cancel on scroll
    onMouseDown: start,
    onMouseUp: end,
    onMouseLeave: clear,
  };
}
