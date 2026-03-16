import React, { useState, useEffect, useCallback, useMemo } from "react";
import Sidebar from "./components/Sidebar";
import NetworkGraph from "./components/NetworkGraph";
import GlobeView from "./components/GlobeView";
import ThreatNews from "./components/ThreatNews";
import { ErrorBoundary } from "./components/ErrorBoundary";
import DetailsPanel from "./components/DetailsPanel";
import { Node, Link } from "./types";
import { AlertCircle, Settings, Moon, Sun, Globe, Network, Newspaper } from "lucide-react";
import { processData } from "./lib/dataProcessor";
import { useNetWitnessQuery } from "./hooks/useNetWitnessQuery";

// --- CONSTANTS & CONFIG ---

// Read environment variables once at module level for performance
const ENV_LAT = import.meta.env.VITE_NW_HOME_LAT;
const ENV_LNG = import.meta.env.VITE_NW_HOME_LNG;
const ENABLE_GRAPH = import.meta.env.VITE_ENABLE_GRAPH !== 'false';
const ENABLE_GLOBE = import.meta.env.VITE_ENABLE_GLOBE !== 'false';
const ENABLE_NEWS = import.meta.env.VITE_ENABLE_NEWS !== 'false';

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
  
  // View mode state (graph vs globe vs news)
  const [viewMode, setViewMode] = useState<'graph' | 'globe' | 'news'>(() => {
    try {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const view = params.get('view');
        if (view === 'globe' && ENABLE_GLOBE) return 'globe';
        if (view === 'news' && ENABLE_NEWS) return 'news';
        if (view === 'graph' && ENABLE_GRAPH) return 'graph';
      }
    } catch (e) {
      // Ignore URL parsing errors
    }
    
    // Default priority based on enabled dashboards
    if (ENABLE_GRAPH) return 'graph';
    if (ENABLE_GLOBE) return 'globe';
    if (ENABLE_NEWS) return 'news';
    return 'graph';
  });
  
  // User preferences state
  const [homeLocation, setHomeLocation] = useState<{lat: number, lng: number} | null>(() => {
    try {
      const stored = localStorage.getItem('nw_home_location');
      if (stored) return JSON.parse(stored);
      if (ENV_LAT && ENV_LNG) return { lat: parseFloat(ENV_LAT), lng: parseFloat(ENV_LNG) };
      return null;
    } catch (e) {
      if (ENV_LAT && ENV_LNG) return { lat: parseFloat(ENV_LAT), lng: parseFloat(ENV_LNG) };
      return null;
    }
  });

  // Custom hook to manage data fetching and state
  const {
    rawData,
    isLoading,
    error,
    queriedAttributes,
    navigateUrl,
    handleQuery,
    handleCancel,
    setError
  } = useNetWitnessQuery(useCallback(() => {
    setSelectedItem(null);
    setDisplayedAttributes(['service']);
  }, []));

  // Apply dark mode class to document element
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  // Process raw data into graph format, memoized to prevent unnecessary recalculations
  const graphData = useMemo(() => {
    if (rawData) {
      return processData(rawData, homeLocation);
    }
    return { nodes: [], links: [] };
  }, [homeLocation, rawData]);

  /**
   * Handles selection of a specific attribute (e.g., a country or organization).
   * Automatically adds the attribute to the displayed list and selects the first matching node.
   */
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
        <div 
          className="fixed inset-0 bg-black/20 dark:bg-black/40 z-30 md:hidden backdrop-blur-sm"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
      {isSidebarOpen && viewMode !== 'news' && (
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
      )}
      <div id="news-sidebar-portal" className={isSidebarOpen && viewMode === 'news' ? "absolute inset-y-0 left-0 z-40 md:relative shadow-2xl md:shadow-none flex" : "hidden"} />

      <main className="flex-1 min-w-0 relative flex flex-col p-4">
        {/* Top Bar */}
        <div className="absolute top-6 left-6 z-20 flex items-center gap-2">
          {!isSidebarOpen && (
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              title="Open Settings"
            >
              <Settings size={18} />
            </button>
          )}
          {isSidebarOpen && (
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="hidden md:block p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              title="Close Settings"
            >
              <Settings size={18} />
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
            {ENABLE_GRAPH && (
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
            )}
            {ENABLE_GLOBE && (
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
            )}
            {ENABLE_NEWS && (
              <button
                onClick={() => setViewMode('news')}
                className={`px-3 py-1.5 flex items-center gap-2 text-sm font-medium transition-all rounded-md ${
                  viewMode === 'news'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-gray-700/50'
                }`}
              >
                <Newspaper size={16} />
                <span>News</span>
              </button>
            )}
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

        <div className="flex-1 relative rounded-xl border border-gray-200 dark:border-gray-800 shadow-lg bg-white dark:bg-gray-900 overflow-hidden transition-colors duration-200 flex">
          {viewMode === 'globe' ? (
            <ErrorBoundary>
              <GlobeView
                data={graphData}
                onItemClick={setSelectedItem}
                isDark={isDark}
                selectedItem={selectedItem}
                homeLocation={homeLocation}
                onSetHomeLocation={(loc) => {
                  setHomeLocation(loc);
                  localStorage.setItem('nw_home_location', JSON.stringify(loc));
                }}
              >
                {selectedItem && (
                  <DetailsPanel
                    selectedItem={selectedItem}
                    onClose={() => setSelectedItem(null)}
                    graphData={graphData}
                    onNodeSelect={setSelectedItem}
                    onAttributeSelect={handleAttributeSelect}
                    navigateUrl={navigateUrl || import.meta.env.VITE_NW_NAVIGATE_URL}
                    viewMode={viewMode}
                  />
                )}
              </GlobeView>
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
                    <ThreatNews isDark={isDark} isSidebarOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} homeLocation={homeLocation} />
                  </ErrorBoundary>
                )}
              </div>

              {viewMode !== 'news' && selectedItem && (
                <DetailsPanel
                  selectedItem={selectedItem}
                  onClose={() => setSelectedItem(null)}
                  graphData={graphData}
                  onNodeSelect={setSelectedItem}
                  onAttributeSelect={handleAttributeSelect}
                  navigateUrl={navigateUrl || import.meta.env.VITE_NW_NAVIGATE_URL}
                  viewMode={viewMode}
                />
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

