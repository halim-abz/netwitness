import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import Globe from 'react-globe.gl';
import * as d3 from 'd3';
import { GraphData, Node, Link } from '../types';
import { Play, Pause, Activity, Database, Users, Search, Radar, ChevronUp, ChevronDown } from 'lucide-react';
import { formatBytes, formatNumber, formatDate } from '../lib/utils';
import { getCountryCentroids } from '../lib/countryCentroids';
import { useGlobe } from '../hooks/useGlobe';
import { useTooltip } from '../hooks/useTooltip';
import { processGlobeData } from '../lib/globeDataProcessor';

// --- TYPES & INTERFACES ---

type HoveredItem = Node | Link | null;

interface GlobeViewProps {
  data: GraphData;
  onItemClick: (item: Node | Link) => void;
  isDark: boolean;
  selectedItem?: HoveredItem;
  homeLocation?: { lat: number; lng: number } | null;
  onSetHomeLocation?: (loc: { lat: number; lng: number }) => void;
  children?: React.ReactNode;
}

interface GlobeArcData {
  link: Link;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: string | string[];
  isTrack: boolean;
}

interface GlobeRingData {
  node: Node;
  lat: number;
  lng: number;
  color: string;
  degree?: number;
}

interface GlobeLabelData {
  lat: number;
  lng: number;
  text: string;
  size: number;
  color: string;
  node?: Node;
}

// --- CONSTANTS ---

const GLOBE_CONFIG = {
  altitude: {
    polygon: 0.007,
    ring: 0.016,
    label: 0.025,
    defaultPOV: 2.5,
    zoomPOV: 2.0,
  },
  radius: {
    selectedNode: 5,
    defaultNode: 3,
    labelDot: 0.1,
  },
  animation: {
    arcDashTime: 2000,
    ringPropagationSpeed: 2,
    ringRepeatPeriod: 1000,
    povTransitionMs: 1000,
  }
} as const;

// --- TYPE GUARDS ---

const isLinkItem = (item: any): item is Link => item && 'source' in item && 'target' in item;
const isNodeItem = (item: any): item is Node => item && 'id' in item && !('source' in item);

// --- SUB-COMPONENTS ---

/**
 * Memoized Feed Item to prevent massive re-renders when globe state updates
 */
