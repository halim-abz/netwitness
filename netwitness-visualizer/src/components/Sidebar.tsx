import React, { useState, useEffect, useCallback } from "react";
import { Play, Settings, Server, Filter, ChevronDown, ChevronRight, MapPin } from "lucide-react";
import { Logo } from "./Logo";

/**
 * List of optional metakeys that can be queried from NetWitness.
 */
const OPTIONAL_METAKEYS = [
  "service", "client", "server", "user.all", "email.all", "domain", "alias.host",
  "country", "org", "ioc", "boc", "eoc", "filename.all", "filetype",
  "ssl.ca", "ssl.subject", "action", "tcp.dstport", "udp.dstport",
  "ja3", "ja3s", "ja4", "eth.src", "eth.dst",
  "latdec.src", "latdec.dst", "longdec.src", "longdec.dst"
];

/**
 * Categorized metakeys for easier selection in the UI.
 */
const METAKEY_CATEGORIES: Record<string, string[]> = {
  "Network": ["service", "tcp.dstport", "udp.dstport", "action"],
  "Identity": ["client", "server", "user.all", "email.all", "domain", "alias.host"],
  "Geo/Org": ["country", "org"],
  "Threat Intel": ["ioc", "boc", "eoc"],
  "Files": ["filename.all", "filetype"],
  "Encryption": ["ssl.ca", "ssl.subject", "ja3", "ja3s", "ja4"],
  "Hardware": ["eth.src", "eth.dst"],
  "Location": ["latdec.src", "latdec.dst", "longdec.src", "longdec.dst"]
};

/**
 * Configuration object for a NetWitness query.
 */
export interface QueryConfig {
  host: string;
  port: string;
  query: string;
  size: number;
  metakeys: string[];
  username?: string;
  password?: string;
  timeRange: string;
  homeLocation?: { lat: number; lng: number } | null;
  navigateUrl?: string;
}

interface SidebarProps {
  onQuery: (config: QueryConfig) => void;
  isLoading: boolean;
  onCancel: () => void;
  onClose?: () => void;
  homeLocation?: { lat: number; lng: number } | null;
  onHomeLocationChange?: (loc: { lat: number; lng: number } | null) => void;
}

const TIME_RANGES = [
  { label: "Last 1 Minute", value: "1m" },
  { label: "Last 5 Minutes", value: "5m" },
  { label: "Last 15 Minutes", value: "15m" },
  { label: "Last 30 Minutes", value: "30m" },
  { label: "Last 1 Hour", value: "1h" },
  { label: "Last 3 Hour", value: "3h" },
  { label: "Last 6 Hours", value: "6h" },
  { label: "Last 12 Hours", value: "12h" },
  { label: "Last 1 Day", value: "24h" },
  { label: "Last 3 Days", value: "72h" },
  { label: "Last 7 Days", value: "168h" },
  { label: "All Data", value: "all" },
];

/**
 * Sidebar component for configuring and executing NetWitness queries.
 */
