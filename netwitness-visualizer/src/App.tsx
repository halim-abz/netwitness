import React, { useState, useRef, useEffect, useCallback } from "react";
import Sidebar, { QueryConfig } from "./components/Sidebar";
import NetworkGraph from "./components/NetworkGraph";
import GlobeView from "./components/GlobeView";
import { ErrorBoundary } from "./components/ErrorBoundary";
import DetailsPanel from "./components/DetailsPanel";
import { GraphData, Node, Link, NetWitnessResponse, Session } from "./types";
import { AlertCircle, Menu, Moon, Sun, Globe, Network } from "lucide-react";

export default function App() {
  const [graphData, setGraphData] = useState<GraphData>({
    nodes: [],
    links: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<Node | Link | null>(null);
  const [displayedAttributes, setDisplayedAttributes] = useState<string[]>(['service']);
  const [queriedAttributes, setQueriedAttributes] = useState<string[]>([]);
  const [isDark, setIsDark] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [viewMode, setViewMode] = useState<'graph' | 'globe'>(() => {
    try {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        if (params.get('view') === 'globe') return 'globe';
      }
    } catch (e) {}
    return 'graph';
  });
  
  const [homeLocation, setHomeLocation] = useState<{lat: number, lng: number} | null>(() => {
    try {
      const stored = localStorage.getItem('nw_home_location');
      if (stored) return JSON.parse(stored);
      
      const envLat = import.meta.env.VITE_NW_HOME_LAT;
      const envLng = import.meta.env.VITE_NW_HOME_LNG;
      if (envLat && envLng) {
        return { lat: parseFloat(envLat), lng: parseFloat(envLng) };
      }
      return null;
    } catch (e) {
      return null;
    }
  });
  const [navigateUrl, setNavigateUrl] = useState<string>(() => {
    return localStorage.getItem('nw_navigate_url') || import.meta.env.VITE_NW_NAVIGATE_URL;
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }, []);

  const handleQuery = useCallback(async (config: QueryConfig) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    setError(null);
    setSelectedItem(null);
    setDisplayedAttributes(['service']); // Reset displayed attributes on new query

    const optionalKeys = config.metakeys.filter(
      (k) => !["ip.src", "ip.dst", "size", "latdec.src", "latdec.dst", "longdec.src", "longdec.dst", "direction", "time"].includes(k)
    );
    setQueriedAttributes(optionalKeys);
    if (config.navigateUrl) {
      setNavigateUrl(config.navigateUrl);
    }

    try {
      const queryKeys = Array.from(new Set([
        ...config.metakeys.flatMap(k => k === 'country' ? ['country.src', 'country.dst'] : k === 'org' ? ['org.src', 'org.dst'] : [k]),
        'latdec.src', 'latdec.dst', 'longdec.src', 'longdec.dst', 'time'
      ]));
      const selectClause = queryKeys.join(",");
      let fullQuery = `select ${selectClause} where ${config.query}`;
      if (config.timeRange !== "all") {
        fullQuery += ` && time=rtp(latest,${config.timeRange})-u`;
      }

      const response = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: config.host,
          port: config.port,
          query: fullQuery,
          size: config.size,
          username: config.username,
          password: config.password,
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error ${response.status}`);
      }

      const data = await response.json();
      const processedData = processData(data, config.homeLocation);
      setGraphData(processedData);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log("Query cancelled");
        return;
      }
      console.error("Query failed:", err);
      setError(err.message || "An unknown error occurred");
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, []);

  const processData = (data: NetWitnessResponse, homeLoc?: {lat: number, lng: number} | null): GraphData => {
    if (!data?.results?.fields) return { nodes: [], links: [] };

    const sessionsMap: Record<number, Session> = {};
    const fields = data.results.fields;
    const fieldsLen = fields.length;

    // Group fields by session (group ID)
    for (let i = 0; i < fieldsLen; i++) {
      const field = fields[i];
      const g = field.group;
      if (!sessionsMap[g]) {
        sessionsMap[g] = { group: g };
      }
      
      const existing = sessionsMap[g][field.type];
      if (existing !== undefined) {
        if (Array.isArray(existing)) {
          if (!existing.includes(field.value)) existing.push(field.value);
        } else if (existing !== field.value) {
          sessionsMap[g][field.type] = [existing, field.value];
        }
      } else {
        sessionsMap[g][field.type] = field.value;
      }
    }

    const nodesMap: Record<string, Node> = {};
    const linksMap: Record<string, Link> = {};

    const sessionsValues = Object.values(sessionsMap);
    const sessionsLen = sessionsValues.length;

    for (let i = 0; i < sessionsLen; i++) {
      const session = sessionsValues[i];
      // Handle cases where ip.src or ip.dst might be arrays
      const srcs = Array.isArray(session["ip.src"]) ? session["ip.src"] : (session["ip.src"] ? [session["ip.src"]] : []);
      const dsts = Array.isArray(session["ip.dst"]) ? session["ip.dst"] : (session["ip.dst"] ? [session["ip.dst"]] : []);

      const dirStr = Array.isArray(session["direction"]) ? session["direction"][0] : session["direction"];
      const cSrc = Array.isArray(session["country.src"]) ? session["country.src"][0] : session["country.src"];
      const cDst = Array.isArray(session["country.dst"]) ? session["country.dst"][0] : session["country.dst"];
      const oSrc = Array.isArray(session["org.src"]) ? session["org.src"][0] : session["org.src"];
      const oDst = Array.isArray(session["org.dst"]) ? session["org.dst"][0] : session["org.dst"];
      const nn = Array.isArray(session["netname"]) ? session["netname"].join(", ") : session["netname"];

      const sessionKeys = Object.keys(session);

      // Add nodes and collect attributes
      const addNodeAttributes = (id: string, isSrc: boolean) => {
        let node = nodesMap[id];
        if (!node) {
          node = { id, type: "ip", attributes: {}, networkType: "unknown" };
          nodesMap[id] = node;
        }
        
        let networkType = 'unknown';
        if (dirStr) {
          const d = String(dirStr).toLowerCase();
          if (d === 'inbound') {
            networkType = isSrc ? 'public' : 'internal';
          } else if (d === 'outbound') {
            networkType = isSrc ? 'internal' : 'public';
          } else if (d === 'lateral') {
            networkType = 'internal';
          }
          node.networkType = networkType as any;
        }

        const country = isSrc ? cSrc : cDst;
        if (country) {
          node.country = String(country);
        }
        
        const org = isSrc ? oSrc : oDst;
        if (org) {
          node.org = String(org);
        }
        
        if (nn) {
          if (!node.netname) node.netname = String(nn);
          else if (!node.netname.includes(String(nn))) node.netname += `, ${String(nn)}`;
        }
        
        let lat = isSrc ? session["latdec.src"] : session["latdec.dst"];
        let lng = isSrc ? session["longdec.src"] : session["longdec.dst"];
        
        if (lat) node.lat = parseFloat(Array.isArray(lat) ? lat[0] : lat);
        if (lng) node.lng = parseFloat(Array.isArray(lng) ? lng[0] : lng);

        // Apply home location if missing and it's an internal IP in inbound/outbound
        if (homeLoc && networkType === 'internal' && String(dirStr).toLowerCase() !== 'lateral') {
          if (node.lat === undefined) node.lat = homeLoc.lat;
          if (node.lng === undefined) node.lng = homeLoc.lng;
        }

        // Add all session attributes to this node
        for (let k = 0; k < sessionKeys.length; k++) {
          const key = sessionKeys[k];
          if (key === "group" || key === "ip.src" || key === "ip.dst" || key === "size" || key === "direction" || key === "latdec.src" || key === "latdec.dst" || key === "longdec.src" || key === "longdec.dst" || key === "time") continue;
          
          if ((key.endsWith('.src') || key.endsWith('.srcport')) && !isSrc) continue;
          if ((key.endsWith('.dst') || key.endsWith('.dstport')) && isSrc) continue;
          
          if ((key === "ssl.ca" || key === "ssl.subject" || key === "server") && isSrc) continue;
          if (key === "client" && !isSrc) continue;
          
          if (!node.attributes![key]) {
            node.attributes![key] = [];
          }
          
          const value = session[key];
          const valuesToAdd = Array.isArray(value) ? value : [value];
          for (let vIdx = 0; vIdx < valuesToAdd.length; vIdx++) {
            const strVal = String(valuesToAdd[vIdx]);
            if (key === 'netname') {
              if (strVal.endsWith(' src') && !isSrc) continue;
              if (strVal.endsWith(' dst') && isSrc) continue;
            }
            if (!node.attributes![key].includes(strVal)) {
              node.attributes![key].push(strVal);
            }
          }
        }
      };

      for (let sIdx = 0; sIdx < srcs.length; sIdx++) {
        addNodeAttributes(srcs[sIdx], true);
      }
      for (let dIdx = 0; dIdx < dsts.length; dIdx++) {
        addNodeAttributes(dsts[dIdx], false);
      }

      // Create links for all src-dst pairs
      for (let sIdx = 0; sIdx < srcs.length; sIdx++) {
        const src = srcs[sIdx];
        for (let dIdx = 0; dIdx < dsts.length; dIdx++) {
          const dst = dsts[dIdx];
          const linkId = `${src}-${dst}`;
          let link = linksMap[linkId];
          if (!link) {
            link = {
              source: src,
              target: dst,
              sessions: [],
              size: 0,
              count: 0,
              services: new Set<string>(),
            } as any;
            linksMap[linkId] = link;
          }

          if (!link.sessions) link.sessions = [];
          link.sessions.push(session);
          link.count = (link.count || 0) + 1;

          const sizeVal = Array.isArray(session["size"]) ? session["size"][0] : session["size"];
          if (sizeVal) {
            link.size = (link.size || 0) + (parseInt(sizeVal, 10) || 0);
          }
          
          const serviceVal = session["service"];
          if (serviceVal) {
            const servicesToAdd = Array.isArray(serviceVal) ? serviceVal : [serviceVal];
            for (let svcIdx = 0; svcIdx < servicesToAdd.length; svcIdx++) {
              (link as any).services.add(String(servicesToAdd[svcIdx]));
            }
          }
        }
      }
    }

    const links = Object.values(linksMap).map(link => ({
      ...link,
      services: Array.from((link as any).services || []) as string[]
    }));

    return {
      nodes: Object.values(nodesMap),
      links: links,
    };
  };

  const handleAttributeSelect = useCallback((attrType: string, attrValue: string) => {
    let normalizedAttrType = attrType;
    if (attrType === 'country.src' || attrType === 'country.dst') normalizedAttrType = 'country';
    if (attrType === 'org.src' || attrType === 'org.dst') normalizedAttrType = 'org';

    setDisplayedAttributes(prev => {
      if (!prev.includes(normalizedAttrType)) {
        return [...prev, normalizedAttrType];
      }
      return prev;
    });
    
    setSelectedItem({
      id: `attr-${normalizedAttrType}-${attrValue}`,
      type: "attribute",
      attrType: normalizedAttrType,
      attrValue: attrValue,
    });
  }, []);

  return (
    <div className={`flex h-screen w-full bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-300 font-sans overflow-hidden transition-colors duration-200 ${isDark ? 'dark' : ''}`}>
      {isSidebarOpen && (
        <>
          <div 
            className="fixed inset-0 bg-black/20 dark:bg-black/40 z-30 md:hidden backdrop-blur-sm"
            onClick={() => setIsSidebarOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 z-40 md:relative shadow-2xl md:shadow-none">
            <Sidebar 
              onQuery={handleQuery} 
              isLoading={isLoading} 
              onCancel={handleCancel} 
              onClose={() => setIsSidebarOpen(false)} 
              homeLocation={homeLocation}
              onHomeLocationChange={setHomeLocation}
            />
          </div>
        </>
      )}

      <main className="flex-1 min-w-0 relative flex flex-col p-4">
        {/* Top Bar */}
        <div className="absolute top-6 left-6 z-20 flex items-center gap-2">
          {!isSidebarOpen && (
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              title="Open Sidebar"
            >
              <Menu size={18} />
            </button>
          )}
          {isSidebarOpen && (
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="hidden md:block p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              title="Close Sidebar"
            >
              <Menu size={18} />
            </button>
          )}
          <button
            onClick={() => setIsDark(!isDark)}
            className="p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            title="Toggle Theme"
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <div className="flex bg-gray-100 dark:bg-gray-800/80 p-1 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
            <button
              onClick={() => setViewMode('graph')}
              className={`px-3 py-1.5 flex items-center gap-2 text-sm font-medium transition-all rounded-md ${
                viewMode === 'graph'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-gray-700/50'
              }`}
            >
              <Network size={16} />
              <span>Graph</span>
            </button>
            <button
              onClick={() => setViewMode('globe')}
              className={`px-3 py-1.5 flex items-center gap-2 text-sm font-medium transition-all rounded-md ${
                viewMode === 'globe'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-gray-700/50'
              }`}
            >
              <Globe size={16} />
              <span>Globe</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 bg-red-50 dark:bg-red-950/80 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-200 px-4 py-3 rounded-lg shadow-md flex items-center gap-3 max-w-2xl w-full backdrop-blur-sm">
            <AlertCircle className="shrink-0 text-red-500 dark:text-red-400" size={20} />
            <div className="flex-1">
              <h3 className="font-semibold text-sm">Query Failed</h3>
              <p className="text-xs mt-1 opacity-90">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
            >
              &times;
            </button>
          </div>
        )}

        <div className="flex-1 relative rounded-xl border border-gray-200 dark:border-gray-800 shadow-lg bg-white dark:bg-gray-900 overflow-hidden transition-colors duration-200">
          {viewMode === 'graph' ? (
            <div className="w-full h-full bg-grid-pattern animate-grid">
              <NetworkGraph
                data={graphData}
                onNodeClick={setSelectedItem}
                onLinkClick={setSelectedItem}
                displayedAttributes={displayedAttributes}
                availableAttributes={queriedAttributes}
                onToggleAttribute={(attr) => {
                  setDisplayedAttributes((prev) =>
                    prev.includes(attr)
                      ? prev.filter((a) => a !== attr)
                      : [...prev, attr]
                  );
                }}
                isDark={isDark}
                selectedItem={selectedItem}
              />
            </div>
          ) : (
            <ErrorBoundary>
              <GlobeView
                data={graphData}
                onItemClick={setSelectedItem}
                isDark={isDark}
                selectedItem={selectedItem}
              />
            </ErrorBoundary>
          )}

          <DetailsPanel
            selectedItem={selectedItem}
            onClose={() => setSelectedItem(null)}
            graphData={graphData}
            onNodeSelect={setSelectedItem}
            onAttributeSelect={handleAttributeSelect}
            navigateUrl={navigateUrl}
          />
        </div>
      </main>
    </div>
  );
}

