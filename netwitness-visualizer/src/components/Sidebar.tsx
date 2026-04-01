/**
 * Sidebar.tsx
 * 
 * This component provides the main configuration and query interface for the application.
 * It allows users to specify NetWitness connection details, query parameters,
 * time ranges, and select specific metakeys for data retrieval.
 * Key features include:
 * - Form for NetWitness SDK query configuration.
 * - Categorized metakey selection with bulk actions.
 * - Persistence of configuration settings in local storage.
 * - Auto-refresh functionality for continuous monitoring.
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Play, Settings, Server, Filter, ChevronDown, ChevronRight, MapPin, Sliders } from "lucide-react";
import { Logo } from "./Logo";

// --- Types & Configurations ---

export interface MetakeyConfig {
  key: string;
  defaultEnabled: boolean;
}

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
  onAlertsQuery?: (config: { host: string; port: string; username: string; password?: string }) => void;
  isLoading: boolean;
  onCancel: () => void;
  onClose?: () => void;
  homeLocation?: { lat: number; lng: number } | null;
  onHomeLocationChange?: (loc: { lat: number; lng: number } | null) => void;
  viewMode?: string;
}

// --- Constants ---

const MANDATORY_METAKEYS = [
  "ip.src", "ip.dst", "size", "netname", "direction", "time",
  "latdec.src", "latdec.dst", "longdec.src", "longdec.dst"
];

const METAKEY_CATEGORIES: Record<string, MetakeyConfig[]> = {
  "Network": [
    { key: "service", defaultEnabled: true },
    { key: "tcp.dstport", defaultEnabled: true },
    { key: "udp.dstport", defaultEnabled: true },
    { key: "eth.src", defaultEnabled: false },
    { key: "eth.dst", defaultEnabled: false }
  ],
  "Web & Activity": [
    { key: "domain", defaultEnabled: true },
    { key: "alias.host", defaultEnabled: true },
    { key: "tld", defaultEnabled: true },
    { key: "referer", defaultEnabled: false },
    { key: "action", defaultEnabled: false },
    { key: "error", defaultEnabled: false }
  ],
  "User & Identity": [
    { key: "client", defaultEnabled: true },
    { key: "server", defaultEnabled: true },
    { key: "user.all", defaultEnabled: false },
    { key: "email.all", defaultEnabled: false }
  ],
  "Geo/Org": [
    { key: "country", defaultEnabled: true },
    { key: "org", defaultEnabled: false }
  ],
  "Threat Intel": [
    { key: "ioc", defaultEnabled: true },
    { key: "boc", defaultEnabled: true },
    { key: "eoc", defaultEnabled: true },
    { key: "feed.name", defaultEnabled: false }
  ],
  "Files": [
    { key: "filename.all", defaultEnabled: false },
    { key: "filetype", defaultEnabled: false },
    { key: "extension", defaultEnabled: false }
  ],
  "Encryption": [
    { key: "ssl.ca", defaultEnabled: false },
    { key: "ssl.subject", defaultEnabled: true },
    { key: "ja3", defaultEnabled: false },
    { key: "ja3s", defaultEnabled: false },
    { key: "ja4", defaultEnabled: false },
    { key: "crypto", defaultEnabled: false }
  ],
  "Analysis": [
    { key: "analysis.session", defaultEnabled: false },
    { key: "analysis.service", defaultEnabled: false },
    { key: "analysis.file", defaultEnabled: false }
  ]
};

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

// --- Utilities ---

/**
 * Safe wrapper for Web Storage API to prevent crashes in restricted environments (e.g., incognito)
 */
const storage = {
  get: (type: 'local' | 'session', key: string): string => {
    try { return (type === 'local' ? window.localStorage : window.sessionStorage).getItem(key) || ""; } 
    catch { return ""; }
  },
  set: (type: 'local' | 'session', key: string, value: string): void => {
    try { (type === 'local' ? window.localStorage : window.sessionStorage).setItem(key, value); } 
    catch { console.warn(`Failed to save ${key} to storage.`); }
  },
  remove: (type: 'local' | 'session', key: string): void => {
    try { (type === 'local' ? window.localStorage : window.sessionStorage).removeItem(key); } 
    catch {}
  }
};

