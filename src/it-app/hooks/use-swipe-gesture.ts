"use client";

import { useRef, useCallback, useState, useEffect } from 'react';

export type SwipeDirection = 'left' | 'right' | 'up' | 'down';

export interface SwipeState {
  /** Current swipe progress (0-1) for the primary axis */
  progress: number;
  /** Whether a swipe gesture is in progress */
  isSwiping: boolean;
  /** The direction being swiped */
  direction: SwipeDirection | null;
  /** Current translation in pixels */
  translation: { x: number; y: number };
}

export interface UseSwipeGestureOptions {
  /** Direction to detect swipes (default: 'right') */
  direction?: SwipeDirection;
  /** Minimum velocity required to trigger swipe (px/ms, default: 0.5) */
  velocityThreshold?: number;
  /** Distance required to complete swipe (px, default: 100) */
  distanceThreshold?: number;
  /** Edge zone width for edge-triggered swipes (px, default: 30) */
  edgeZone?: number;
  /** Whether swipe should only trigger from edge (default: true for back navigation) */
  edgeTriggered?: boolean;
  /** Callback when swipe is completed */
  onSwipe?: () => void;
  /** Callback during swipe with progress */
  onSwipeProgress?: (progress: number) => void;
  /** Callback when swipe is cancelled */
  onSwipeCancel?: () => void;
  /** Whether gesture is enabled (default: true) */
  enabled?: boolean;
}

interface TouchData {
  startX: number;
  startY: number;
  startTime: number;
  isEdgeSwipe: boolean;
  isValidSwipe: boolean;
}

/**
 * Hook for detecting swipe gestures with edge-triggered support
 *
 * Features:
 * - Edge-triggered detection to avoid conflicts with scrolling
 * - Velocity-based completion for natural feel
 * - Progress tracking for visual feedback
 * - Direction locking after initial movement
 */
