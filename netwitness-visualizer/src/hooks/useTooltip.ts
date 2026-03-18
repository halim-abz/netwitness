/**
 * useTooltip.ts
 * 
 * A custom hook for managing shared tooltip logic across different visualization components.
 * It handles hover states, mouse tracking, and direct DOM manipulation for high-performance
 * tooltip positioning, avoiding unnecessary React re-renders.
 */

import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Custom hook for managing shared tooltip logic.
 * Handles hover state, mouse tracking, and direct DOM transform updates for performance.
 */
export function useTooltip<T>() {
  const [hoveredItem, setHoveredItem] = useState<T | null>(null);
  const [lastHoveredItem, setLastHoveredItem] = useState<T | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const mousePosRef = useRef({ x: 0, y: 0 });

  // Update lastHoveredItem for tooltip content persistence during fade-out
  useEffect(() => {
    if (hoveredItem) {
      setLastHoveredItem(hoveredItem);
    }
  }, [hoveredItem]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    mousePosRef.current = { x: e.clientX, y: e.clientY };
    if (tooltipRef.current) {
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      let x = e.clientX + 15;
      let y = e.clientY + 15;
      
      // Prevent overflow on right
      if (x + tooltipRect.width > window.innerWidth) {
        x = e.clientX - tooltipRect.width - 15;
      }
      
      // Prevent overflow on bottom
      if (y + tooltipRect.height > window.innerHeight) {
        y = e.clientY - tooltipRect.height - 15;
      }

      // Update transform directly to avoid React render cycle on every mouse move
      tooltipRef.current.style.transform = `translate(${x}px, ${y}px)`;
    }
  }, []);

  // Global mouse tracker to ensure we always have the latest position
  // even if child components stop event propagation
  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [handleMouseMove]);

  // We expose a function to manually update the tooltip position if needed (e.g. when hover starts)
  const updateTooltipPosition = useCallback(() => {
    if (tooltipRef.current) {
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      let x = mousePosRef.current.x + 15;
      let y = mousePosRef.current.y + 15;
      
      // Prevent overflow on right
      if (x + tooltipRect.width > window.innerWidth) {
        x = mousePosRef.current.x - tooltipRect.width - 15;
      }
      
      // Prevent overflow on bottom
      if (y + tooltipRect.height > window.innerHeight) {
        y = mousePosRef.current.y - tooltipRect.height - 15;
      }

      tooltipRef.current.style.transform = `translate(${x}px, ${y}px)`;
    }
  }, []);

  return {
    hoveredItem,
    setHoveredItem,
    lastHoveredItem,
    tooltipRef,
    mousePosRef,
    handleMouseMove,
    updateTooltipPosition
  };
}