export default function Sidebar({ onQuery, isLoading, onCancel, onClose, homeLocation, onHomeLocationChange }: SidebarProps) {
  // Initialize state from URL parameters or local storage
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const initialQuery = params.get('query') || "";
  const initialSize = params.get('size') ? Number(params.get('size')) : 10000;
  const initialTimeRange = params.get('timerange') || "5m";

  const [host, setHost] = useState(() => localStorage.getItem('nw_host') || "");
  const [port, setPort] = useState(() => localStorage.getItem('nw_port') || "");
  const [username, setUsername] = useState(() => localStorage.getItem('nw_username') || "");
  const [password, setPassword] = useState(() => sessionStorage.getItem('nw_password') || "");
  const [query, setQuery] = useState(initialQuery);
  const [size, setSize] = useState(initialSize);
  const [timeRange, setTimeRange] = useState(initialTimeRange);
  const [customMetakeys, setCustomMetakeys] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set(OPTIONAL_METAKEYS));
  
  // UI toggle states
  const [isConnectionOpen, setIsConnectionOpen] = useState(true);
  const [isQueryOpen, setIsQueryOpen] = useState(true);
  const [isMetakeysOpen, setIsMetakeysOpen] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  
  const [homeLat, setHomeLat] = useState(homeLocation?.lat?.toString() || "");
  const [homeLng, setHomeLng] = useState(homeLocation?.lng?.toString() || "");
  const [navigateUrl, setNavigateUrl] = useState(() => localStorage.getItem('nw_navigate_url') || "");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(5);

  // Sync home location prop to local state
  useEffect(() => {
    if (homeLocation) {
      setHomeLat(homeLocation.lat.toString());
      setHomeLng(homeLocation.lng.toString());
    }
  }, [homeLocation]);

  // Sync local home location state to parent and local storage
  useEffect(() => {
    if (homeLat && homeLng && !isNaN(parseFloat(homeLat)) && !isNaN(parseFloat(homeLng))) {
      const loc = { lat: parseFloat(homeLat), lng: parseFloat(homeLng) };
      localStorage.setItem('nw_home_location', JSON.stringify(loc));
      onHomeLocationChange?.(loc);
    } else if (!homeLat && !homeLng) {
      localStorage.removeItem('nw_home_location');
      onHomeLocationChange?.(null);
    }
  }, [homeLat, homeLng, onHomeLocationChange]);

  /**
   * Builds the query configuration object from current state.
   */
  const buildQueryConfig = useCallback((): QueryConfig => {
    const customKeysArray = customMetakeys
      .split(",")
      .map(k => k.trim())
      .filter(k => k.length > 0);
      
    return {
      host: host || import.meta.env.VITE_NW_HOST,
      port: port || import.meta.env.VITE_NW_PORT,
      query: query || import.meta.env.VITE_NW_QUERY || "ip.src exists",
      size,
      username: username || import.meta.env.VITE_NW_USERNAME,
      password: password || import.meta.env.VITE_NW_PASSWORD,
      timeRange,
      homeLocation,
      navigateUrl: navigateUrl || import.meta.env.VITE_NW_NAVIGATE_URL,
      metakeys: ["ip.src", "ip.dst", "size", "netname", "direction", "time", ...Array.from(selectedKeys), ...customKeysArray],
    };
  }, [host, port, query, size, username, password, timeRange, homeLocation, navigateUrl, selectedKeys, customMetakeys]);

  // Execute initial query if URL parameters are present
  useEffect(() => {
    if (params.has('query')) {
      onQuery(buildQueryConfig());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle auto-refresh logic
  useEffect(() => {
    if (!autoRefresh || refreshInterval <= 0) return;
    const intervalId = setInterval(() => {
      onQuery(buildQueryConfig());
    }, refreshInterval * 60 * 1000);
    return () => clearInterval(intervalId);
  }, [autoRefresh, refreshInterval, buildQueryConfig, onQuery]);

  const handleToggleKey = (key: string) => {
    setSelectedKeys(prev => {
      const newKeys = new Set(prev);
      if (newKeys.has(key)) newKeys.delete(key);
      else newKeys.add(key);
      return newKeys;
    });
  };

  const handleToggleCategory = (category: string) => {
    const keys = METAKEY_CATEGORIES[category];
    setSelectedKeys(prev => {
      const newKeys = new Set(prev);
      const allSelected = keys.every(k => newKeys.has(k));
      keys.forEach(k => allSelected ? newKeys.delete(k) : newKeys.add(k));
      return newKeys;
    });
  };

  const handleSelectAll = () => {
    setSelectedKeys(new Set(OPTIONAL_METAKEYS));
  };

  const handleSelectNone = () => {
    setSelectedKeys(new Set());
  };

  const toggleCategoryExpand = (category: string) => {
    setExpandedCategories(prev => ({ ...prev, [category]: !prev[category] }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Persist connection settings
    localStorage.setItem('nw_host', host);
    localStorage.setItem('nw_port', port);
    localStorage.setItem('nw_username', username);
    sessionStorage.setItem('nw_password', password);
    localStorage.setItem('nw_navigate_url', navigateUrl);

    onQuery(buildQueryConfig());
  };

  return (
    <div className="w-80 max-w-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col h-full overflow-hidden shadow-xl z-10 transition-colors duration-200">
      <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex items-center gap-2 transition-colors duration-200">
        <Logo className="w-6 h-6" />
        <h1 className="font-semibold text-gray-800 dark:text-gray-100 flex-1">NetWitness Visualizer</h1>
        {onClose && (
          <button
            onClick={onClose}
            className="md:hidden p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Connection Settings */}
        <div className="space-y-3">
          <div 
            className="flex items-center justify-between text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer hover:text-gray-900 dark:hover:text-gray-100"
            onClick={() => setIsConnectionOpen(!isConnectionOpen)}
          >
            <div className="flex items-center gap-2">
              <Server size={16} />
              <h2>Connection</h2>
            </div>
            {isConnectionOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </div>

          {isConnectionOpen && (
            <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 space-y-1">
                  <label className="text-xs text-gray-500 dark:text-gray-400">Host / IP</label>
                  <input
                    type="text"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder={import.meta.env.VITE_NW_HOST}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#BE3B37] dark:focus:ring-[#BE3B37] transition-colors duration-200"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-500 dark:text-gray-400">Port</label>
                  <input
                    type="text"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    placeholder={import.meta.env.VITE_NW_PORT}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#BE3B37] dark:focus:ring-[#BE3B37] transition-colors duration-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs text-gray-500 dark:text-gray-400">Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={import.meta.env.VITE_NW_USERNAME}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#BE3B37] dark:focus:ring-[#BE3B37] transition-colors duration-200"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-500 dark:text-gray-400">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={import.meta.env.VITE_NW_PASSWORD ? "••••••••" : ""}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#BE3B37] dark:focus:ring-[#BE3B37] transition-colors duration-200"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Query Settings */}
        <div className="space-y-3">
          <div 
            className="flex items-center justify-between text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer hover:text-gray-900 dark:hover:text-gray-100"
            onClick={() => setIsQueryOpen(!isQueryOpen)}
          >
            <div className="flex items-center gap-2">
              <Filter size={16} />
              <h2>Query Parameters</h2>
            </div>
            {isQueryOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </div>

          {isQueryOpen && (
            <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="space-y-1">
                <label className="text-xs text-gray-500 dark:text-gray-400">Where Condition</label>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={import.meta.env.VITE_NW_QUERY || "e.g. ip.src=10.10.10.50"}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md text-sm font-mono text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#BE3B37] dark:focus:ring-[#BE3B37] transition-colors duration-200"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-500 dark:text-gray-400">Time Range</label>
                <select
                  value={timeRange}
                  onChange={(e) => setTimeRange(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#BE3B37] dark:focus:ring-[#BE3B37] transition-colors duration-200"
                >
                  {TIME_RANGES.map((tr) => (
                    <option key={tr.value} value={tr.value}>
                      {tr.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-500 dark:text-gray-400">Max Results (Size)</label>
                <input
                  type="number"
                  value={size}
                  onChange={(e) => {
                    let val = Number(e.target.value);
                    if (val > 4000000000) val = 4000000000;
                    if (val < 0) val = 0;
                    setSize(val);
                  }}
                  min={0}
                  max={4000000000}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#BE3B37] dark:focus:ring-[#BE3B37] transition-colors duration-200"
                  required
                />
              </div>
              
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <MapPin size={12} className="text-gray-500 dark:text-gray-400" />
                  <label className="text-xs text-gray-500 dark:text-gray-400">Default Home Location (Optional)</label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    step="any"
                    value={homeLat}
                    onChange={(e) => setHomeLat(e.target.value)}
                    placeholder={import.meta.env.VITE_NW_HOME_LAT || "Latitude"}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md text-xs text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#BE3B37] dark:focus:ring-[#BE3B37] transition-colors duration-200"
                  />
                  <input
                    type="number"
                    step="any"
                    value={homeLng}
                    onChange={(e) => setHomeLng(e.target.value)}
                    placeholder={import.meta.env.VITE_NW_HOME_LNG || "Longitude"}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md text-xs text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#BE3B37] dark:focus:ring-[#BE3B37] transition-colors duration-200"
                  />
                </div>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                  Tip: can be set by using <span className="font-semibold">Shift + Right Click</span> on the Globe View.
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-500 dark:text-gray-400">Navigate Base URL</label>
                <input
                  type="text"
                  value={navigateUrl}
                  onChange={(e) => setNavigateUrl(e.target.value)}
                  placeholder={import.meta.env.VITE_NW_NAVIGATE_URL || "https://192.168.1.111/investigation/26/navigate/"}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md text-xs text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#BE3B37] dark:focus:ring-[#BE3B37] transition-colors duration-200"
                />
              </div>

              <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-800">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={autoRefresh}
                      onChange={(e) => setAutoRefresh(e.target.checked)}
                      className="rounded text-[#BE3B37] dark:text-[#BE3B37] focus:ring-[#BE3B37] dark:focus:ring-[#BE3B37] bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700"
                    />
                    Auto-refresh query
                  </label>
                </div>
                {autoRefresh && (
                  <div className="flex items-center gap-2 pl-6">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Every</span>
                    <input
                      type="number"
                      value={refreshInterval}
                      onChange={(e) => setRefreshInterval(Number(e.target.value))}
                      min={1}
                      max={60}
                      className="w-16 px-2 py-1 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md text-xs text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-[#BE3B37] dark:focus:ring-[#BE3B37]"
                    />
                    <span className="text-xs text-gray-500 dark:text-gray-400">minutes</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Metakeys Selection */}
        <div className="space-y-3">
          <div 
            className="flex items-center justify-between text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer hover:text-gray-900 dark:hover:text-gray-100"
            onClick={() => setIsMetakeysOpen(!isMetakeysOpen)}
          >
            <div className="flex items-center gap-2">
              <Settings size={16} />
              <h2>Metakeys (Select)</h2>
            </div>
            {isMetakeysOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </div>

          {isMetakeysOpen && (
            <div className="space-y-2 pr-1 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">Mandatory Keys</span>
                <div className="flex gap-2">
                  <button type="button" onClick={handleSelectAll} className="text-[10px] text-[#BE3B37] dark:text-[#BE3B37] hover:underline">Select All</button>
                  <button type="button" onClick={handleSelectNone} className="text-[10px] text-[#BE3B37] dark:text-[#BE3B37] hover:underline">Select None</button>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-2 mb-4">
                {["ip.src", "ip.dst", "size", "netname", "direction", "time"].map(key => (
                  <div key={key} className="flex items-center gap-2 p-1.5 bg-gray-100 dark:bg-gray-900 rounded-md border border-gray-200 dark:border-gray-800 opacity-70 transition-colors duration-200">
                    <input
                      type="checkbox"
                      checked
                      disabled
                      className="rounded text-[#BE3B37] dark:text-[#BE3B37] bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700"
                    />
                    <span className="text-xs font-mono text-gray-700 dark:text-gray-400 truncate">{key}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-3 mt-2">
                {Object.entries(METAKEY_CATEGORIES).map(([category, keys]) => {
                  const selectedCount = keys.filter(k => selectedKeys.has(k)).length;
                  const allSelected = selectedCount === keys.length;
                  const isExpanded = expandedCategories[category];
                  
                  return (
                    <div key={category} className="border border-gray-200 dark:border-gray-800 rounded-md overflow-hidden">
                      <div 
                        className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-900/50 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        onClick={() => toggleCategoryExpand(category)}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            ref={input => {
                              if (input) {
                                input.indeterminate = selectedCount > 0 && selectedCount < keys.length;
                              }
                            }}
                            onChange={(e) => {
                              e.stopPropagation();
                              handleToggleCategory(category);
                            }}
                            className="rounded text-[#BE3B37] dark:text-[#BE3B37] focus:ring-[#BE3B37] dark:focus:ring-[#BE3B37] bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700"
                          />
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{category}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                            {selectedCount}/{keys.length}
                          </span>
                          {isExpanded ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-500" />}
                        </div>
                      </div>
                      
                      {isExpanded && (
                        <div className="grid grid-cols-2 gap-1 p-2 bg-white dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800">
                          {keys.map((key) => (
                            <label
                              key={key}
                              className="flex items-center gap-2 p-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md cursor-pointer transition-colors duration-200"
                            >
                              <input
                                type="checkbox"
                                checked={selectedKeys.has(key)}
                                onChange={() => handleToggleKey(key)}
                                className="rounded text-[#BE3B37] dark:text-[#BE3B37] focus:ring-[#BE3B37] dark:focus:ring-[#BE3B37] bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700"
                              />
                              <span
                                className="text-xs font-mono text-gray-700 dark:text-gray-300 truncate"
                                title={key}
                              >
                                {key}
                              </span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              
              <div className="mt-4 space-y-1">
                <label className="text-xs text-gray-500 dark:text-gray-400">Custom Metakeys (comma separated)</label>
                <input
                  type="text"
                  value={customMetakeys}
                  onChange={(e) => setCustomMetakeys(e.target.value)}
                  placeholder="e.g. user.dst, eth.type"
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md text-sm font-mono text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#BE3B37] dark:focus:ring-[#BE3B37] transition-colors duration-200"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 transition-colors duration-200 flex gap-2">
          <button
            type="submit"
            disabled={isLoading}
            className="flex-1 flex items-center justify-center gap-2 bg-[#B63830] hover:bg-[#9a2f28] disabled:bg-[#B63830]/50 disabled:text-white/70 text-white py-2.5 px-4 rounded-lg font-medium transition-colors shadow-sm"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Play size={18} />
            )}
            {isLoading ? "Querying..." : "Run Query"}
          </button>
          {isLoading && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                onCancel();
              }}
              className="px-4 py-2.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 rounded-lg font-medium transition-colors border border-red-200 dark:border-red-800"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