const LiveFeedItem = React.memo(({ 
  item, 
  isSelected, 
  onClick 
}: { 
  item: any; 
  isSelected: boolean; 
  onClick: (item: any) => void 
}) => {
  return (
    <div
      onClick={() => onClick(item)}
      className={`p-3 rounded-lg border cursor-pointer transition-colors animate-in fade-in slide-in-from-right-8 ${
        isSelected
          ? 'border-green-400 dark:border-green-500 bg-green-50 dark:bg-green-900/20 shadow-[0_0_10px_rgba(34,197,94,0.3)]'
          : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 bg-gray-50 dark:bg-gray-800/50'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
          <span className="text-xs font-mono truncate max-w-[100px]" title={item.source}>{item.source}</span>
        </div>
        <span className="text-xs text-gray-500">&rarr;</span>
        <span className="text-xs font-mono truncate max-w-[100px]" title={item.target}>{item.target}</span>
      </div>

      <div className="grid grid-cols-1 gap-2 mb-2">
        {/* Render Tags */}
        {[
          { data: item.service, theme: 'px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded text-[9px] font-medium uppercase tracking-wider' },
          { data: item.country, theme: 'px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded text-[9px] font-medium uppercase tracking-wider' },
          { data: item.ioc, theme: 'px-1.5 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded text-[9px] font-medium uppercase tracking-wider' },
          { data: item.boc, theme: 'px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 rounded text-[9px] font-medium uppercase tracking-wider' },
          { data: item.eoc, theme: 'px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 rounded text-[9px] font-medium uppercase tracking-wider' }
        ].map(({ data, theme }, idx) => {
          if (!data) return null;
          return (
            <div key={idx} className="flex flex-wrap gap-1">
              {data.split(', ').map((tag: string) => (
                <span key={tag} className={`${theme}`}>
                  {tag}
                </span>
              ))}
            </div>
          );
        })}

        {item.aliasHost && (
          <div className="text-[10px] text-gray-500 truncate" title={item.aliasHost}>
            <span className="font-semibold">Host:</span> {item.aliasHost}
          </div>
        )}
        {item.time > 0 && (
          <div className="text-[10px] text-gray-500 truncate" title={formatDate(item.time)}>
            <span className="font-semibold">Time:</span> {formatDate(item.time)}
          </div>
        )}
      </div>

      <div className="flex justify-between items-center mt-2 border-t border-gray-100 dark:border-gray-800 pt-2">
        <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400">
          {item.link.sessions?.length ?? 0} Session{(item.link.sessions?.length !== 1) ? 's' : ''}
        </div>
        <div className="text-xs font-semibold text-gray-600 dark:text-gray-300 text-right">
          {formatBytes(item.size)}
        </div>
      </div>
    </div>
  );
});
LiveFeedItem.displayName = 'LiveFeedItem';

// --- MAIN COMPONENT ---

export default function GlobeView({
  data,
  onItemClick,
  isDark,
  selectedItem,
  homeLocation,
  onSetHomeLocation,
  children
}: GlobeViewProps) {
  const {
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
  } = useGlobe(true);

  const {
    hoveredItem: hoveredItemNode,
    setHoveredItem: setHoveredItemNode,
    lastHoveredItem: lastHoveredItemNode,
    tooltipRef,
    updateTooltipPosition
  } = useTooltip<HoveredItem>();

  const [isLegendOpen, setIsLegendOpen] = useState(true);
  const [hoveredArc, setHoveredArc] = useState<Link | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showThreatsOnly, setShowThreatsOnly] = useState(false);
  const [feedSort, setFeedSort] = useState<'time' | 'size'>('time');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isShiftDownRef = useRef(false);

  // Keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Shift') isShiftDownRef.current = true; };
    const handleKeyUp = (e: KeyboardEvent) => { if (e.key === 'Shift') isShiftDownRef.current = false; };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const countryCentroids = useMemo(() => getCountryCentroids(countries), [countries]);

  const { arcsData, ringsData, stats, liveFeed } = useMemo(() => {
    return processGlobeData(data, searchQuery, showThreatsOnly, feedSort, countryCentroids);
  }, [data, searchQuery, showThreatsOnly, feedSort, countryCentroids]);

  const labelsData = useMemo((): GlobeLabelData[] => {
    if (!showLabels || !countries?.features) return [];
    
    return countries.features.reduce((acc: GlobeLabelData[], feature: any) => {
      try {
        const name = feature.properties?.NAME;
        if (!name) return acc;
        
        const centroid = countryCentroids.get(name.toLowerCase()) || {
          lat: d3.geoCentroid(feature)[1],
          lng: d3.geoCentroid(feature)[0]
        };
        
        acc.push({
          lat: centroid.lat,
          lng: centroid.lng,
          text: name,
          size: 0.3,
          color: isDark ? 'rgba(255,255,255,0.8)' : '#e5e7eb'
        });
      } catch (e) {
        console.warn('Failed to parse geographical centroid for label', e);
      }
      return acc;
    }, []);
  }, [countries, showLabels, isDark, countryCentroids]);

  // --- INTERACTION HANDLERS ---

  useEffect(() => {
    if (!globeRef.current || !isReady) return;

    if (selectedItem) {
      let targetLat: number | undefined;
      let targetLng: number | undefined;
      
      if (isLinkItem(selectedItem)) {
        const sourceId = typeof selectedItem.source === 'string' ? selectedItem.source : selectedItem.source.id;
        const targetId = typeof selectedItem.target === 'string' ? selectedItem.target : selectedItem.target.id;
        
        const ringNodeSrc = ringsData.find(r => r.node.id === sourceId);
        const ringNodeDst = ringsData.find(r => r.node.id === targetId);
        
        // Prefer public network targets for point of view
        const ringNode = (ringNodeDst?.node.networkType === 'public') ? ringNodeDst 
                       : (ringNodeSrc?.node.networkType === 'public') ? ringNodeSrc 
                       : (ringNodeDst || ringNodeSrc);

        if (ringNode) {
          targetLat = ringNode.lat;
          targetLng = ringNode.lng;
        }
      } else if (isNodeItem(selectedItem)) {
        const ringNode = ringsData.find(r => r.node.id === selectedItem.id);
        if (ringNode) {
          targetLat = ringNode.lat;
          targetLng = ringNode.lng;
        }
      }

      if (targetLat !== undefined && targetLng !== undefined) {
        setAutoRotate(false);
        setTimeout(() => {
          globeRef.current?.pointOfView(
            { lat: targetLat!, lng: targetLng!, altitude: GLOBE_CONFIG.altitude.zoomPOV }, 
            GLOBE_CONFIG.animation.povTransitionMs
          );
        }, 50);
      }
    } else {
      const currentPOV = globeRef.current.pointOfView();
      globeRef.current.pointOfView(
        { lat: currentPOV.lat, lng: currentPOV.lng, altitude: GLOBE_CONFIG.altitude.defaultPOV }, 
        GLOBE_CONFIG.animation.povTransitionMs
      );
      setAutoRotate(true);
    }
  }, [selectedItem, ringsData, isReady, globeRef, setAutoRotate]);

  const handleItemClick = useCallback((item: HoveredItem) => {
    if (!item) return;
    setAutoRotate(false);
    onItemClick(item);
  }, [onItemClick, setAutoRotate]);

  const handleRightClick = useCallback((lat: number, lng: number, event: MouseEvent) => {
    const isShift = event?.shiftKey || isShiftDownRef.current;
    if (isShift && onSetHomeLocation) {
      onSetHomeLocation({ lat, lng });
      setToastMessage('Home Location Updated');
      
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 3000);
    }
  }, [onSetHomeLocation]);

  const handleFeedItemClick = useCallback((item: any) => {
    const ringNode = ringsData.find(r => r.node.id === item.source) || ringsData.find(r => r.node.id === item.target);
    // While clicking feed items, zoom to available node but select the link
    handleItemClick(item.link);
  }, [ringsData, handleItemClick]);

  // --- RENDER HELPERS ---
  const checkSelectionMatch = useCallback((nodeId: string) => {
    if (!selectedItem) return false;
    if (isNodeItem(selectedItem)) return selectedItem.id === nodeId;
    if (isLinkItem(selectedItem)) {
      const srcMatch = typeof selectedItem.source === 'string' ? selectedItem.source === nodeId : selectedItem.source?.id === nodeId;
      const tgtMatch = typeof selectedItem.target === 'string' ? selectedItem.target === nodeId : selectedItem.target?.id === nodeId;
      return srcMatch || tgtMatch;
    }
    return false;
  }, [selectedItem]);

  return (
    <div className="relative w-full h-full flex overflow-hidden">
      <div 
        className="flex-1 relative min-w-0" 
        ref={containerRef}
        onPointerDown={() => autoRotate && setAutoRotate(false)}
        onWheel={() => autoRotate && setAutoRotate(false)}
      >
        {globeSize.width > 0 && (
          <Globe
            ref={globeRef}
            width={globeSize.width}
            height={globeSize.height}
            globeImageUrl={isDark ? "/files/earth-dark.jpg" : "/files/earth-blue-marble.jpg"}
            bumpImageUrl="/files/earth-topology.png"
            backgroundImageUrl={isDark ? "/files/night-sky.png" : ""}
            backgroundColor={isDark ? "#020617" : "#f8fafc"}
            
            // Polygons
            polygonsData={countries.features}
            polygonAltitude={GLOBE_CONFIG.altitude.polygon}
            polygonCapColor={() => isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)'}
            polygonSideColor={() => 'rgba(0, 100, 255, 0.15)'}
            polygonStrokeColor={() => isDark ? '#334155' : '#cbd5e1'}
            onPolygonRightClick={(polygon: object, event: MouseEvent, { lat, lng }) => handleRightClick(lat, lng, event)}
            
            // Arcs
            arcsData={arcsData}
            arcColor={(arc: GlobeArcData) => {
              if (selectedItem === arc.link) return ['#bbf7d0', '#22c55e'];
              const col = arc.color as string[];
              return arc.isTrack ? [col[0] + '40', col[1] + '40'] : col;
            }}
            arcDashLength={(arc: GlobeArcData) => selectedItem === arc.link ? 1 : 0.4}
            arcDashGap={(arc: GlobeArcData) => selectedItem === arc.link ? 0 : 4}
            arcDashInitialGap={(arc: GlobeArcData) => selectedItem === arc.link ? 0 : Math.random() * 5}
            arcDashAnimateTime={GLOBE_CONFIG.animation.arcDashTime}
            arcStroke={(arc: GlobeArcData) => selectedItem === arc.link ? 2 : (hoveredArc === arc.link ? 1.5 : (arc.isTrack ? 0.2 : 0.5))}
            onArcHover={(arc: GlobeArcData | null) => {
              setHoveredArc(arc?.link ?? null);
              setHoveredItemNode(arc?.link ?? null);
              if (arc) updateTooltipPosition();
            }}
            onArcClick={(arc: GlobeArcData) => handleItemClick(arc.link)}
            onArcRightClick={(arc: GlobeArcData, event: MouseEvent, { lat, lng }) => handleRightClick(lat, lng, event)}
            
            // Rings
            ringsData={ringsData}
            ringColor={(ring: GlobeRingData) => checkSelectionMatch(ring.node.id) ? '#22c55e' : ring.color}
            ringMaxRadius={(ring: GlobeRingData) => checkSelectionMatch(ring.node.id) ? GLOBE_CONFIG.radius.selectedNode : GLOBE_CONFIG.radius.defaultNode}
            ringPropagationSpeed={GLOBE_CONFIG.animation.ringPropagationSpeed}
            ringRepeatPeriod={GLOBE_CONFIG.animation.ringRepeatPeriod}
            ringAltitude={GLOBE_CONFIG.altitude.ring}

            // Points
            pointsData={ringsData}
            pointColor={(pt: GlobeRingData) => checkSelectionMatch(pt.node.id) ? '#22c55e' : pt.color}
            pointAltitude={(pt: GlobeRingData) => Math.min(0.15, 0.025 + (pt.degree ?? 0) * 0.005)}
            pointRadius={(pt: GlobeRingData) => checkSelectionMatch(pt.node.id) ? 1.0 : 0.5}
            onPointHover={(pt: GlobeRingData | null) => {
              setHoveredItemNode(pt?.node ?? null);
              if (pt) updateTooltipPosition();
            }}
            onPointClick={(pt: GlobeRingData) => handleItemClick(pt.node)}
            onPointRightClick={(pt: GlobeRingData, event: MouseEvent, { lat, lng }) => handleRightClick(lat, lng, event)}
            
            // Labels
            labelsData={labelsData}
            labelLat="lat"
            labelLng="lng"
            labelText="text"
            labelSize="size"
            labelColor="color"
            labelAltitude={GLOBE_CONFIG.altitude.label}
            labelDotRadius={GLOBE_CONFIG.radius.labelDot}
            labelResolution={2}
            onLabelClick={(lbl: GlobeLabelData) => handleItemClick(lbl.node ?? null)}
            onLabelRightClick={(lbl: GlobeLabelData, event: MouseEvent, { lat, lng }) => handleRightClick(lat, lng, event)}
            
            // Global Events
            onGlobeRightClick={({ lat, lng }, event: MouseEvent) => handleRightClick(lat, lng, event)}
            onGlobeReady={() => {
              if (!selectedItem) {
                setTimeout(() => {
                  const pov = { 
                    lat: homeLocation?.lat ?? 39.8283, 
                    lng: homeLocation?.lng ?? -98.5795, 
                    altitude: GLOBE_CONFIG.altitude.defaultPOV 
                  };
                  globeRef.current?.pointOfView(pov, 0);
                  setIsReady(true);
                  setAutoRotate(true);
                }, 100);
              } else {
                setIsReady(true);
              }
            }}
          />
        )}

        {/* Global UI Overlays */}
        <div className="absolute bottom-6 right-6 z-20">
          <button
            onClick={toggleAutoRotate}
            className="p-3 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-full shadow-lg text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-700 transition-all border border-gray-200 dark:border-gray-700"
            title={autoRotate ? "Pause Rotation" : "Resume Rotation"}
          >
            {autoRotate ? <Pause size={20} /> : <Play size={20} />}
          </button>
        </div>

        {toastMessage && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 bg-green-500/90 backdrop-blur-sm text-white px-4 py-2.5 rounded-lg shadow-lg font-medium flex items-center gap-2 transition-all duration-300">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
            {toastMessage}
          </div>
        )}

        <div className="absolute bottom-6 left-6 bg-white/90 dark:bg-slate-900/90 rounded-lg shadow-lg backdrop-blur-sm border border-gray-200 dark:border-gray-800 text-xs z-10 overflow-hidden transition-all duration-300">
          <button 
            onClick={() => setIsLegendOpen(!isLegendOpen)}
            className="flex items-center justify-between w-full p-3 font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          >
            <span>Threat Level</span>
            {isLegendOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
          {isLegendOpen && (
            <div className="p-3 pt-0">
              <div className="flex items-center gap-2 mb-1"><div className="w-3 h-3 rounded-full bg-red-500" /><span className="text-gray-600 dark:text-gray-400">IOC Exists</span></div>
              <div className="flex items-center gap-2 mb-1"><div className="w-3 h-3 rounded-full bg-orange-500" /><span className="text-gray-600 dark:text-gray-400">BOC Exists</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-yellow-500" /><span className="text-gray-600 dark:text-gray-400">EOC Exists</span></div>
            </div>
          )}
        </div>
      </div>

      {/* Side Panels */}
      <div className="flex h-full shrink-0 z-10">
        {children}
        
        <div className="hidden lg:flex w-80 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border-l border-gray-200 dark:border-gray-800 flex-col h-full shrink-0">
          <div className="p-4 border-b border-gray-200 dark:border-gray-800">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Radar className="text-[#B63830]" size={20} />
              Network Telemetry
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg animate-in fade-in slide-in-from-top-2 delay-100 fill-mode-both">
                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
                  <Activity size={14} />
                  <span className="text-xs font-semibold uppercase">Flows</span>
                </div>
                <div className="text-xl font-bold">{formatNumber(stats.flows)}</div>
              </div>
              <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg animate-in fade-in slide-in-from-top-2 delay-200 fill-mode-both">
                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
                  <Users size={14} />
                  <span className="text-xs font-semibold uppercase">Unique IPs</span>
                </div>
                <div className="text-xl font-bold">{formatNumber(stats.ips)}</div>
              </div>
              <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg col-span-2 animate-in fade-in slide-in-from-top-2 delay-300 fill-mode-both">
                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
                  <Database size={14} />
                  <span className="text-xs font-semibold uppercase">Total Payload</span>
                </div>
                <div className="text-xl font-bold">{formatBytes(stats.size)}</div>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold uppercase text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <Activity size={16} className="text-[#B63830]" />
                Flows Feed
              </h3>
              <select 
                value={feedSort} 
                onChange={(e) => setFeedSort(e.target.value as 'time' | 'size')}
                className="text-xs bg-gray-100 dark:bg-gray-800 border-none rounded px-2 py-1 outline-none focus:ring-1 focus:ring-[#B63830] dark:focus:ring-[#B63830] text-gray-700 dark:text-gray-300 cursor-pointer transition-shadow"
              >
                <option value="time">Chronological</option>
                <option value="size">Volume</option>
              </select>
            </div>
            
            <div className="flex items-center justify-between mb-4 shrink-0 gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                <input 
                  type="text" 
                  placeholder="Filter IPs, service, country..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-gray-100 dark:bg-gray-800 border-none rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-[#B63830] dark:text-gray-200 outline-none transition-shadow"
                />
              </div>
              <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 py-2 px-2.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                <input 
                  type="checkbox" 
                  checked={showThreatsOnly}
                  onChange={(e) => setShowThreatsOnly(e.target.checked)}
                  className="rounded text-[#B63830] focus:ring-[#B63830] bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700"
                />
                Threats
              </label>
            </div>

            <div className="space-y-2 overflow-y-auto flex-1 pr-1">
              {liveFeed.slice(0, 100).map((item, i) => (
                <LiveFeedItem 
                  key={`${item.link.id || i}`} 
                  item={item} 
                  isSelected={selectedItem === item.link} 
                  onClick={handleFeedItemClick} 
                />
              ))}
              {liveFeed.length === 0 && (
                <div className="text-sm text-gray-500 text-center py-8">No active connections</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Hover Tooltip Render */}
      <div 
        ref={tooltipRef}
        className={`fixed left-0 top-0 z-50 pointer-events-none bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-xl rounded-lg p-3 text-sm transition-opacity duration-200 ${hoveredItemNode ? 'opacity-100' : 'opacity-0'}`}
        style={{ maxWidth: '300px', willChange: 'transform, opacity' }}
      >
        {lastHoveredItemNode && isLinkItem(lastHoveredItemNode) && (
          <div className="space-y-2">
            <div className="font-semibold text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-700 pb-1 mb-1">
              Connection Details
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500 dark:text-gray-400">Source:</span>
              <span className="font-mono text-right truncate">{(lastHoveredItemNode.source as Node).id || lastHoveredItemNode.source}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500 dark:text-gray-400">Target:</span>
              <span className="font-mono text-right truncate">{(lastHoveredItemNode.target as Node).id || lastHoveredItemNode.target}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500 dark:text-gray-400">Sessions:</span>
              <span className="font-semibold">{lastHoveredItemNode.sessions?.length || lastHoveredItemNode.count || 0}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500 dark:text-gray-400">Size:</span>
              <span className="font-semibold">{formatBytes(lastHoveredItemNode.size || 0)}</span>
            </div>
          </div>
        )}

        {lastHoveredItemNode && isNodeItem(lastHoveredItemNode) && (
          <div className="space-y-2">
            <div className="font-semibold text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-700 pb-1 mb-1 flex items-center gap-2">
              <div 
                className="w-2 h-2 rounded-full" 
                style={{ backgroundColor: lastHoveredItemNode.networkType === 'public' ? '#B63830' : (lastHoveredItemNode.networkType === 'internal' ? (isDark ? '#0ea5e9' : '#3b82f6') : '#64748b') }} 
              />
              <span className="font-mono truncate">{lastHoveredItemNode.id}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500 dark:text-gray-400">Network:</span>
              <span className="font-semibold capitalize">{lastHoveredItemNode.networkType}</span>
            </div>
            {lastHoveredItemNode.country && (
              <div className="flex justify-between gap-4">
                <span className="text-gray-500 dark:text-gray-400">Country:</span>
                <span className="font-semibold">{lastHoveredItemNode.country}</span>
              </div>
            )}
            {lastHoveredItemNode.org && (
              <div className="flex justify-between gap-4">
                <span className="text-gray-500 dark:text-gray-400">Org:</span>
                <span className="font-semibold truncate max-w-[150px]">{lastHoveredItemNode.org}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}