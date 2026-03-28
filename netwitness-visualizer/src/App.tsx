/**
 * App.tsx
 * 
 * This is the main entry point for the React application. It manages the global state,
 * including view modes (Graph, Globe, News), theme (Dark/Light), and home location.
 * It coordinates data fetching via the useNetWitnessQuery hook and data processing
 * via the processData utility.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import Sidebar from "./components/Sidebar";
import NetworkGraph from "./components/NetworkGraph";
import GlobeView from "./components/GlobeView";
import ThreatNews from "./components/ThreatNews";
import AssetsView from "./components/AssetsView";
import AlertsDashboard from "./components/AlertsDashboard";
import CustomDashboard from "./components/CustomDashboard";
import { ErrorBoundary } from "./components/ErrorBoundary";
import DetailsPanel from "./components/DetailsPanel";
import { Node, Link } from "./types";
import { AlertCircle, Settings, Moon, Sun, Globe, Network, Newspaper, Server, ShieldAlert, LayoutDashboard } from "lucide-react";
import { processData } from "./lib/dataProcessor";
import { useNetWitnessQuery } from "./hooks/useNetWitnessQuery";

// --- TYPES ---

export interface Coordinates {
  lat: number;
  lng: number;
}

type ViewMode = 'graph' | 'globe' | 'news' | 'assets' | 'alerts' | 'dashboard';

// --- CONSTANTS & CONFIG ---

const ENV_LAT = import.meta.env.VITE_NW_HOME_LAT;
const ENV_LNG = import.meta.env.VITE_NW_HOME_LNG;
const ENABLE_GRAPH = import.meta.env.VITE_ENABLE_GRAPH !== 'false';
const ENABLE_GLOBE = import.meta.env.VITE_ENABLE_GLOBE !== 'false';
const ENABLE_NEWS = import.meta.env.VITE_ENABLE_NEWS !== 'false';
const ENABLE_ASSETS = import.meta.env.VITE_ENABLE_ASSETS !== 'false';
const ENABLE_ALERTS = import.meta.env.VITE_ENABLE_ALERTS !== 'false';
const ENABLE_DASHBOARD = import.meta.env.VITE_ENABLE_DASHBOARD !== 'false';
const FALLBACK_NAVIGATE_URL = import.meta.env.VITE_NW_NAVIGATE_URL;

const VIEW_MODES = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard', enabled: ENABLE_DASHBOARD },
  { id: 'alerts', icon: ShieldAlert, label: 'Alerts', enabled: ENABLE_ALERTS },
  { id: 'assets', icon: Server, label: 'Assets', enabled: ENABLE_ASSETS },
  { id: 'graph', icon: Network, label: 'Graph', enabled: ENABLE_GRAPH },
  { id: 'globe', icon: Globe, label: 'Globe', enabled: ENABLE_GLOBE },
  { id: 'news', icon: Newspaper, label: 'News', enabled: ENABLE_NEWS },
] as const;

// --- INITIALIZATION HELPERS ---

const getDefaultViewMode = (): ViewMode => {
  try {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const view = params.get('view');
      if (view === 'dashboard' && ENABLE_DASHBOARD) return 'dashboard';
      if (view === 'alerts' && ENABLE_ALERTS) return 'alerts';
      if (view === 'assets' && ENABLE_ASSETS) return 'assets';
      if (view === 'graph' && ENABLE_GRAPH) return 'graph';
      if (view === 'globe' && ENABLE_GLOBE) return 'globe';
      if (view === 'news' && ENABLE_NEWS) return 'news';
    }
  } catch {
    // Ignore URL parsing errors, fallback to defaults
  }
  
  if (ENABLE_DASHBOARD) return 'dashboard';
  if (ENABLE_ALERTS) return 'alerts';
  if (ENABLE_ASSETS) return 'assets';
  if (ENABLE_GRAPH) return 'graph';
  if (ENABLE_GLOBE) return 'globe';
  if (ENABLE_NEWS) return 'news';
  return 'dashboard';
};

const getDefaultHomeLocation = (): Coordinates | null => {
  try {
    const stored = localStorage.getItem('nw_home_location');
    if (stored) return JSON.parse(stored);
  } catch {
    // Fallback to env vars on parse failure
  }
  
  if (ENV_LAT && ENV_LNG) {
    return { lat: parseFloat(ENV_LAT), lng: parseFloat(ENV_LNG) };
  }
  return null;
};

/**
 * Main Application Component
 */
