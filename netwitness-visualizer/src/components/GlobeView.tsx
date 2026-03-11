import React, { useEffect, useState, useRef, useMemo } from 'react';
import Globe from 'react-globe.gl';
import * as d3 from 'd3';
import { GraphData, Node, Link } from '../types';
import { Play, Pause, Activity, Database, Users, Search } from 'lucide-react';
import { formatBytes } from '../lib/utils';

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
  const containerRef = useRef<HTMLDivElement>(null);
  const [globeSize, setGlobeSize] = useState({ width: 0, height: 0 });

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
    if (globeRef.current && globeRef.current.controls && globeRef.current.controls()) {
      globeRef.current.controls().autoRotate = autoRotate;
      globeRef.current.controls().autoRotateSpeed = 0.5;
      // Prevent zooming inside the globe
      globeRef.current.controls().minDistance = 120;
      globeRef.current.controls().maxDistance = 400;
    }
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

    const filteredLinks = data.links.filter((link: any) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      const sourceNode = typeof link.source === 'string' ? data.nodes.find(n => n.id === link.source) : link.source;
      const targetNode = typeof link.target === 'string' ? data.nodes.find(n => n.id === link.target) : link.target;
      
      if (sourceNode?.id.toLowerCase().includes(q) || targetNode?.id.toLowerCase().includes(q)) return true;
      
      let match = false;
      link.sessions?.forEach((s: any) => {
        if (s.service && String(s.service).toLowerCase().includes(q)) match = true;
        if (s['country.dst'] && String(s['country.dst']).toLowerCase().includes(q)) match = true;
        if (s['country.src'] && String(s['country.src']).toLowerCase().includes(q)) match = true;
        if (s['alias.host'] && String(s['alias.host']).toLowerCase().includes(q)) match = true;
      });
      if (sourceNode?.country?.toLowerCase().includes(q) || targetNode?.country?.toLowerCase().includes(q)) match = true;
      
      return match;
    });

    const nodeSeverities = new Map<string, number>();
    filteredLinks.forEach((link: any) => {
      let hasIoc = false;
      let hasEocBoc = false;
      link.sessions?.forEach((s: any) => {
        if (s.ioc) hasIoc = true;
        if (s.eoc || s.boc) hasEocBoc = true;
      });
      const severity = hasIoc ? 2 : hasEocBoc ? 1 : 0;
      
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;
      
      nodeSeverities.set(sourceId, Math.max(severity, nodeSeverities.get(sourceId) || 0));
      nodeSeverities.set(targetId, Math.max(severity, nodeSeverities.get(targetId) || 0));
    });

    const getColorFromSeverity = (sev: number) => sev === 2 ? '#BE3B37' : sev === 1 ? '#f97316' : '#3b82f6';
    const uniqueNodes = new Map<string, any>();

    filteredLinks.forEach((link: any) => {
      const sourceNode = typeof link.source === 'string' ? data.nodes.find(n => n.id === link.source) : link.source;
      const targetNode = typeof link.target === 'string' ? data.nodes.find(n => n.id === link.target) : link.target;

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

      if (srcCoords && !uniqueNodes.has(sourceNode.id)) {
        uniqueNodes.set(sourceNode.id, { lat: srcCoords.lat, lng: srcCoords.lng, color: srcColor, node: sourceNode });
      }
      if (dstCoords && !uniqueNodes.has(targetNode.id)) {
        uniqueNodes.set(targetNode.id, { lat: dstCoords.lat, lng: dstCoords.lng, color: dstColor, node: targetNode });
      }

      if (srcCoords && dstCoords) {
        const arcBase = {
          startLat: srcCoords.lat,
          startLng: srcCoords.lng,
          endLat: dstCoords.lat,
          endLng: dstCoords.lng,
          color: [srcColor, dstColor],
          link,
          name: `${sourceNode.id} -> ${targetNode.id}`
        };
        arcs.push({ ...arcBase, isTrack: true });
        arcs.push({ ...arcBase, isTrack: false });
      }

      let services = new Set<string>();
      let countries = new Set<string>();
      let aliasHosts = new Set<string>();

      link.sessions?.forEach((s: any) => {
        if (s.service) (Array.isArray(s.service) ? s.service : [s.service]).forEach((x: string) => services.add(x));
        if (s['country.dst']) (Array.isArray(s['country.dst']) ? s['country.dst'] : [s['country.dst']]).forEach((x: string) => countries.add(x));
        if (s['country.src']) (Array.isArray(s['country.src']) ? s['country.src'] : [s['country.src']]).forEach((x: string) => countries.add(x));
        if (s['alias.host']) (Array.isArray(s['alias.host']) ? s['alias.host'] : [s['alias.host']]).forEach((x: string) => aliasHosts.add(x));
      });

      if (sourceNode.country) countries.add(sourceNode.country);
      if (targetNode.country) countries.add(targetNode.country);

      let linkHasIoc = false;
      let linkHasEocBoc = false;
      link.sessions?.forEach((s: any) => {
        if (s.ioc) linkHasIoc = true;
        if (s.eoc || s.boc) linkHasEocBoc = true;
      });
      const linkColor = linkHasIoc ? '#ef4444' : linkHasEocBoc ? '#f97316' : '#3b82f6';

      feed.push({
        id: `${sourceNode.id}-${targetNode.id}`,
        source: sourceNode.id,
        target: targetNode.id,
        color: linkColor,
        link,
        size: link.size || 0,
        service: Array.from(services).join(', '),
        country: Array.from(countries).join(', '),
        aliasHost: Array.from(aliasHosts).join(', '),
      });
    });

    feed.sort((a, b) => b.size - a.size);

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
  }, [data, countryCentroids, searchQuery]);

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
          color: isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.8)'
        };
      } catch (e) {
        return null;
      }
    }).filter(Boolean);
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
      <div className="flex-1 min-w-0 relative" ref={containerRef}>
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
              if (isSelected) return ['#fef08a', '#eab308'];
              return d.isTrack ? [d.color[0] + '40', d.color[1] + '40'] : d.color;
            }}
          arcDashLength={(d: any) => d.isTrack ? null : 0.4}
          arcDashGap={(d: any) => d.isTrack ? null : 0.2}
          arcDashAnimateTime={(d: any) => d.isTrack ? null : 1500}
          arcStroke={(d: any) => {
            const isSelected = selectedItem === d.link;
            return isSelected ? 2 : (hoveredArc === d.link ? 1.5 : (d.isTrack ? 0.2 : 0.5));
          }}
          onArcHover={(d: any) => setHoveredArc(d ? d.link : null)}
          onArcClick={(d: any) => handleItemClick(d.link, d.startLat, d.startLng)}
          
          ringsData={ringsData}
          ringColor={(d: any) => {
            const isSelectedNode = selectedItem && 'id' in selectedItem && selectedItem.id === d.node.id;
            const isSelectedLink = selectedItem && !('id' in selectedItem) && (
              (typeof selectedItem.source === 'string' ? selectedItem.source === d.node.id : selectedItem.source?.id === d.node.id) ||
              (typeof selectedItem.target === 'string' ? selectedItem.target === d.node.id : selectedItem.target?.id === d.node.id)
            );
            return isSelectedNode || isSelectedLink ? '#eab308' : d.color;
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
            return isSelectedNode || isSelectedLink ? '#eab308' : d.color;
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
          <h2 className="text-lg font-bold mb-4">Network Telemetry</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
                <Activity size={14} />
                <span className="text-xs font-semibold uppercase">Flows</span>
              </div>
              <div className="text-xl font-bold">{stats.flows}</div>
            </div>
            <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
                <Users size={14} />
                <span className="text-xs font-semibold uppercase">Unique IPs</span>
              </div>
              <div className="text-xl font-bold">{stats.ips}</div>
            </div>
            <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg col-span-2">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
                <Database size={14} />
                <span className="text-xs font-semibold uppercase">Total Payload</span>
              </div>
              <div className="text-xl font-bold">{formatBytes(stats.size)}</div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col">
          <h3 className="text-sm font-bold uppercase text-gray-500 dark:text-gray-400 mb-3">Live Feed</h3>
          
          <div className="relative mb-4 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            <input 
              type="text" 
              placeholder="Filter IPs, service, country..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-gray-100 dark:bg-gray-800 border-none rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 dark:text-gray-200 outline-none transition-shadow"
            />
          </div>

          <div className="space-y-2 overflow-y-auto flex-1 pr-1">
            {liveFeed.map((item, i) => {
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
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  isSelected 
                    ? 'border-yellow-400 dark:border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 shadow-[0_0_10px_rgba(250,204,21,0.3)]' 
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
                
                <div className="grid grid-cols-2 gap-1 mb-2">
                  {item.service && (
                    <div className="text-[10px] text-gray-500 truncate" title={item.service}>
                      <span className="font-semibold">Svc:</span> {item.service}
                    </div>
                  )}
                  {item.country && (
                    <div className="text-[10px] text-gray-500 truncate" title={item.country}>
                      <span className="font-semibold">Loc:</span> {item.country}
                    </div>
                  )}
                  {item.aliasHost && (
                    <div className="text-[10px] text-gray-500 truncate col-span-2" title={item.aliasHost}>
                      <span className="font-semibold">Host:</span> {item.aliasHost}
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
    </div>
  );
}