export function useSwipeGesture(options: UseSwipeGestureOptions = {}) {
  const {
    direction = 'right',
    velocityThreshold = 0.5,
    distanceThreshold = 100,
    edgeZone = 30,
    edgeTriggered = true,
    onSwipe,
    onSwipeProgress,
    onSwipeCancel,
    enabled = true,
  } = options;

  const touchDataRef = useRef<TouchData | null>(null);
  const [state, setState] = useState<SwipeState>({
    progress: 0,
    isSwiping: false,
    direction: null,
    translation: { x: 0, y: 0 },
  });

  // Determine if the swipe is horizontal or vertical
  const isHorizontal = direction === 'left' || direction === 'right';

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!enabled) return;

    const touch = e.touches[0];
    const startX = touch.clientX;
    const startY = touch.clientY;

    // Check if touch started in edge zone
    let isEdgeSwipe = false;
    if (edgeTriggered) {
      switch (direction) {
        case 'right':
          isEdgeSwipe = startX <= edgeZone;
          break;
        case 'left':
          isEdgeSwipe = startX >= window.innerWidth - edgeZone;
          break;
        case 'down':
          isEdgeSwipe = startY <= edgeZone;
          break;
        case 'up':
          isEdgeSwipe = startY >= window.innerHeight - edgeZone;
          break;
      }
    }

    touchDataRef.current = {
      startX,
      startY,
      startTime: Date.now(),
      isEdgeSwipe: edgeTriggered ? isEdgeSwipe : true,
      isValidSwipe: false,
    };
  }, [direction, edgeZone, edgeTriggered, enabled]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    const touchData = touchDataRef.current;
    if (!touchData || !enabled) return;

    // Skip if not an edge swipe when edge-triggered is required
    if (edgeTriggered && !touchData.isEdgeSwipe) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - touchData.startX;
    const deltaY = touch.clientY - touchData.startY;

    // Determine if movement is primarily in the target direction
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    // Direction locking: if not yet swiping, check if movement matches target direction
    if (!touchData.isValidSwipe) {
      const minMovement = 10; // pixels before we determine direction

      if (absDeltaX < minMovement && absDeltaY < minMovement) {
        return; // Not enough movement to determine direction
      }

      // Check if movement direction matches what we're looking for
      if (isHorizontal) {
        // For horizontal swipes, require horizontal movement to be dominant
        if (absDeltaY > absDeltaX) {
          // User is scrolling vertically, cancel this gesture
          touchDataRef.current = null;
          return;
        }

        // Check direction
        const isCorrectDirection =
          (direction === 'right' && deltaX > 0) ||
          (direction === 'left' && deltaX < 0);

        if (!isCorrectDirection) {
          touchDataRef.current = null;
          return;
        }
      } else {
        // For vertical swipes, require vertical movement to be dominant
        if (absDeltaX > absDeltaY) {
          touchDataRef.current = null;
          return;
        }

        const isCorrectDirection =
          (direction === 'down' && deltaY > 0) ||
          (direction === 'up' && deltaY < 0);

        if (!isCorrectDirection) {
          touchDataRef.current = null;
          return;
        }
      }

      // Valid swipe detected, lock in
      touchData.isValidSwipe = true;
    }

    // Calculate progress based on direction
    let progress = 0;
    if (isHorizontal) {
      progress = Math.min(1, Math.max(0, absDeltaX / distanceThreshold));
    } else {
      progress = Math.min(1, Math.max(0, absDeltaY / distanceThreshold));
    }

    // Prevent default to stop scroll during swipe
    if (touchData.isValidSwipe) {
      e.preventDefault();
    }

    setState({
      progress,
      isSwiping: true,
      direction,
      translation: { x: deltaX, y: deltaY },
    });

    onSwipeProgress?.(progress);
  }, [direction, distanceThreshold, edgeTriggered, enabled, isHorizontal, onSwipeProgress]);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    const touchData = touchDataRef.current;
    if (!touchData || !enabled) {
      touchDataRef.current = null;
      return;
    }

    if (!touchData.isValidSwipe) {
      touchDataRef.current = null;
      setState({
        progress: 0,
        isSwiping: false,
        direction: null,
        translation: { x: 0, y: 0 },
      });
      return;
    }

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchData.startX;
    const deltaY = touch.clientY - touchData.startY;
    const elapsed = Date.now() - touchData.startTime;

    // Calculate velocity
    const velocity = isHorizontal
      ? Math.abs(deltaX) / elapsed
      : Math.abs(deltaY) / elapsed;

    // Calculate distance
    const distance = isHorizontal ? Math.abs(deltaX) : Math.abs(deltaY);

    // Determine if swipe should complete
    const shouldComplete =
      velocity >= velocityThreshold ||
      distance >= distanceThreshold;

    if (shouldComplete) {
      onSwipe?.();
    } else {
      onSwipeCancel?.();
    }

    // Reset state
    touchDataRef.current = null;
    setState({
      progress: 0,
      isSwiping: false,
      direction: null,
      translation: { x: 0, y: 0 },
    });
  }, [distanceThreshold, enabled, isHorizontal, onSwipe, onSwipeCancel, velocityThreshold]);

  // Create bind function that returns event handlers for a container element
  const bind = useCallback(() => {
    return {
      onTouchStart: (e: React.TouchEvent) => handleTouchStart(e.nativeEvent),
      onTouchMove: (e: React.TouchEvent) => handleTouchMove(e.nativeEvent),
      onTouchEnd: (e: React.TouchEvent) => handleTouchEnd(e.nativeEvent),
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  // Alternative: attach to element directly via ref
  const attachToElement = useCallback((element: HTMLElement | null) => {
    if (!element) return;

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return {
    state,
    bind,
    attachToElement,
  };
}

/**
 * Hook for swipe-back navigation on mobile
 * Swipe right from left edge to go back
 */
export function useSwipeBack(options: {
  onBack: () => void;
  enabled?: boolean;
} = { onBack: () => {} }) {
  const { onBack, enabled = true } = options;

  return useSwipeGesture({
    direction: 'right',
    edgeTriggered: true,
    edgeZone: 30,
    velocityThreshold: 0.5,
    distanceThreshold: 100,
    onSwipe: onBack,
    enabled,
  });
}