const getInitialSelectedKeys = (): Set<string> => {
  const keys = new Set<string>();
  Object.values(METAKEY_CATEGORIES).flat().forEach(mk => {
    if (mk.defaultEnabled) keys.add(mk.key);
  });
  return keys;
};

// --- Sub-components ---

interface AccordionSectionProps {
  title: string;
  icon: React.ElementType;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

const AccordionSection: React.FC<AccordionSectionProps> = ({ title, icon: Icon, isOpen, onToggle, children }) => (
  <div className="space-y-3">
    <div 
      className="flex items-center justify-between text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
      onClick={onToggle}
    >
      <div className="flex items-center gap-2">
        <Icon size={16} />
        <h2>{title}</h2>
      </div>
      {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
    </div>
    {isOpen && (
      <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
        {children}
      </div>
    )}
  </div>
);

// --- Main Component ---

export default function Sidebar({ onQuery, onAlertsQuery, isLoading, onCancel, onClose, homeLocation, onHomeLocationChange, viewMode }: SidebarProps) {
  // Setup params
  const params = useMemo(() => typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams(), []);
  
  // State Initialization
  const [host, setHost] = useState(() => storage.get('local', 'nw_host'));
  const [port, setPort] = useState(() => storage.get('local', 'nw_port'));
  const [username, setUsername] = useState(() => storage.get('local', 'nw_username'));
  const [password, setPassword] = useState(""); // Password is only kept in memory for security
  
  // Alerts State Initialization
  // Initialize from local storage, fallback to .env variables
  const [alertsHost, setAlertsHost] = useState(() => storage.get('local', 'nw_alerts_host') || import.meta.env.VITE_NW_ALERTS_HOST || "");
  const [alertsPort, setAlertsPort] = useState(() => storage.get('local', 'nw_alerts_port') || import.meta.env.VITE_NW_ALERTS_PORT || "");
  const [alertsUsername, setAlertsUsername] = useState(() => storage.get('local', 'nw_alerts_username') || import.meta.env.VITE_NW_ALERTS_USERNAME || "");
  const [alertsPassword, setAlertsPassword] = useState(""); // Password is only kept in memory for security

  const [query, setQuery] = useState(() => params.get('query') || "");
  const [size, setSize] = useState(() => params.get('size') ? Number(params.get('size')) : 100000);
  const [timeRange, setTimeRange] = useState(() => params.get('timerange') || "5m");
  const [customMetakeys, setCustomMetakeys] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(getInitialSelectedKeys());
  
  // UI Toggles
  const [sections, setSections] = useState({ connection: true, query: true, other: true, metakeys: true });
  const [isMandatoryKeysOpen, setIsMandatoryKeysOpen] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  
  // Advanced Config State
  const [homeLat, setHomeLat] = useState(homeLocation?.lat?.toString() || "");
  const [homeLng, setHomeLng] = useState(homeLocation?.lng?.toString() || "");
  const [navigateUrl, setNavigateUrl] = useState(() => storage.get('local', 'nw_navigate_url'));
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(5);

  const toggleSection = (section: keyof typeof sections) => {
    setSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Sync home location props
  useEffect(() => {
    if (homeLocation) {
      setHomeLat(homeLocation.lat.toString());
      setHomeLng(homeLocation.lng.toString());
    }
  }, [homeLocation]);

  useEffect(() => {
    const lat = parseFloat(homeLat);
    const lng = parseFloat(homeLng);
    
    if (homeLat && homeLng && !isNaN(lat) && !isNaN(lng)) {
      const loc = { lat, lng };
      storage.set('local', 'nw_home_location', JSON.stringify(loc));
      onHomeLocationChange?.(loc);
    } else if (!homeLat && !homeLng) {
      storage.remove('local', 'nw_home_location');
      onHomeLocationChange?.(null);
    }
  }, [homeLat, homeLng, onHomeLocationChange]);

  // Query Builder
  const buildQueryConfig = useCallback((): QueryConfig => {
    const customKeysArray = customMetakeys
      .split(",")
      .map(k => k.trim())
      .filter(Boolean);
      
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
      metakeys: [...MANDATORY_METAKEYS, ...Array.from(selectedKeys), ...customKeysArray],
    };
  }, [host, port, query, size, username, password, timeRange, homeLocation, navigateUrl, selectedKeys, customMetakeys]);

  // Initial URL Query Trigger
  useEffect(() => {
    if (params.has('query')) {
      onQuery(buildQueryConfig());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once

  // Auto Refresh
  useEffect(() => {
    if (!autoRefresh || refreshInterval <= 0) return;
    const intervalId = setInterval(() => {
      onQuery(buildQueryConfig());
    }, refreshInterval * 60 * 1000);
    return () => clearInterval(intervalId);
  }, [autoRefresh, refreshInterval, buildQueryConfig, onQuery]);

  // Metakey Handlers
  const handleToggleKey = useCallback((key: string) => {
    setSelectedKeys(prev => {
      const newKeys = new Set(prev);
      newKeys.has(key) ? newKeys.delete(key) : newKeys.add(key);
      return newKeys;
    });
  }, []);

  const handleToggleCategory = useCallback((category: string) => {
    const categoryKeys = METAKEY_CATEGORIES[category].map(mk => mk.key);
    setSelectedKeys(prev => {
      const newKeys = new Set(prev);
      const allSelected = categoryKeys.every(k => newKeys.has(k));
      categoryKeys.forEach(k => allSelected ? newKeys.delete(k) : newKeys.add(k));
      return newKeys;
    });
  }, []);

  const handleMetakeyBulkAction = useCallback((action: 'all' | 'none') => {
    if (action === 'all') {
      const allKeys = Object.values(METAKEY_CATEGORIES).flat().map(mk => mk.key);
      setSelectedKeys(new Set(allKeys));
    } else {
      setSelectedKeys(new Set());
    }
  }, []);

  const toggleCategoryExpand = useCallback((category: string) => {
    setExpandedCategories(prev => ({ ...prev, [category]: !prev[category] }));
  }, []);

  // Form Submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (viewMode === 'alerts-incidents') {
      storage.set('local', 'nw_alerts_host', alertsHost);
      storage.set('local', 'nw_alerts_port', alertsPort);
      storage.set('local', 'nw_alerts_username', alertsUsername);
      if (onAlertsQuery) {
        onAlertsQuery({ host: alertsHost, port: alertsPort, username: alertsUsername, password: alertsPassword });
      }
    } else {
      storage.set('local', 'nw_host', host);
      storage.set('local', 'nw_port', port);
      storage.set('local', 'nw_username', username);
      // Password is intentionally NOT saved to storage for security reasons
      storage.set('local', 'nw_navigate_url', navigateUrl);
      
      onQuery(buildQueryConfig());
    }
  };

  return (
    <div className="w-80 max-w-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col h-full overflow-hidden shadow-xl z-10 transition-colors duration-200">
      <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex items-center gap-2 transition-colors duration-200">
        <Logo className="w-6 h-6" />
        <h1 className="font-semibold text-gray-800 dark:text-gray-100 flex-1">NetWitness Visualizer</h1>
        {onClose && (
          <button onClick={onClose} className="md:hidden p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          
          <AccordionSection title={(viewMode === 'alerts-incidents') ? "Alerts/Incidents Connection" : "Connection"} icon={Server} isOpen={sections.connection} onToggle={() => toggleSection('connection')}>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-1">
                <label className="text-xs text-gray-500 dark:text-gray-400">Host / IP</label>
                <input type="text" value={(viewMode === 'alerts-incidents') ? alertsHost : host} onChange={(e) => (viewMode === 'alerts-incidents') ? setAlertsHost(e.target.value) : setHost(e.target.value)} placeholder={(viewMode === 'alerts-incidents') ? import.meta.env.VITE_NW_ALERTS_HOST || import.meta.env.VITE_NW_HOST : import.meta.env.VITE_NW_HOST} className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#BE3B37] transition-colors" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500 dark:text-gray-400">Port</label>
                <input type="text" value={(viewMode === 'alerts-incidents') ? alertsPort : port} onChange={(e) => (viewMode === 'alerts-incidents') ? setAlertsPort(e.target.value) : setPort(e.target.value)} placeholder={(viewMode === 'alerts-incidents') ? import.meta.env.VITE_NW_ALERTS_PORT || import.meta.env.VITE_NW_PORT : import.meta.env.VITE_NW_PORT} className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#BE3B37] transition-colors" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-gray-500 dark:text-gray-400">Username</label>
                <input type="text" value={(viewMode === 'alerts-incidents') ? alertsUsername : username} onChange={(e) => (viewMode === 'alerts-incidents') ? setAlertsUsername(e.target.value) : setUsername(e.target.value)} placeholder={(viewMode === 'alerts-incidents') ? import.meta.env.VITE_NW_ALERTS_USERNAME || import.meta.env.VITE_NW_USERNAME : import.meta.env.VITE_NW_USERNAME} className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#BE3B37] transition-colors" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500 dark:text-gray-400">Password</label>
                <input type="password" value={(viewMode === 'alerts-incidents') ? alertsPassword : password} onChange={(e) => (viewMode === 'alerts-incidents') ? setAlertsPassword(e.target.value) : setPassword(e.target.value)} placeholder={(viewMode === 'alerts-incidents') ? (import.meta.env.VITE_NW_ALERTS_PASSWORD || import.meta.env.VITE_NW_PASSWORD ? "••••••••" : "") : (import.meta.env.VITE_NW_PASSWORD ? "••••••••" : "")} className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#BE3B37] transition-colors" />
              </div>
            </div>
          </AccordionSection>

          {viewMode !== 'alerts-incidents' && (
            <>
              <AccordionSection title="Query Parameters" icon={Filter} isOpen={sections.query} onToggle={() => toggleSection('query')}>
            <div className="space-y-1">
              <label className="text-xs text-gray-500 dark:text-gray-400">Where Condition</label>
              <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={import.meta.env.VITE_NW_QUERY || "e.g. ip.src=10.10.10.50"} className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md text-sm font-mono text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#BE3B37] transition-colors" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500 dark:text-gray-400">Time Range</label>
              <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)} className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#BE3B37] transition-colors">
                {TIME_RANGES.map((tr) => (<option key={tr.value} value={tr.value}>{tr.label}</option>))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500 dark:text-gray-400">Max Results (Size)</label>
              <input type="number" value={size} onChange={(e) => setSize(Math.max(0, Math.min(4000000000, Number(e.target.value) || 0)))} min={0} max={4000000000} className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#BE3B37] transition-colors" required />
            </div>
            <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="rounded text-[#BE3B37] bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 focus:ring-[#BE3B37]" />
                  Auto-refresh query
                </label>
              </div>
              {autoRefresh && (
                <div className="flex items-center gap-2 pl-6">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Every</span>
                  <input type="number" value={refreshInterval} onChange={(e) => setRefreshInterval(Math.max(1, Number(e.target.value)))} min={1} max={60} className="w-16 px-2 py-1 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md text-xs text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-[#BE3B37]" />
                  <span className="text-xs text-gray-500 dark:text-gray-400">minutes</span>
                </div>
              )}
            </div>
          </AccordionSection>

          <AccordionSection title="Other Configurations" icon={Sliders} isOpen={sections.other} onToggle={() => toggleSection('other')}>
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <MapPin size={12} className="text-gray-500 dark:text-gray-400" />
                <label className="text-xs text-gray-500 dark:text-gray-400">Default Home Location (Optional)</label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" step="any" value={homeLat} onChange={(e) => setHomeLat(e.target.value)} placeholder={import.meta.env.VITE_NW_HOME_LAT || "Latitude"} className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md text-xs text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#BE3B37] transition-colors" />
                <input type="number" step="any" value={homeLng} onChange={(e) => setHomeLng(e.target.value)} placeholder={import.meta.env.VITE_NW_HOME_LNG || "Longitude"} className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md text-xs text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#BE3B37] transition-colors" />
              </div>
              <p className="text-[10px] text-gray-400 mt-1">
                Tip: can be set by using <span className="font-semibold">Shift + Right Click</span> on the Globe View.
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500 dark:text-gray-400">Navigate Base URL</label>
              <input type="text" value={navigateUrl} onChange={(e) => setNavigateUrl(e.target.value)} placeholder={import.meta.env.VITE_NW_NAVIGATE_URL || "https://192.168.1.111/investigation/26/navigate/"} className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md text-xs text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#BE3B37] transition-colors" />
            </div>
          </AccordionSection>

          <AccordionSection title="Metakeys (Select)" icon={Settings} isOpen={sections.metakeys} onToggle={() => toggleSection('metakeys')}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 transition-colors" onClick={() => setIsMandatoryKeysOpen(!isMandatoryKeysOpen)}>
                <span className="text-xs text-gray-500 dark:text-gray-400 select-none">Mandatory Keys</span>
                {isMandatoryKeysOpen ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => handleMetakeyBulkAction('all')} className="text-[10px] text-[#BE3B37] hover:underline">Select All</button>
                <button type="button" onClick={() => handleMetakeyBulkAction('none')} className="text-[10px] text-[#BE3B37] hover:underline">Select None</button>
              </div>
            </div>
            
            {isMandatoryKeysOpen && (
              <div className="grid grid-cols-2 gap-2 mb-4 animate-in fade-in slide-in-from-top-1 duration-200">
                {MANDATORY_METAKEYS.map(key => (
                  <div key={key} className="flex items-center gap-2 p-1.5 bg-gray-100 dark:bg-gray-900 rounded-md border border-gray-200 dark:border-gray-800 opacity-70">
                    <input type="checkbox" checked disabled className="rounded text-[#BE3B37] bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700" />
                    <span className="text-xs font-mono text-gray-700 dark:text-gray-400 truncate" title={key}>{key}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3 mt-2">
              {Object.entries(METAKEY_CATEGORIES).map(([category, keys]) => {
                const selectedCount = keys.filter(mk => selectedKeys.has(mk.key)).length;
                const isExpanded = expandedCategories[category];
                
                return (
                  <div key={category} className="border border-gray-200 dark:border-gray-800 rounded-md overflow-hidden">
                    <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-900/50 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" onClick={() => toggleCategoryExpand(category)}>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedCount === keys.length}
                          ref={input => { if (input) input.indeterminate = selectedCount > 0 && selectedCount < keys.length; }}
                          onChange={(e) => { e.stopPropagation(); handleToggleCategory(category); }}
                          className="rounded text-[#BE3B37] focus:ring-[#BE3B37] bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700"
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
                        {keys.map((mk) => (
                          <label key={mk.key} className="flex items-center gap-2 p-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md cursor-pointer transition-colors duration-200">
                            <input type="checkbox" checked={selectedKeys.has(mk.key)} onChange={() => handleToggleKey(mk.key)} className="rounded text-[#BE3B37] focus:ring-[#BE3B37] bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700" />
                            <span className="text-xs font-mono text-gray-700 dark:text-gray-300 truncate" title={mk.key}>{mk.key}</span>
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
              <input type="text" value={customMetakeys} onChange={(e) => setCustomMetakeys(e.target.value)} placeholder="e.g. user.dst, eth.type" className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md text-sm font-mono text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#BE3B37] transition-colors" />
            </div>
          </AccordionSection>
            </>
          )}

        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 transition-colors duration-200 flex gap-2">
          <button type="submit" disabled={isLoading} className="flex-1 flex items-center justify-center gap-2 bg-[#B63830] hover:bg-[#9a2f28] disabled:bg-[#B63830]/50 disabled:text-white/70 text-white py-2.5 px-4 rounded-lg font-medium transition-colors shadow-sm">
            {isLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Play size={18} />}
            {isLoading ? "Querying..." : "Run Query"}
          </button>
          {isLoading && (
            <button type="button" onClick={(e) => { e.preventDefault(); onCancel(); }} className="px-4 py-2.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 rounded-lg font-medium transition-colors border border-red-200 dark:border-red-800">
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
}