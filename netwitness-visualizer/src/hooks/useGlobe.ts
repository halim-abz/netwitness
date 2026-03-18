/**
 * useGlobe.ts
 * 
 * A custom hook for managing shared globe initialization and control logic.
 * It handles auto-rotation, resize observation, and country data loading.
 * It also manages label visibility based on camera altitude.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
export function useGlobe(autoRotateEnabled: boolean = true) {
  const globeRef = useRef<any>(null);
  const [countries, setCountries] = useState<any>({ type: 'FeatureCollection', features: [] });
  const [autoRotate, setAutoRotate] = useState(autoRotateEnabled);
  const [globeSize, setGlobeSize] = useState({ width: 0, height: 0 });
  const [isReady, setIsReady] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load country data
  useEffect(() => {
    fetch('/files/ne_110m_admin_0_countries.geojson')
      .then(res => res.json())
      .then(setCountries)
      .catch(err => console.error('Failed to load countries:', err));
  }, []);

  // Handle resize observation
  useEffect(() => {
    if (!containerRef.current) return;
    
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        const { width, height } = entries[0].contentRect;
        setGlobeSize({ width, height });
      }
    });
    
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Handle auto-rotation setup
  useEffect(() => {
    if (!globeRef.current || !isReady) return;
    
    // Configure globe controls
    const controls = globeRef.current.controls();
    if (controls) {
      controls.autoRotate = autoRotate;
      controls.autoRotateSpeed = 0.5;
    }
  }, [autoRotate, isReady]);

  // Handle zoom level for labels
  useEffect(() => {
    if (!globeRef.current || !isReady) return;
    
    const controls = globeRef.current.controls();
    if (!controls) return;

    const handleControlsChange = () => {
      const pov = globeRef.current.pointOfView();
      
      // Use altitude instead of raw camera distance (default is 2.5)
      if (pov.altitude < 1.5 && !showLabels) {
        setShowLabels(true);
      } else if (pov.altitude >= 1.5 && showLabels) {
        setShowLabels(false);
      }
    };

    controls.addEventListener('change', handleControlsChange);
    return () => controls.removeEventListener('change', handleControlsChange);
  }, [showLabels, isReady]);

  const toggleAutoRotate = useCallback(() => {
    setAutoRotate(prev => !prev);
  }, []);

  return {
    globeRef,
    countries,
    autoRotate,
    setAutoRotate,
    toggleAutoRotate,
    globeSize,
    containerRef,
    isReady,
    setIsReady,
    showLabels
  };
}