export default function App() {
  // UI state
  const [selectedItem, setSelectedItem] = useState<Node | Link | null>(null);
  const [displayedAttributes, setDisplayedAttributes] = useState<string[]>(['service']);
  
  // Theme and layout state
  const [isDark, setIsDark] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>(getDefaultViewMode);
  const [homeLocation, setHomeLocation] = useState<Coordinates | null>(getDefaultHomeLocation);
  const [alertsConfig, setAlertsConfig] = useState<{host: string, port: string, username: string, password?: string, trigger: number} | null>(() => {
    const host = typeof window !== 'undefined' ? window.localStorage.getItem('nw_alerts_host') : null;
    const port = typeof window !== 'undefined' ? window.localStorage.getItem('nw_alerts_port') : null;
    const username = typeof window !== 'undefined' ? window.localStorage.getItem('nw_alerts_username') : null;
    
    // Use env vars as fallback if local storage is empty
    const finalHost = host || import.meta.env.VITE_NW_ALERTS_HOST || '';
    const finalPort = port || import.meta.env.VITE_NW_ALERTS_PORT || '';
    const finalUsername = username || import.meta.env.VITE_NW_ALERTS_USERNAME || '';
    
    if (finalHost && finalUsername) {
      // trigger is 0 initially so it doesn't auto-query on load
      return { host: finalHost, port: finalPort, username: finalUsername, password: '', trigger: 0 };
    }
    return null;
  });

  // Custom hook to manage data fetching and state
  const handleQueryReset = useCallback(() => {
    setSelectedItem(null);
    setDisplayedAttributes(['service']);
  }, []);

  const {
    rawData,
    isLoading,
    error,
    queriedAttributes,
    navigateUrl,
    latestConfig,
    handleQuery,
    handleCancel,
    setError
  } = useNetWitnessQuery(handleQueryReset);

  // Apply dark mode class
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  // Process raw data into graph format
  const graphData = useMemo(() => {
    if (!rawData) return { nodes: [], links: [] };
    return processData(rawData, homeLocation);
  }, [homeLocation, rawData]);

  /**
   * Handles selection of a specific attribute (e.g., a country or organization).
   */
  const handleAttributeSelect = useCallback((attrType: string, attrValue: string) => {
    // Normalizes attributes like 'country.src' to 'country'
    const normalizedAttrType = attrType.replace(/\.(src|dst)$/, '');

    setDisplayedAttributes(prev => 
      prev.includes(normalizedAttrType) ? prev : [...prev, normalizedAttrType]
    );
    
    setSelectedItem({
      id: `attr-${normalizedAttrType}-${attrValue}`,
      type: "attribute",
      attrType: normalizedAttrType,
      attrValue: attrValue,
    });
  }, []);

  const handleSetHomeLocation = useCallback((loc: Coordinates) => {
    setHomeLocation(loc);
    localStorage.setItem('nw_home_location', JSON.stringify(loc));
  }, []);

  // --- REUSABLE UI ELEMENTS ---

  // Pre-construct the details panel to avoid JSX duplication
  const detailsPanelElement = selectedItem && viewMode !== 'news' && viewMode !== 'assets' && viewMode !== 'alerts' && viewMode !== 'dashboard' ? (
    <DetailsPanel
      selectedItem={selectedItem}
      onClose={() => setSelectedItem(null)}
      graphData={graphData}
      onNodeSelect={setSelectedItem}
      onAttributeSelect={handleAttributeSelect}
      navigateUrl={navigateUrl || FALLBACK_NAVIGATE_URL}
      viewMode={viewMode}
    />
  ) : null;

  return (
    <div className={`flex h-screen w-full bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-300 font-sans overflow-hidden transition-colors duration-200 ${isDark ? 'dark' : ''}`}>
      
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 dark:bg-black/40 z-30 md:hidden backdrop-blur-sm"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      {isSidebarOpen && viewMode !== 'news' && (
        <div className="absolute inset-y-0 left-0 z-40 md:relative shadow-2xl md:shadow-none">
          <Sidebar 
            onQuery={handleQuery} 
            onAlertsQuery={(config) => setAlertsConfig({ ...config, trigger: Date.now() })}
            isLoading={isLoading} 
            onCancel={handleCancel} 
            onClose={() => setIsSidebarOpen(false)} 
            homeLocation={homeLocation}
            onHomeLocationChange={setHomeLocation}
            viewMode={viewMode}
          />
        </div>
      )}

      {/* News Portal */}
      <div 
        id="news-sidebar-portal" 
        className={isSidebarOpen && viewMode === 'news' ? "absolute inset-y-0 left-0 z-40 md:relative shadow-2xl md:shadow-none flex" : "hidden"} 
      />

      {/* Dashboard Portal */}
      <div 
        id="dashboard-sidebar-portal" 
        className={isSidebarOpen && viewMode === 'dashboard' ? "absolute inset-y-0 left-0 z-40 md:relative shadow-2xl md:shadow-none flex" : "hidden"} 
      />

      <main className="flex-1 min-w-0 relative flex flex-col p-4">
        
        {/* Top Bar Controls */}
        <div className="flex items-center gap-2 mb-4 z-20">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className={`p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${!isSidebarOpen ? '' : 'hidden md:block'}`}
            title={isSidebarOpen ? "Close Settings" : "Open Settings"}
          >
            <Settings size={18} />
          </button>
          
          <button
            onClick={() => setIsDark(!isDark)}
            className="p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            title="Toggle Theme"
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          
          <div className="flex bg-gray-100 dark:bg-gray-800/80 p-1 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
            {VIEW_MODES.filter(mode => mode.enabled).map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setViewMode(id as ViewMode)}
                className={`px-3 py-1.5 flex items-center gap-2 text-sm font-medium transition-all rounded-md ${
                  viewMode === id
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-gray-700/50'
                }`}
              >
                <Icon size={16} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mb-4 z-20 bg-red-50 dark:bg-red-950/80 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-200 px-4 py-3 rounded-lg shadow-md flex items-center gap-3 w-full backdrop-blur-sm">
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

        {/* Main Content Area */}
        <div className="flex-1 relative rounded-xl border border-gray-200 dark:border-gray-800 shadow-lg bg-white dark:bg-gray-900 overflow-hidden transition-colors duration-200 flex">
          {viewMode === 'globe' ? (
            <ErrorBoundary>
              <GlobeView
                data={graphData}
                onItemClick={setSelectedItem}
                isDark={isDark}
                selectedItem={selectedItem}
                homeLocation={homeLocation}
                onSetHomeLocation={handleSetHomeLocation}
              >
                {detailsPanelElement}
              </GlobeView>
            </ErrorBoundary>
          ) : viewMode === 'assets' ? (
            <ErrorBoundary>
              <AssetsView data={graphData} isDark={isDark} />
            </ErrorBoundary>
          ) : viewMode === 'alerts' ? (
            <ErrorBoundary>
              <AlertsDashboard 
                host={alertsConfig?.host || import.meta.env.VITE_NW_ALERTS_HOST || import.meta.env.VITE_NW_HOST || ''} 
                port={alertsConfig?.port || import.meta.env.VITE_NW_ALERTS_PORT || import.meta.env.VITE_NW_PORT || ''}
                username={alertsConfig?.username || import.meta.env.VITE_NW_ALERTS_USERNAME || import.meta.env.VITE_NW_USERNAME || ''} 
                password={alertsConfig?.password || import.meta.env.VITE_NW_ALERTS_PASSWORD || import.meta.env.VITE_NW_PASSWORD || ''} 
                isDark={isDark}
                queryTrigger={alertsConfig?.trigger || 0}
              />
            </ErrorBoundary>
          ) : viewMode === 'dashboard' ? (
            <ErrorBoundary>
              <CustomDashboard latestConfig={latestConfig} />
            </ErrorBoundary>
          ) : (
            <>
              <div className="flex-1 relative min-w-0">
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
                    <ThreatNews 
                      isDark={isDark} 
                      isSidebarOpen={isSidebarOpen} 
                      onClose={() => setIsSidebarOpen(false)} 
                      homeLocation={homeLocation} 
                    />
                  </ErrorBoundary>
                )}
              </div>
              
              {/* Render panel alongside NetworkGraph/ThreatNews if not in globe mode */}
              {detailsPanelElement}
            </>
          )}
        </div>
      </main>
    </div>
  );
}