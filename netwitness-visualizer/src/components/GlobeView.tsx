import React, { useEffect, useState, useRef, useMemo } from 'react';
import Globe from 'react-globe.gl';
import * as d3 from 'd3';
import { GraphData, Node, Link } from '../types';
import { Play, Pause, Activity, Database, Users, Search, Radar } from 'lucide-react';
import { formatBytes, formatNumber, formatDate } from '../lib/utils';

interface GlobeViewProps {
  data: GraphData;
  onItemClick: (item: Node | Link) => void;
  isDark: boolean;
  selectedItem?: Node | Link | null;
}

export default function GlobeView({ data, onItemClick, isDark, selectedItem }: GlobeViewProps) {
  const globeRef = useRef<any>(null);
  const [countries, setCountries] = useState({ features: [] });
  const [autoRotate, setAutoRotate] = useState(true);
  const [hoveredArc, setHoveredArc] = useState<any>(null);
  const [showLabels, setShowLabels] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showThreatsOnly, setShowThreatsOnly] = useState(false);
  const [feedSort, setFeedSort] = useState<'time' | 'size'>('time');
  const containerRef = useRef<HTMLDivElement>(null);
  const [globeSize, setGlobeSize] = useState({ width: 0, height: 0 });
  const [hoveredItemNode, setHoveredItemNode] = useState<any>(null);
  const [lastHoveredItemNode, setLastHoveredItemNode] = useState<any>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const mousePosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseMove = (e: MouseEvent) => {
      mousePosRef.current = { x: e.clientX, y: e.clientY };
    };

    container.addEventListener('mousemove', handleMouseMove);
    return () => container.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
    if (hoveredItemNode) {
      setLastHoveredItemNode(hoveredItemNode);
      if (tooltipRef.current) {
        tooltipRef.current.style.transform = `translate(${mousePosRef.current.x + 15}px, ${mousePosRef.current.y + 15}px)`;
      }
    }
  }, [hoveredItemNode]);

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

  useEffect(() => {
    fetch('https://raw.githubusercontent.com/vasturiano/react-globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson')
      .then(res => res.json())
      .then(setCountries);
  }, []);

  useEffect(() => {
    let interval: any;
    const enableRotation = () => {
      if (globeRef.current && globeRef.current.controls && globeRef.current.controls()) {
        globeRef.current.controls().autoRotate = autoRotate;
        globeRef.current.controls().autoRotateSpeed = 0.5;
        // Prevent zooming inside the globe
        globeRef.current.controls().minDistance = 120;
        globeRef.current.controls().maxDistance = 400;
        return true;
      }
      return false;
    };
    
    if (!enableRotation()) {
      interval = setInterval(() => {
        if (enableRotation()) clearInterval(interval);
      }, 200);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRotate]);

  useEffect(() => {
    let animationFrameId: number;
    const checkZoom = () => {
      if (globeRef.current && globeRef.current.camera && globeRef.current.camera()?.position) {
        // The distance from the camera to the center of the globe
        const distance = globeRef.current.camera().position.length();
        // Globe radius is typically 100 in react-globe.gl
        if (distance < 180 && !showLabels) {
          setShowLabels(true);
        } else if (distance >= 180 && showLabels) {
          setShowLabels(false);
        }
      }
      animationFrameId = requestAnimationFrame(checkZoom);
    };
    checkZoom();
    return () => cancelAnimationFrame(animationFrameId);
  }, [showLabels]);

  const countryCentroids = useMemo(() => {
    const map = new Map<string, {lat: number, lng: number}>();
    if (countries?.features) {
      countries.features.forEach((f: any) => {
        try {
          const centroid = d3.geoCentroid(f);
          const name = f.properties?.NAME;
          const isoA2 = f.properties?.ISO_A2;
          if (name) map.set(name.toLowerCase(), {lat: centroid[1], lng: centroid[0]});
          if (isoA2) map.set(isoA2.toLowerCase(), {lat: centroid[1], lng: centroid[0]});
        } catch (e) {}
      });
    }
    // Add some common mappings if needed
    map.set('us', {lat: 37.0902, lng: -95.7129});
    map.set('united states', {lat: 37.0902, lng: -95.7129});
    map.set('gb', {lat: 55.3781, lng: -3.4360});
    map.set('uk', {lat: 55.3781, lng: -3.4360});
    return map;
  }, [countries]);

  const { arcsData, ringsData, stats, liveFeed } = useMemo(() => {
    const arcs: any[] = [];
    let totalSize = 0;
    const uniqueIPs = new Set<string>();
    const feed: any[] = [];

    const nodesById = new Map(data.nodes.map(n => [n.id, n]));

    const filteredLinks = data.links.filter((link: any) => {
      if (showThreatsOnly) {
        let hasThreat = false;
        link.sessions?.forEach((s: any) => {
          if (s.ioc || s.eoc || s.boc) hasThreat = true;
        });
        if (!hasThreat) return false;
      }

      if (!searchQuery) return true;
      
      const isExclude = searchQuery.startsWith('!');
      const q = isExclude ? searchQuery.slice(1).toLowerCase() : searchQuery.toLowerCase();
      
      if (!q) return true;

      const sourceNode = typeof link.source === 'string' ? nodesById.get(link.source) : link.source;
      const targetNode = typeof link.target === 'string' ? nodesById.get(link.target) : link.target;
      
      let match = false;
      if (sourceNode?.id.toLowerCase().includes(q) || targetNode?.id.toLowerCase().includes(q)) match = true;
      
      link.sessions?.forEach((s: any) => {
        if (s.service && String(s.service).toLowerCase().includes(q)) match = true;
        if (s['country.dst'] && String(s['country.dst']).toLowerCase().includes(q)) match = true;
        if (s['country.src'] && String(s['country.src']).toLowerCase().includes(q)) match = true;
        if (s['alias.host'] && String(s['alias.host']).toLowerCase().includes(q)) match = true;
      });
      if (sourceNode?.country?.toLowerCase().includes(q) || targetNode?.country?.toLowerCase().includes(q)) match = true;
      
      return isExclude ? !match : match;
    });

    const nodeSeverities = new Map<string, number>();
    filteredLinks.forEach((link: any) => {
      let hasIoc = false;
      let hasBoc = false;
      let hasEoc = false;
      link.sessions?.forEach((s: any) => {
        if (s.ioc) hasIoc = true;
        if (s.boc) hasBoc = true;
        if (s.eoc) hasEoc = true;
      });
      const severity = hasIoc ? 3 : hasBoc ? 2 : hasEoc ? 1 : 0;
      
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;
      
      nodeSeverities.set(sourceId, Math.max(severity, nodeSeverities.get(sourceId) || 0));
      nodeSeverities.set(targetId, Math.max(severity, nodeSeverities.get(targetId) || 0));
    });

    const getColorFromSeverity = (sev: number) => sev === 3 ? '#ef4444' : sev === 2 ? '#f97316' : sev === 1 ? '#eab308' : '#3b82f6';
    const uniqueNodes = new Map<string, any>();

    filteredLinks.forEach((link: any) => {
      const sourceNode = typeof link.source === 'string' ? nodesById.get(link.source) : link.source;
      const targetNode = typeof link.target === 'string' ? nodesById.get(link.target) : link.target;

      if (!sourceNode || !targetNode) return;

      uniqueIPs.add(sourceNode.id);
      uniqueIPs.add(targetNode.id);
      totalSize += link.size || 0;

      const srcColor = getColorFromSeverity(nodeSeverities.get(sourceNode.id) || 0);
      const dstColor = getColorFromSeverity(nodeSeverities.get(targetNode.id) || 0);

      const getCoords = (node: any) => {
        if (node.lat !== undefined && node.lng !== undefined && !isNaN(node.lat) && !isNaN(node.lng)) {
          return { lat: node.lat, lng: node.lng };
        }
        if (node.country) {
          const centroid = countryCentroids.get(node.country.toLowerCase());
          if (centroid) return centroid;
        }
        return null;
      };

      const srcCoords = getCoords(sourceNode);
      const dstCoords = getCoords(targetNode);

      let services = new Set<string>();
      let countries = new Set<string>();
      let aliasHosts = new Set<string>();
      let iocs = new Set<string>();
      let bocs = new Set<string>();
      let eocs = new Set<string>();
      let latestTime = 0;

      link.sessions?.forEach((s: any) => {
        if (s.service) (Array.isArray(s.service) ? s.service : [s.service]).forEach((x: string) => services.add(x));
        if (s['country.dst']) (Array.isArray(s['country.dst']) ? s['country.dst'] : [s['country.dst']]).forEach((x: string) => countries.add(x));
        if (s['country.src']) (Array.isArray(s['country.src']) ? s['country.src'] : [s['country.src']]).forEach((x: string) => countries.add(x));
        if (s['alias.host']) (Array.isArray(s['alias.host']) ? s['alias.host'] : [s['alias.host']]).forEach((x: string) => aliasHosts.add(x));
        if (s.ioc) (Array.isArray(s.ioc) ? s.ioc : [s.ioc]).forEach((x: string) => iocs.add(x));
        if (s.boc) (Array.isArray(s.boc) ? s.boc : [s.boc]).forEach((x: string) => bocs.add(x));
        if (s.eoc) (Array.isArray(s.eoc) ? s.eoc : [s.eoc]).forEach((x: string) => eocs.add(x));
        if (s.time) {
          const t = Array.isArray(s.time) ? parseInt(s.time[0]) : parseInt(s.time);
          if (t > latestTime) latestTime = t;
        }
      });

      if (sourceNode.country) countries.add(sourceNode.country);
      if (targetNode.country) countries.add(targetNode.country);

      let linkHasIoc = false;
      let linkHasBoc = false;
      let linkHasEoc = false;
      link.sessions?.forEach((s: any) => {
        if (s.ioc) linkHasIoc = true;
        if (s.boc) linkHasBoc = true;
        if (s.eoc) linkHasEoc = true;
      });
      const linkColor = linkHasIoc ? '#ef4444' : linkHasBoc ? '#f97316' : linkHasEoc ? '#eab308' : '#3b82f6';

      feed.push({
        id: `${sourceNode.id}-${targetNode.id}`,
        source: sourceNode.id,
        target: targetNode.id,
        sourceNode,
        targetNode,
        srcCoords,
        dstCoords,
        srcColor,
        dstColor,
        color: linkColor,
        link,
        size: link.size || 0,
        time: latestTime,
        service: Array.from(services).join(', '),
        country: Array.from(countries).join(', '),
        aliasHost: Array.from(aliasHosts).join(', '),
        ioc: Array.from(iocs).join(', '),
        boc: Array.from(bocs).join(', '),
        eoc: Array.from(eocs).join(', '),
      });
    });

    feed.sort((a, b) => {
      if (feedSort === 'time') return b.time - a.time;
      return b.size - a.size;
    });

    // Limit arcs to top 500 to maintain smooth WebGL performance
    const topFeed = feed.slice(0, 500);
    topFeed.forEach((item) => {
      if (item.srcCoords && !uniqueNodes.has(item.source)) {
        uniqueNodes.set(item.source, { lat: item.srcCoords.lat, lng: item.srcCoords.lng, color: item.srcColor, node: item.sourceNode });
      }
      if (item.dstCoords && !uniqueNodes.has(item.target)) {
        uniqueNodes.set(item.target, { lat: item.dstCoords.lat, lng: item.dstCoords.lng, color: item.dstColor, node: item.targetNode });
      }

      if (item.srcCoords && item.dstCoords) {
        const arcBase = {
          startLat: item.srcCoords.lat,
          startLng: item.srcCoords.lng,
          endLat: item.dstCoords.lat,
          endLng: item.dstCoords.lng,
          color: [item.srcColor, item.dstColor],
          link: item.link,
          name: `${item.source} -> ${item.target}`
        };
        arcs.push({ ...arcBase, isTrack: true });
        arcs.push({ ...arcBase, isTrack: false });
      }
    });

    return {
      arcsData: arcs,
      ringsData: Array.from(uniqueNodes.values()),
      stats: {
        flows: filteredLinks.length,
        size: totalSize,
        ips: uniqueIPs.size
      },
      liveFeed: feed
    };
  }, [data, countryCentroids, searchQuery, feedSort, showThreatsOnly]);

  const labelsData = useMemo(() => {
    if (!showLabels || !countries?.features) return [];
    return countries.features.map((f: any) => {
      try {
        const centroid = d3.geoCentroid(f);
        return {
          lat: centroid[1],
          lng: centroid[0],
          text: f.properties?.NAME || '',
          size: 0.3,
          color: isDark ? 'rgba(255,255,255,0.8)' : '#e5e7eb'
        };
      } catch (e) {
        return null;
      }
    }).filter(Boolean) as any[];
  }, [countries, showLabels, isDark]);

  useEffect(() => {
    if (selectedItem && globeRef.current) {
      let targetLat: number | undefined;
      let targetLng: number | undefined;
      
      if ('source' in selectedItem && 'target' in selectedItem) {
        const sourceId = typeof selectedItem.source === 'string' ? selectedItem.source : selectedItem.source.id;
        let ringNode = ringsData.find(r => r.node.id === sourceId);
        
        if (!ringNode) {
          const targetId = typeof selectedItem.target === 'string' ? selectedItem.target : selectedItem.target.id;
          ringNode = ringsData.find(r => r.node.id === targetId);
        }

        if (ringNode) {
          targetLat = ringNode.lat;
          targetLng = ringNode.lng;
        }
      } else if ('id' in selectedItem) {
        const ringNode = ringsData.find(r => r.node.id === selectedItem.id);
        if (ringNode) {
          targetLat = ringNode.lat;
          targetLng = ringNode.lng;
        }
      }

      if (targetLat !== undefined && targetLng !== undefined) {
        setAutoRotate(false);
        setTimeout(() => {
          if (globeRef.current) {
            globeRef.current.pointOfView({ lat: targetLat, lng: targetLng, altitude: 2.0 }, 1000);
          }
        }, 50);
      }
    }
  }, [selectedItem, ringsData]);

  const handleItemClick = (item: any, lat?: number, lng?: number) => {
    setAutoRotate(false);
    onItemClick(item);
  };

  return (
    <div className="relative w-full h-full flex overflow-hidden">
      <div 
        className="flex-1 min-w-0 relative" 
        ref={containerRef}
      >
        {globeSize.width > 0 && (
          <Globe
            ref={globeRef}
            width={globeSize.width}
            height={globeSize.height}
            globeImageUrl={isDark ? "//unpkg.com/three-globe/example/img/earth-dark.jpg" : "//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"}
            bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
            backgroundImageUrl={isDark ? "//unpkg.com/three-globe/example/img/night-sky.png" : ""}
            backgroundColor={isDark ? "#020617" : "#f8fafc"}
            
            polygonsData={countries.features}
            polygonAltitude={0.01}
            polygonCapColor={() => 'rgba(0, 0, 0, 0)'}
            polygonSideColor={() => 'rgba(0, 100, 255, 0.15)'}
            polygonStrokeColor={() => isDark ? '#334155' : '#cbd5e1'}
            
            arcsData={arcsData}
            arcColor={(d: any) => {
              const isSelected = selectedItem === d.link;
              if (isSelected) return ['#bbf7d0', '#22c55e'];
              return d.isTrack ? [d.color[0] + '40', d.color[1] + '40'] : d.color;
            }}
          arcDashLength={(d: any) => d.isTrack ? 1 : 0.4}
          arcDashGap={(d: any) => d.isTrack ? 0 : 0.2}
          arcDashAnimateTime={(d: any) => d.isTrack ? 0 : 1500}
          arcStroke={(d: any) => {
            const isSelected = selectedItem === d.link;
            return isSelected ? 2 : (hoveredArc === d.link ? 1.5 : (d.isTrack ? 0.2 : 0.5));
          }}
          onArcHover={(d: any) => {
            setHoveredArc(d ? d.link : null);
            setHoveredItemNode(d ? d.link : null);
          }}
          onArcClick={(d: any) => handleItemClick(d.link, d.startLat, d.startLng)}
          
          ringsData={ringsData}
          ringColor={(d: any) => {
            const isSelectedNode = selectedItem && 'id' in selectedItem && selectedItem.id === d.node.id;
            const isSelectedLink = selectedItem && !('id' in selectedItem) && (
              (typeof selectedItem.source === 'string' ? selectedItem.source === d.node.id : selectedItem.source?.id === d.node.id) ||
              (typeof selectedItem.target === 'string' ? selectedItem.target === d.node.id : selectedItem.target?.id === d.node.id)
            );
            return isSelectedNode || isSelectedLink ? '#22c55e' : d.color;
          }}
          ringMaxRadius={(d: any) => {
            const isSelectedNode = selectedItem && 'id' in selectedItem && selectedItem.id === d.node.id;
            const isSelectedLink = selectedItem && !('id' in selectedItem) && (
              (typeof selectedItem.source === 'string' ? selectedItem.source === d.node.id : selectedItem.source?.id === d.node.id) ||
              (typeof selectedItem.target === 'string' ? selectedItem.target === d.node.id : selectedItem.target?.id === d.node.id)
            );
            return isSelectedNode || isSelectedLink ? 5 : 3;
          }}
          ringPropagationSpeed={2}
          ringRepeatPeriod={1000}

          pointsData={ringsData}
          pointColor={(d: any) => {
            const isSelectedNode = selectedItem && 'id' in selectedItem && selectedItem.id === d.node.id;
            const isSelectedLink = selectedItem && !('id' in selectedItem) && (
              (typeof selectedItem.source === 'string' ? selectedItem.source === d.node.id : selectedItem.source?.id === d.node.id) ||
              (typeof selectedItem.target === 'string' ? selectedItem.target === d.node.id : selectedItem.target?.id === d.node.id)
            );
            return isSelectedNode || isSelectedLink ? '#22c55e' : d.color;
          }}
          pointAltitude={0.02}
          pointRadius={(d: any) => {
            const isSelectedNode = selectedItem && 'id' in selectedItem && selectedItem.id === d.node.id;
            const isSelectedLink = selectedItem && !('id' in selectedItem) && (
              (typeof selectedItem.source === 'string' ? selectedItem.source === d.node.id : selectedItem.source?.id === d.node.id) ||
              (typeof selectedItem.target === 'string' ? selectedItem.target === d.node.id : selectedItem.target?.id === d.node.id)
            );
            return isSelectedNode || isSelectedLink ? 1.0 : 0.5;
          }}
          onPointHover={(d: any) => setHoveredItemNode(d ? d.node : null)}
          onPointClick={(d: any) => handleItemClick(d.node, d.lat, d.lng)}

          labelsData={labelsData}
          labelLat="lat"
          labelLng="lng"
          labelText="text"
          labelSize="size"
          labelColor="color"
          labelAltitude={0.02}
          labelDotRadius={0.1}
          labelResolution={2}
          onLabelClick={(d: any) => handleItemClick(d.node, d.lat, d.lng)}
        />
        )}

        <button
          onClick={() => setAutoRotate(!autoRotate)}
          className="absolute bottom-6 right-6 p-3 bg-gray-900/80 border border-gray-700 rounded-full text-white shadow-lg hover:bg-gray-800 transition-colors backdrop-blur-sm z-10"
          title={autoRotate ? "Pause Rotation" : "Resume Rotation"}
        >
          {autoRotate ? <Pause size={20} /> : <Play size={20} />}
        </button>
      </div>

      {/* UI Overlay */}
      <div className="hidden lg:flex w-80 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border-l border-gray-200 dark:border-gray-800 flex-col h-full z-10 shrink-0">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Radar className="text-[#BE3B37]" size={20} />
            Network Telemetry
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg animate-in fade-in slide-in-from-top-2" style={{ animationDelay: '100ms' }}>
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
                <Activity size={14} />
                <span className="text-xs font-semibold uppercase">Flows</span>
              </div>
              <div className="text-xl font-bold">{formatNumber(stats.flows)}</div>
            </div>
            <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg animate-in fade-in slide-in-from-top-2" style={{ animationDelay: '200ms' }}>
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
                <Users size={14} />
                <span className="text-xs font-semibold uppercase">Unique IPs</span>
              </div>
              <div className="text-xl font-bold">{formatNumber(stats.ips)}</div>
            </div>
            <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg col-span-2 animate-in fade-in slide-in-from-top-2" style={{ animationDelay: '300ms' }}>
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
              <Activity size={16} className="text-[#BE3B37]" />
              Live Feed
            </h3>
            <select 
              value={feedSort} 
              onChange={(e) => setFeedSort(e.target.value as 'time' | 'size')}
              className="text-xs bg-gray-100 dark:bg-gray-800 border-none rounded px-2 py-1 outline-none focus:ring-1 focus:ring-[#BE3B37] dark:focus:ring-[#BE3B37] text-gray-700 dark:text-gray-300 cursor-pointer transition-shadow"
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
                className="w-full bg-gray-100 dark:bg-gray-800 border-none rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-[#BE3B37] dark:text-gray-200 outline-none transition-shadow"
              />
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 py-2 px-2.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
              <input 
                type="checkbox" 
                checked={showThreatsOnly}
                onChange={(e) => setShowThreatsOnly(e.target.checked)}
                className="rounded text-[#BE3B37] focus:ring-[#BE3B37] bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700"
              />
              Threats
            </label>
          </div>

          <div className="space-y-2 overflow-y-auto flex-1 pr-1">
            {liveFeed.slice(0, 100).map((item, i) => {
              const isSelected = selectedItem === item.link;
              return (
              <div 
                key={i}
                onClick={() => {
                  let ringNode = ringsData.find(r => r.node.id === item.source);
                  if (!ringNode) {
                    ringNode = ringsData.find(r => r.node.id === item.target);
                  }
                  handleItemClick(item.link, ringNode?.lat, ringNode?.lng);
                }}
                className={`p-3 rounded-lg border cursor-pointer transition-colors animate-in fade-in slide-in-from-right-8 ${
                  isSelected 
                    ? 'border-green-400 dark:border-green-500 bg-green-50 dark:bg-green-900/20 shadow-[0_0_10px_rgba(34,197,94,0.3)]' 
                    : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 bg-gray-50 dark:bg-gray-800/50'
                }`}
                style={{ animationDelay: `${Math.min(i * 50, 500)}ms` }}
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
                  {item.service && (
                    <div className="flex flex-wrap gap-1">
                      {item.service.split(', ').map((s: string) => (
                        <span key={s} className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded text-[9px] font-medium uppercase tracking-wider">{s}</span>
                      ))}
                    </div>
                  )}
                  {item.country && (
                    <div className="flex flex-wrap gap-1">
                      {item.country.split(', ').map((c: string) => (
                        <span key={c} className="px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded text-[9px] font-medium uppercase tracking-wider">{c}</span>
                      ))}
                    </div>
                  )}
                  {item.ioc && (
                    <div className="flex flex-wrap gap-1">
                      {item.ioc.split(', ').map((c: string) => (
                        <span key={c} className="px-1.5 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded text-[9px] font-medium uppercase tracking-wider">{c}</span>
                      ))}
                    </div>
                  )}
                  {item.boc && (
                    <div className="flex flex-wrap gap-1">
                      {item.boc.split(', ').map((c: string) => (
                        <span key={c} className="px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 rounded text-[9px] font-medium uppercase tracking-wider">{c}</span>
                      ))}
                    </div>
                  )}
                  {item.eoc && (
                    <div className="flex flex-wrap gap-1">
                      {item.eoc.split(', ').map((c: string) => (
                        <span key={c} className="px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 rounded text-[9px] font-medium uppercase tracking-wider">{c}</span>
                      ))}
                    </div>
                  )}
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

                <div className="text-xs font-semibold text-gray-600 dark:text-gray-300 text-right">
                  {formatBytes(item.size)}
                </div>
              </div>
            )})}
            {liveFeed.length === 0 && (
              <div className="text-sm text-gray-500 text-center py-8">No active connections</div>
            )}
          </div>
        </div>
      </div>

      {/* Hover Tooltip */}
      <div 
        ref={tooltipRef}
        className={`fixed left-0 top-0 z-50 pointer-events-none bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-xl rounded-lg p-3 text-sm transition-opacity duration-200 ${hoveredItemNode ? 'opacity-100' : 'opacity-0'}`}
        style={{ 
          maxWidth: '300px',
          willChange: 'transform, opacity'
        }}
      >
        {lastHoveredItemNode && (
          ('source' in lastHoveredItemNode) ? (
            // Link Tooltip
            <div className="space-y-2">
              <div className="font-semibold text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-700 pb-1 mb-1">
                Connection Details
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500 dark:text-gray-400">Source:</span>
                <span className="font-mono text-right truncate">{(lastHoveredItemNode.source as any).id || lastHoveredItemNode.source}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500 dark:text-gray-400">Target:</span>
                <span className="font-mono text-right truncate">{(lastHoveredItemNode.target as any).id || lastHoveredItemNode.target}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500 dark:text-gray-400">Sessions:</span>
                <span className="font-semibold">{lastHoveredItemNode.count}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500 dark:text-gray-400">Size:</span>
                <span className="font-semibold">{formatBytes(lastHoveredItemNode.size || 0)}</span>
              </div>
            </div>
          ) : (
            // Node Tooltip
            <div className="space-y-2">
              <div className="font-semibold text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-700 pb-1 mb-1 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: lastHoveredItemNode.networkType === 'public' ? '#BE3B37' : (lastHoveredItemNode.networkType === 'internal' ? (isDark ? '#0ea5e9' : '#3b82f6') : '#64748b') }}></div>
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
          )
        )}
      </div>
    </div>
  );
}
