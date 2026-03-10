import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
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
  const [viewMode, setViewMode] = useState<'graph' | 'globe'>('graph');
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  };

  const handleQuery = async (config: QueryConfig) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    setError(null);
    setSelectedItem(null);
    setDisplayedAttributes(['service']); // Reset displayed attributes on new query

    const optionalKeys = config.metakeys.filter(
      (k) => !["ip.src", "ip.dst", "size", "latdec.src", "latdec.dst", "longdec.src", "longdec.dst", "direction"].includes(k)
    );
    setQueriedAttributes(optionalKeys);

    try {
      const queryKeys = Array.from(new Set([
        ...config.metakeys.flatMap(k => k === 'country' ? ['country.src', 'country.dst'] : k === 'org' ? ['org.src', 'org.dst'] : [k]),
        'latdec.src', 'latdec.dst', 'longdec.src', 'longdec.dst'
      ]));
      const selectClause = queryKeys.join(",");
      let fullQuery = `select ${selectClause} where ${config.query}`;
      if (config.timeRange !== "all") {
        fullQuery += ` && time=rtp(latest,${config.timeRange})-u`;
      }
      fullQuery += "";

      const response = await axios.post<NetWitnessResponse>("/api/query", {
        host: config.host,
        port: config.port,
        query: fullQuery,
        size: config.size,
        username: config.username,
        password: config.password,
      }, {
        signal: abortControllerRef.current.signal
      });

      const processedData = processData(response.data);
      setGraphData(processedData);
    } catch (err: any) {
      if (axios.isCancel(err)) {
        console.log("Query cancelled");
        return;
      }
      console.error("Query failed:", err);
      setError(
        err.response?.data?.error || err.message || "An unknown error occurred",
      );
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const processData = (data: NetWitnessResponse): GraphData => {
    if (!data?.results?.fields) return { nodes: [], links: [] };

    const sessionsMap: Record<number, Session> = {};

    // Group fields by session (group ID)
    data.results.fields.forEach((field) => {
      if (!sessionsMap[field.group]) {
        sessionsMap[field.group] = { group: field.group };
      }
      
      const existing = sessionsMap[field.group][field.type];
      if (existing) {
        if (Array.isArray(existing)) {
          if (!existing.includes(field.value)) existing.push(field.value);
        } else if (existing !== field.value) {
          sessionsMap[field.group][field.type] = [existing, field.value];
        }
      } else {
        sessionsMap[field.group][field.type] = field.value;
      }
    });

    const nodesMap: Record<string, Node> = {};
    const linksMap: Record<string, Link> = {};

    Object.values(sessionsMap).forEach((session) => {
      // Handle cases where ip.src or ip.dst might be arrays
      const srcs = Array.isArray(session["ip.src"]) ? session["ip.src"] : (session["ip.src"] ? [session["ip.src"]] : []);
      const dsts = Array.isArray(session["ip.dst"]) ? session["ip.dst"] : (session["ip.dst"] ? [session["ip.dst"]] : []);

      const dirStr = Array.isArray(session["direction"]) ? session["direction"][0] : session["direction"];
      const cSrc = Array.isArray(session["country.src"]) ? session["country.src"][0] : session["country.src"];
      const cDst = Array.isArray(session["country.dst"]) ? session["country.dst"][0] : session["country.dst"];
      const oSrc = Array.isArray(session["org.src"]) ? session["org.src"][0] : session["org.src"];
      const oDst = Array.isArray(session["org.dst"]) ? session["org.dst"][0] : session["org.dst"];
      const nn = Array.isArray(session["netname"]) ? session["netname"].join(", ") : session["netname"];

      // Add nodes and collect attributes
      const addNodeAttributes = (id: string, isSrc: boolean) => {
        if (!nodesMap[id]) {
          nodesMap[id] = { id, type: "ip", attributes: {}, networkType: "unknown" };
        }
        
        if (dirStr) {
          const d = String(dirStr).toLowerCase();
          if (d === 'inbound') {
            nodesMap[id].networkType = isSrc ? 'public' : 'internal';
          } else if (d === 'outbound') {
            nodesMap[id].networkType = isSrc ? 'internal' : 'public';
          } else if (d === 'lateral') {
            nodesMap[id].networkType = 'internal';
          }
        }

        const country = isSrc ? cSrc : cDst;
        if (country) {
          nodesMap[id].country = String(country);
        }
        
        const org = isSrc ? oSrc : oDst;
        if (org) {
          nodesMap[id].org = String(org);
        }
        
        if (nn) {
          if (!nodesMap[id].netname) nodesMap[id].netname = String(nn);
          else if (!nodesMap[id].netname?.includes(String(nn))) nodesMap[id].netname += `, ${String(nn)}`;
        }
        
        const lat = isSrc ? session["latdec.src"] : session["latdec.dst"];
        const lng = isSrc ? session["longdec.src"] : session["longdec.dst"];
        if (lat) nodesMap[id].lat = parseFloat(Array.isArray(lat) ? lat[0] : lat);
        if (lng) nodesMap[id].lng = parseFloat(Array.isArray(lng) ? lng[0] : lng);

        // Add all session attributes to this node
        Object.entries(session).forEach(([key, value]) => {
          if (["group", "ip.src", "ip.dst", "size", "direction", "latdec.src", "latdec.dst", "longdec.src", "longdec.dst"].includes(key)) return;
          
          if ((key.endsWith('.src') || key.endsWith('.srcport')) && !isSrc) return;
          if ((key.endsWith('.dst') || key.endsWith('.dstport')) && isSrc) return;
          
          if (["ssl.ca", "ssl.subject", "server"].includes(key) && isSrc) return;
          if (key === "client" && !isSrc) return;
          
          if (!nodesMap[id].attributes![key]) {
            nodesMap[id].attributes![key] = [];
          }
          
          const valuesToAdd = Array.isArray(value) ? value : [value];
          valuesToAdd.forEach(v => {
            const strVal = String(v);
            if (key === 'netname') {
              if (strVal.endsWith(' src') && !isSrc) return;
              if (strVal.endsWith(' dst') && isSrc) return;
            }
            if (!nodesMap[id].attributes![key].includes(strVal)) {
              nodesMap[id].attributes![key].push(strVal);
            }
          });
        });
      };

      srcs.forEach(src => addNodeAttributes(src, true));
      dsts.forEach(dst => addNodeAttributes(dst, false));

      // Create links for all src-dst pairs
      srcs.forEach(src => {
        dsts.forEach(dst => {
          const linkId = `${src}-${dst}`;
          if (!linksMap[linkId]) {
            linksMap[linkId] = {
              source: src,
              target: dst,
              sessions: [],
              size: 0,
              count: 0,
              services: new Set<string>(),
            } as any;
          }

          linksMap[linkId].sessions.push(session);
          linksMap[linkId].count += 1;

          const sizeVal = Array.isArray(session["size"]) ? session["size"][0] : session["size"];
          if (sizeVal) {
            linksMap[linkId].size += parseInt(sizeVal, 10) || 0;
          }
          
          const serviceVal = session["service"];
          if (serviceVal) {
            const servicesToAdd = Array.isArray(serviceVal) ? serviceVal : [serviceVal];
            servicesToAdd.forEach(s => (linksMap[linkId] as any).services.add(String(s)));
          }
        });
      });
    });

    const links = Object.values(linksMap).map(link => ({
      ...link,
      services: Array.from((link as any).services || [])
    }));

    return {
      nodes: Object.values(nodesMap),
      links: links,
    };
  };

  const handleAttributeSelect = (attrType: string, attrValue: string) => {
    let normalizedAttrType = attrType;
    if (attrType === 'country.src' || attrType === 'country.dst') normalizedAttrType = 'country';
    if (attrType === 'org.src' || attrType === 'org.dst') normalizedAttrType = 'org';

    if (!displayedAttributes.includes(normalizedAttrType)) {
      setDisplayedAttributes(prev => [...prev, normalizedAttrType]);
    }
    
    setSelectedItem({
      id: `attr-${normalizedAttrType}-${attrValue}`,
      type: "attribute",
      attrType: normalizedAttrType,
      attrValue: attrValue,
    });
  };

  return (
    <div className="flex h-screen w-full bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-300 font-sans overflow-hidden transition-colors duration-200">
      {isSidebarOpen && (
        <>
          <div 
            className="fixed inset-0 bg-black/20 dark:bg-black/40 z-30 md:hidden backdrop-blur-sm"
            onClick={() => setIsSidebarOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 z-40 md:relative shadow-2xl md:shadow-none">
            <Sidebar onQuery={handleQuery} isLoading={isLoading} onCancel={handleCancel} onClose={() => setIsSidebarOpen(false)} />
          </div>
        </>
      )}

      <main className="flex-1 min-w-0 relative flex flex-col p-4">
        {/* Top Bar */}
        <div className="absolute top-6 left-6 z-20 flex items-center gap-2">
          {!isSidebarOpen && (
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              title="Open Sidebar"
            >
              <Menu size={18} />
            </button>
          )}
          {isSidebarOpen && (
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="hidden md:block p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              title="Close Sidebar"
            >
              <Menu size={18} />
            </button>
          )}
          <button
            onClick={() => setIsDark(!isDark)}
            className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            title="Toggle Theme"
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <div className="flex bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm overflow-hidden">
            <button
              onClick={() => setViewMode('graph')}
              className={`px-3 py-2 flex items-center gap-2 text-sm font-medium transition-colors ${
                viewMode === 'graph'
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <Network size={16} />
              <span>Graph</span>
            </button>
            <button
              onClick={() => setViewMode('globe')}
              className={`px-3 py-2 flex items-center gap-2 text-sm font-medium transition-colors ${
                viewMode === 'globe'
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
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

        <div className="flex-1 relative rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg bg-white dark:bg-slate-900 overflow-hidden transition-colors duration-200">
          {viewMode === 'graph' ? (
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
          ) : (
            <ErrorBoundary>
              <GlobeView
                data={graphData}
                onItemClick={setSelectedItem}
                isDark={isDark}
              />
            </ErrorBoundary>
          )}

          <DetailsPanel
            selectedItem={selectedItem}
            onClose={() => setSelectedItem(null)}
            graphData={graphData}
            onNodeSelect={setSelectedItem}
            onAttributeSelect={handleAttributeSelect}
          />
        </div>
      </main>
    </div>
  );
}
