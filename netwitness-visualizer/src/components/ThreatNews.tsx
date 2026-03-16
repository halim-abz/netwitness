import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Globe from 'react-globe.gl';
import * as d3 from 'd3';
import DOMPurify from 'dompurify';
import { 
  Play, Pause, Search, Settings, RefreshCw, 
  ShieldAlert, Bug, Target, Lock, Database, ShieldOff, Activity, ExternalLink 
} from 'lucide-react';

import { RssSource, Article } from '../types';
import { formatDate } from '../lib/utils';
import { getCountryCentroids } from '../lib/countryCentroids';
import { useGlobe } from '../hooks/useGlobe';
import { COUNTRY_DATA, getIsoA2FromGeoJson } from '../lib/countryData';

// --- TYPES & INTERFACES ---

interface ThreatNewsProps {
  isDark: boolean;
  isSidebarOpen: boolean;
  onClose?: () => void;
  homeLocation?: {lat: number, lng: number} | null;
}

interface RssItem {
  guid?: string;
  id?: string;
  link?: string;
  title?: string;
  pubDate?: string;
  'content:encoded'?: string;
  content?: string;
  description?: string;
}

// --- CONSTANTS & CONFIG ---

const COUNTRY_INFO = COUNTRY_DATA;
const GlobeComponent = Globe as unknown as React.ElementType; 

const COUNTRY_ALIASES: Record<string, string[]> = {
  'US': ['USA', 'U.S.', 'U.S.A.', 'America'],
  'GB': ['UK', 'U.K.', 'Britain', 'United Kingdom'],
  'AE': ['UAE', 'U.A.E.'],
  'RU': ['Russia', 'Russian Federation'],
  'CN': ['China'],
  'KP': ['North Korea', 'DPRK'],
  'KR': ['South Korea', 'ROK'],
  'SY': ['Syria'],
  'IR': ['Iran'],
  'UA': ['Ukraine'],
  'IL': ['Israel'],
  'PS': ['Palestine', 'Gaza', 'West Bank'],
  'TW': ['Taiwan'],
  'DE': ['Germany'],
  'FR': ['France'],
  'JP': ['Japan'],
  'IN': ['India'],
  'BR': ['Brazil'],
  'CA': ['Canada'],
  'AU': ['Australia'],
};

// Pre-compiled Regexes for performance
const COUNTRY_REGEXES = Object.entries(COUNTRY_INFO).map(([code, info]) => {
  const aliases = COUNTRY_ALIASES[code] || [];
  const allNames = [info.name, ...aliases];
  const pattern = allNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return { code, nameRegex: new RegExp(`\\b(${pattern})\\b`, 'i') };
});

const THREAT_REGEXES = {
  ransomware: /\b(ransomware|crypto[-_]?locker|ransom\s?note|double[-_]?extortion|lockbit|revil|ryuk|wannacry|blackcat|alphv|clop|conti)\b/i,
  malware: /\b(malware|trojan|worm|spyware|keylogger|rootkit|botnet|virus|adware|wiper|infostealer|remote access trojan|rat)\b/i,
  apt: /\b(apt[-_]?\d+|advanced persistent threat|state[-_]?sponsored|nation[-_]?state|threat actor|cyber espionage|lazarus|cozy bear|fancy bear|midnight blizzard|muddywater)\b/i,
  breach: /\b(data breach|data leak|exfiltration|data exposure|unauthorized access|stolen data|database dump|compromised credentials|credential stuffing|unsecured database)\b/i,
  vulnerability: /\b(vulnerabilit(y|ies)|cve-\d{4}-\d+|zero[-_]?day|0[-_]?day|exploit|software flaw|security patch|rce|remote code execution|sql injection|xss|cross[-_]?site scripting|buffer overflow)\b/i,
};

// --- PURE UTILITY FUNCTIONS ---

const extractCountries = (text: string): string[] => {
  const found = new Set<string>();
  const normalizedText = text.toLowerCase();

  COUNTRY_REGEXES.forEach(({ code, nameRegex }) => {
    if (nameRegex.test(normalizedText)) found.add(code);
  });

  return Array.from(found);
};

const classifyType = (title: string, content: string): Article['types'] => {
  const combinedText = `${title} ${content}`.toLowerCase();
  const types: Article['types'] = [];
  
  if (THREAT_REGEXES.apt.test(combinedText)) types.push('apt');
  if (THREAT_REGEXES.breach.test(combinedText)) types.push('breach');
  if (THREAT_REGEXES.vulnerability.test(combinedText)) types.push('vulnerability');
  if (THREAT_REGEXES.ransomware.test(combinedText)) types.push('ransomware');
  if (THREAT_REGEXES.malware.test(combinedText)) types.push('malware');
  if (types.length === 0) types.push('general');
  
  return types;
};

// --- GLOBAL CACHE ---
const ViewCache = {
  sources: [] as RssSource[],
  articles: [] as Article[],
  lastUpdated: null as Date | null,
};

// --- MAIN COMPONENT ---

export default function ThreatNews({ isDark, isSidebarOpen, onClose, homeLocation }: ThreatNewsProps) {
  const {
    globeRef, countries, autoRotate, setAutoRotate,
    globeSize, containerRef, setIsReady, showLabels
  } = useGlobe(false);
  
  // State
  const [sources, setSources] = useState<RssSource[]>(ViewCache.sources);
  const [articles, setArticles] = useState<Article[]>(ViewCache.articles);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(ViewCache.lastUpdated);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [geoFilter, setGeoFilter] = useState<string>('all');
  const [refreshInterval, setRefreshInterval] = useState(5);
  const [isAutoRefreshPaused, setIsAutoRefreshPaused] = useState(false);
  const [expandedArticleId, setExpandedArticleId] = useState<string | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(100);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [impactRings, setImpactRings] = useState<any[]>([]);
  const impactTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const countryCentroids = useMemo(() => getCountryCentroids(countries), [countries]);

  // Sync state to cache
  useEffect(() => {
    ViewCache.sources = sources;
    ViewCache.articles = articles;
    ViewCache.lastUpdated = lastUpdated;
  }, [sources, articles, lastUpdated]);

  // Load Initial Sources
  useEffect(() => {
    const loadSources = async () => {
      if (ViewCache.sources.length > 0) return;
      
      try {
        const res = await fetch('/api/rss-feeds');
        const defaultSources: RssSource[] = res.ok ? await res.json() : [];

        const storedCustom = localStorage.getItem('nw_rss_custom_sources');
        const customSources: RssSource[] = storedCustom ? JSON.parse(storedCustom) : [];

        const storedDisabled = localStorage.getItem('nw_rss_disabled_defaults');
        const disabledIds: string[] = storedDisabled ? JSON.parse(storedDisabled) : [];

        const processedDefaults = defaultSources.map(s => ({
          ...s,
          enabled: !disabledIds.includes(s.id),
          isCustom: false
        }));

        setSources([...processedDefaults, ...customSources]);
      } catch (e) {
        console.error("Failed to load RSS sources", e);
      }
    };
    loadSources();
  }, []);

  // Cleanup impact timeouts
  useEffect(() => {
    return () => Object.values(impactTimeoutsRef.current).forEach(clearTimeout);
  }, []);

  // --- DATA FETCHING (Parallelized) ---
  const fetchFeeds = useCallback(async () => {
    if (sources.length === 0) return;
    setIsLoading(true);
    
    const activeSources = sources.filter(s => s.enabled);
    
    const fetchPromises = activeSources.map(async (source) => {
      const res = await fetch('/api/rss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: source.url })
      });
      
      if (!res.ok) throw new Error(`Failed to fetch ${source.name}`);
      const feed = await res.json();
      const items: RssItem[] = feed.items || [];
      
      return items.slice(0, 50).map((item) => {
        const content = item['content:encoded'] || item.content || item.description || '';
        const title = item.title || '';
        return {
          id: item.guid || item.id || item.link || Math.random().toString(),
          title,
          link: item.link || '#',
          pubDate: item.pubDate || new Date().toISOString(),
          content,
          contentSnippet: content.replace(/<[^>]*>?/gm, '').substring(0, 1000) + '...',
          sourceId: source.id,
          sourceName: source.name,
          types: classifyType(title, content),
          countries: extractCountries(`${title} ${content}`),
          isNew: false
        };
      });
    });

    try {
      const results = await Promise.allSettled(fetchPromises);
      let newArticles: Article[] = [];
      
      results.forEach(result => {
        if (result.status === 'fulfilled') {
          newArticles = [...newArticles, ...result.value];
        } else {
          console.warn("A feed failed to load:", result.reason);
        }
      });

      newArticles.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

      setArticles(prev => {
        const prevIds = new Set(prev.map(a => a.id));
        let hasNew = false;
        
        const updated = newArticles.map(a => {
          if (!prevIds.has(a.id) && prev.length > 0) {
            hasNew = true;
            return { ...a, isNew: true };
          }
          return a;
        });
        
        if (hasNew) {
          setToastMessage("New articles added");
          setTimeout(() => setToastMessage(null), 3000);
        }
        return updated;
      });
      
      setLastUpdated(new Date());
    } finally {
      setIsLoading(false);
    }
  }, [sources]);

  // Initial Fetch & Auto-Refresh
  useEffect(() => {
    if (articles.length === 0 && sources.length > 0) fetchFeeds();
  }, [fetchFeeds, articles.length, sources.length]);

  useEffect(() => {
    if (isAutoRefreshPaused || refreshInterval === 0) return;
    const interval = setInterval(() => fetchFeeds(), refreshInterval * 60 * 1000);
    return () => clearInterval(interval);
  }, [refreshInterval, isAutoRefreshPaused, fetchFeeds]);

  // --- FILTERING ---
  const filteredArticles = useMemo(() => {
    const searchTerms = searchQuery.toLowerCase().trim().split(/\s+/).filter(Boolean);
    
    return articles.filter(a => {
      if (typeFilter !== 'all' && !a.types.includes(typeFilter as any)) return false;
      
      if (geoFilter !== 'all') {
        if (geoFilter.startsWith('region:')) {
          const region = geoFilter.split(':')[1];
          if (!a.countries.some(c => COUNTRY_INFO[c]?.region === region)) return false;
        } else {
          if (!a.countries.includes(geoFilter)) return false;
        }
      }
      
      if (searchTerms.length > 0) {
        const title = a.title.toLowerCase();
        const sourceName = a.sourceName.toLowerCase();
        const snippet = a.contentSnippet.toLowerCase();
        
        return searchTerms.every(term => {
          if (term.startsWith('!')) {
            const excludeTerm = term.slice(1);
            return excludeTerm ? !(title.includes(excludeTerm) || sourceName.includes(excludeTerm) || snippet.includes(excludeTerm)) : true;
          }
          return title.includes(term) || sourceName.includes(term) || snippet.includes(term);
        });
      }
      return true;
    });
  }, [articles, typeFilter, geoFilter, searchQuery]);

  // --- GLOBE RENDERING DATA ---
  const globeData = useMemo(() => {
    const rings: any[] = [];
    const oneDayMs = 24 * 60 * 60 * 1000;
    const now = Date.now();
    
    filteredArticles.forEach(a => {
      const isRecent = (now - new Date(a.pubDate).getTime()) < oneDayMs;
      if (isRecent || a.isNew) {
        a.countries.forEach(c => {
          const centroid = countryCentroids.get(c.toLowerCase());
          if (centroid) {
            rings.push({
              lat: centroid.lat,
              lng: centroid.lng,
              color: a.types.includes('apt') ? '#ef4444' : a.types.includes('ransomware') ? '#f97316' : a.types.includes('vulnerability') ? '#eab308' : '#3b82f6',
              article: a
            });
          }
        });
      }
    });
    return rings;
  }, [filteredArticles, countryCentroids]);

  const labelsData = useMemo(() => {
    if (!showLabels || !countries?.features) return [];
    return countries.features.map((f: any) => {
      const name = f.properties?.NAME;
      if (!name) return null;
      const centroid = countryCentroids.get(name.toLowerCase());
      if (!centroid) return null;

      return {
        lat: centroid.lat,
        lng: centroid.lng,
        text: name,
        size: 0.3,
        color: isDark ? 'rgba(255,255,255,0.8)' : '#e5e7eb'
      };
    }).filter(Boolean);
  }, [countries, showLabels, isDark, countryCentroids]);

  // --- GLOBE ACTIONS ---
  const resetGlobeView = useCallback(() => {
    setGeoFilter('all');
    setSelectedCountry(null);
    setAutoRotate(true);
    if (globeRef.current) {
      const currentPOV = globeRef.current.pointOfView();
      globeRef.current.pointOfView({ lat: currentPOV.lat, lng: currentPOV.lng, altitude: 2.5 }, 1000);
    }
  }, [globeRef, setAutoRotate]);

  const flyToCountry = useCallback((countryCode: string) => {
    const centroid = countryCentroids.get(countryCode.toLowerCase());
    if (centroid && globeRef.current) {
      setAutoRotate(false);
      globeRef.current.pointOfView({ lat: centroid.lat, lng: centroid.lng, altitude: 1.5 }, 1000);
      setSelectedCountry(countryCode);
    }
  }, [countryCentroids, globeRef, setAutoRotate]);

  // --- RENDER ---
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setPortalNode(document.getElementById('news-sidebar-portal'));
  }, [isSidebarOpen]);

  return (
    <div className="relative w-full h-full flex overflow-hidden">
      
      {/* Settings Portal */}
      {isSidebarOpen && portalNode && createPortal(
        <SettingsSidebar 
          sources={sources} 
          setSources={setSources} 
          refreshInterval={refreshInterval} 
          setRefreshInterval={setRefreshInterval}
          fetchFeeds={fetchFeeds}
          articles={articles}
          onClose={onClose}
        />, portalNode
      )}

      {/* Main Globe Area */}
      <div className="flex-1 min-w-0 relative" ref={containerRef}>
        {globeSize.width > 0 && (
          <GlobeComponent
            ref={globeRef}
            width={globeSize.width}
            height={globeSize.height}
            globeImageUrl={isDark ? "/files/earth-dark.jpg" : "/files/earth-blue-marble.jpg"}
            bumpImageUrl="/files/earth-topology.png"
            backgroundImageUrl={isDark ? "/files/night-sky.png" : ""}
            backgroundColor={isDark ? "#020617" : "#f8fafc"}
            
            polygonsData={countries.features}
            polygonAltitude={0.007}
            polygonCapColor={(d: any) => {
              const isoA2 = getIsoA2FromGeoJson(d.properties);
              if (selectedCountry && isoA2 && isoA2.toLowerCase() === selectedCountry.toLowerCase()) {
                return 'rgba(182, 56, 48, 0.4)';
              }
              return isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)';
            }}
            polygonSideColor={() => 'rgba(0, 100, 255, 0.15)'}
            polygonStrokeColor={() => isDark ? '#334155' : '#cbd5e1'}
            
            ringsData={[...globeData, ...impactRings]}
            ringColor={(d: any) => d.color}
            ringMaxRadius={(d: any) => d.isImpact ? d.maxRadius : (d.article.isNew ? 6 : 4)}
            ringPropagationSpeed={(d: any) => d.isImpact ? d.propagationSpeed : 2}
            ringRepeatPeriod={(d: any) => d.isImpact ? 0 : (d.article.isNew ? 800 : 1500)}
            ringAltitude={0.021}

            labelsData={labelsData}
            labelLat="lat"
            labelLng="lng"
            labelText="text"
            labelSize="size"
            labelColor="color"
            labelAltitude={0.025}
            labelDotRadius={0.1}
            labelResolution={2}

            onPolygonClick={(d: any) => {
              const isoA2 = getIsoA2FromGeoJson(d.properties);
              if (isoA2 && COUNTRY_INFO[isoA2]) {
                if (selectedCountry === isoA2) {
                  resetGlobeView();
                } else {
                  const hasArticles = articles.some(a => a.countries.includes(isoA2));
                  if (!hasArticles) {
                    resetGlobeView();
                    setToastMessage(`No articles found for ${COUNTRY_INFO[isoA2].name}. Resetting filter.`);
                    setTimeout(() => setToastMessage(null), 3000);
                  } else {
                    setGeoFilter(isoA2);
                    flyToCountry(isoA2);
                  }
                }
              }
            }}
            onGlobeClick={resetGlobeView}
            onGlobeReady={() => {
              setTimeout(() => {
                const pov = { lat: homeLocation?.lat ?? 39.8283, lng: homeLocation?.lng ?? -98.5795, altitude: 2.5 };
                globeRef.current?.pointOfView(pov, 0);
                setIsReady(true);
                setAutoRotate(true);
              }, 100);
            }}
          />
        )}

        {toastMessage && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 bg-[#B63830]/90 backdrop-blur-sm text-white px-4 py-2.5 rounded-lg shadow-lg font-medium flex items-center gap-2 transition-all">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
            {toastMessage}
          </div>
        )}

        <button
          onClick={() => setAutoRotate(!autoRotate)}
          className="absolute bottom-6 right-6 p-3 bg-gray-900/80 border border-gray-700 rounded-full text-white shadow-lg hover:bg-gray-800 transition-colors backdrop-blur-sm z-10"
        >
          {autoRotate ? <Pause size={20} /> : <Play size={20} />}
        </button>
      </div>

      <NewsFeedPanel 
        articles={articles}
        filteredArticles={filteredArticles}
        isLoading={isLoading}
        lastUpdated={lastUpdated}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
        geoFilter={geoFilter}
        setGeoFilter={(val: string) => {
          if (val === 'all') resetGlobeView();
          else {
            setGeoFilter(val);
            if (!val.startsWith('region:')) flyToCountry(val);
            else setSelectedCountry(null);
          }
        }}
        fetchFeeds={fetchFeeds}
        isAutoRefreshPaused={isAutoRefreshPaused}
        setIsAutoRefreshPaused={setIsAutoRefreshPaused}
        visibleCount={visibleCount}
        setVisibleCount={setVisibleCount}
        expandedArticleId={expandedArticleId}
        setExpandedArticleId={(id: string | null, article: Article) => {
          setExpandedArticleId(id);
          if (id && article?.countries.length) flyToCountry(article.countries[0]);
          else resetGlobeView();
        }}
        flyToCountry={flyToCountry}
      />
    </div>
  );
}

// --- SUB-COMPONENTS ---

function SettingsSidebar({ sources, setSources, refreshInterval, setRefreshInterval, fetchFeeds, articles, onClose }: any) {
  const [newFeedName, setNewFeedName] = useState('');
  const [newFeedUrl, setNewFeedUrl] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  const sourceArticleCounts = useMemo(() => {
    return articles.reduce((acc: any, a: any) => {
      acc[a.sourceId] = (acc[a.sourceId] || 0) + 1;
      return acc;
    }, {});
  }, [articles]);

  const handleAddCustomFeed = () => {
    if (!newFeedUrl || !newFeedName) return;
    const newSource: RssSource = {
      id: `custom-${Date.now()}`, name: newFeedName, url: newFeedUrl, enabled: true, isCustom: true
    };
    const newSources = [...sources, newSource];
    setSources(newSources);
    localStorage.setItem('nw_rss_custom_sources', JSON.stringify(newSources.filter(s => s.isCustom)));
    setNewFeedUrl(''); setNewFeedName('');
    fetchFeeds();
  };

  const removeCustomFeed = (id: string) => {
    const newSources = sources.filter((s: RssSource) => s.id !== id);
    setSources(newSources);
    localStorage.setItem('nw_rss_custom_sources', JSON.stringify(newSources.filter((s: RssSource) => s.isCustom)));
  };

  return (
    <div className="w-80 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border-r border-gray-200 dark:border-gray-800 flex-col h-full shrink-0 flex">
      <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Settings className="text-[#B63830]" size={20} /> Feed Management
        </h2>
        {onClose && (
          <button onClick={onClose} className="md:hidden p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
        <div>
          <h3 className="text-sm font-bold uppercase text-gray-500 dark:text-gray-400 mb-3">Auto-Refresh</h3>
          <select 
            value={refreshInterval} onChange={(e) => setRefreshInterval(Number(e.target.value))}
            className="w-full bg-gray-100 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#B63830] outline-none text-gray-700 dark:text-gray-300"
          >
            <option value={0}>Disabled</option>
            <option value={1}>1 minute</option>
            <option value={5}>5 minutes</option>
            <option value={15}>15 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={60}>60 minutes</option>
          </select>
        </div>

        <div>
          <h3 className="text-sm font-bold uppercase text-gray-500 dark:text-gray-400 mb-3">Sources</h3>
          <div className="space-y-4">
            {Object.entries({
              'Default Sources': sources.filter((s: RssSource) => !s.isCustom),
              'Custom Sources': sources.filter((s: RssSource) => s.isCustom)
            }).map(([category, catSources]) => {
              if (catSources.length === 0 && category === 'Custom Sources') return null;
              const isCollapsed = collapsedCategories.has(category);
              return (
                <div key={category} className="space-y-2">
                  <button 
                    onClick={() => {
                      const next = new Set(collapsedCategories);
                      if (isCollapsed) next.delete(category);
                      else next.add(category);
                      setCollapsedCategories(next);
                    }}
                    className="flex items-center justify-between w-full text-[10px] font-bold uppercase text-gray-400 dark:text-gray-500 px-1 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  >
                    <span>{category}</span>
                    <span className="text-[8px]">{isCollapsed ? '▶' : '▼'}</span>
                  </button>
                  {!isCollapsed && catSources.map((source: RssSource) => (
                    <div key={source.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div 
                          onClick={() => {
                            const isEnabling = !source.enabled;
                            const newSources = sources.map((s: RssSource) => s.id === source.id ? { ...s, enabled: isEnabling } : s);
                            setSources(newSources);
                            
                            if (source.isCustom) {
                              localStorage.setItem('nw_rss_custom_sources', JSON.stringify(newSources.filter((s: RssSource) => s.isCustom)));
                            } else {
                              const disabledIds = newSources.filter((s: RssSource) => !s.isCustom && !s.enabled).map((s: RssSource) => s.id);
                              localStorage.setItem('nw_rss_disabled_defaults', JSON.stringify(disabledIds));
                            }
                            if (isEnabling) fetchFeeds();
                          }}
                          className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${source.enabled ? 'bg-[#B63830]' : 'bg-gray-200 dark:bg-gray-700'}`}
                        >
                          <span className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${source.enabled ? 'translate-x-3' : 'translate-x-0'}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{source.name}</div>
                          {sourceArticleCounts[source.id] > 0 && (
                            <div className="text-[10px] text-gray-500 dark:text-gray-400">
                              {sourceArticleCounts[source.id]} articles
                            </div>
                          )}
                        </div>
                      </div>
                      {source.isCustom && (
                        <button 
                          onClick={() => removeCustomFeed(source.id)}
                          className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md shrink-0 ml-2"
                          title="Remove custom feed"
                        >
                          &times;
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-bold uppercase text-gray-500 dark:text-gray-400 mb-3">Add Custom Feed</h3>
          <div className="space-y-2">
            <input 
              type="text" placeholder="Feed Name" value={newFeedName} onChange={(e) => setNewFeedName(e.target.value)}
              className="w-full bg-gray-100 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#B63830] outline-none text-gray-700 dark:text-gray-300"
            />
            <input 
              type="url" placeholder="RSS URL" value={newFeedUrl} onChange={(e) => setNewFeedUrl(e.target.value)}
              className="w-full bg-gray-100 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#B63830] outline-none text-gray-700 dark:text-gray-300"
            />
            <button 
              onClick={handleAddCustomFeed} disabled={!newFeedName || !newFeedUrl}
              className="w-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-medium py-2 rounded-lg transition-colors disabled:opacity-50 text-sm"
            >
              Add Feed
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function NewsFeedPanel({
  articles, filteredArticles, isLoading, lastUpdated, searchQuery, setSearchQuery, 
  typeFilter, setTypeFilter, geoFilter, setGeoFilter, fetchFeeds, isAutoRefreshPaused, 
  setIsAutoRefreshPaused, visibleCount, setVisibleCount, expandedArticleId, setExpandedArticleId,
  flyToCountry
}: any) {
  
  const getTypeIcon = (type: string) => {
    switch(type) {
      case 'apt': 
        return <Target size={14} className="text-red-500" />;
      case 'ransomware': 
        return <Lock size={14} className="text-orange-500" />;
      case 'vulnerability': 
        return <ShieldOff size={14} className="text-yellow-500" />;
      case 'breach': 
        return <Database size={14} className="text-blue-500" />;
      case 'malware': 
        return <Bug size={14} className="text-purple-500" />;
      default: 
        return <Activity size={14} className="text-green-500" />;
    }
  };

  const { availableCountries, availableRegions } = useMemo(() => {
    const c = new Set<string>(); const r = new Set<string>();
    articles.forEach((a: any) => a.countries.forEach((country: string) => {
      c.add(country);
      if (COUNTRY_INFO[country]?.region) r.add(COUNTRY_INFO[country].region);
    }));
    return {
      availableCountries: Array.from(c).sort((a, b) => (COUNTRY_INFO[a]?.name || a).localeCompare(COUNTRY_INFO[b]?.name || b)),
      availableRegions: Array.from(r).sort()
    };
  }, [articles]);

  return (
    <div className="w-96 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border-l border-gray-200 dark:border-gray-800 flex flex-col h-full z-10 shrink-0">
      <div className="p-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <ShieldAlert className="text-[#B63830]" size={20} /> Security News
          </h2>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsAutoRefreshPaused(!isAutoRefreshPaused)} 
              className={`p-1.5 rounded-md ${isAutoRefreshPaused ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
              title={isAutoRefreshPaused ? "Resume Auto-refresh" : "Pause Auto-refresh"}
            >
              {isAutoRefreshPaused ? <Play size={14} /> : <Pause size={14} />}
            </button>
            <button 
              onClick={fetchFeeds} 
              disabled={isLoading} 
              className="p-1.5 rounded-md bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
              title="Refresh Now"
            >
              <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
        
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-4 flex justify-between">
          <span>{articles.length} articles</span>
          <span>Updated: {lastUpdated ? lastUpdated.toLocaleTimeString() : 'Never'}</span>
        </div>

        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            <input 
              type="text" placeholder="Search news..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-gray-100 dark:bg-gray-800 border-none rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-[#B63830] dark:text-gray-200 outline-none transition-shadow"
            />
          </div>
          <div className="flex gap-2">
            <select 
              value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} 
              className="flex-1 text-xs bg-gray-100 dark:bg-gray-800 border-none rounded-lg px-2 py-2 outline-none focus:ring-1 focus:ring-[#B63830] text-gray-700 dark:text-gray-300"
            >
              <option value="all">All Types</option>
              <option value="apt">APT</option>
              <option value="ransomware">Ransomware</option>
              <option value="vulnerability">Vulnerability</option>
              <option value="breach">Breach</option>
              <option value="malware">Malware</option>
              <option value="general">General</option>
            </select>
            <select 
              value={geoFilter} onChange={(e) => setGeoFilter(e.target.value)} 
              className="flex-1 text-xs bg-gray-100 dark:bg-gray-800 border-none rounded-lg px-2 py-2 outline-none focus:ring-1 focus:ring-[#B63830] text-gray-700 dark:text-gray-300"
            >
              <option value="all">All Regions</option>
              {availableRegions.length > 0 && (
                <optgroup label="Regions">
                  {availableRegions.map(r => (
                    <option key={`region:${r}`} value={`region:${r}`}>{r}</option>
                  ))}
                </optgroup>
              )}
              {availableCountries.length > 0 && (
                <optgroup label="Countries">
                  {availableCountries.map(c => (
                    <option key={c} value={c}>{COUNTRY_INFO[c]?.name || c}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading && articles.length === 0 ? (
          <div className="flex justify-center py-8"><RefreshCw className="animate-spin text-gray-400" size={24} /></div>
        ) : filteredArticles.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">No articles found</div>
        ) : (
          <>
            {filteredArticles.slice(0, visibleCount).map((article: any, i: number) => {
              const isExpanded = expandedArticleId === article.id;
              return (
                <div 
                  key={article.id} 
                  className={`p-3 rounded-lg border transition-all duration-200 ${article.isNew ? 'animate-in fade-in slide-in-from-right-8' : ''} ${
                    isExpanded 
                      ? 'border-[#B63830] bg-[#B63830]/5 dark:bg-[#B63830]/10' 
                      : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 bg-gray-50 dark:bg-gray-800/50'
                  }`}
                  style={article.isNew ? { animationDelay: `${Math.min(i * 50, 500)}ms` } : {}}
                >
                  <div className="cursor-pointer" onClick={() => setExpandedArticleId(isExpanded ? null : article.id, article)}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {getTypeIcon(article.types[0] || 'general')}
                        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{article.sourceName}</span>
                        {article.isNew && (
                          <span className="flex h-2 w-2 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-gray-500">{formatDate(new Date(article.pubDate).getTime() / 1000)}</span>
                    </div>
                    <h3 className={`text-sm font-bold mb-2 ${isExpanded ? 'text-gray-900 dark:text-white' : 'text-gray-800 dark:text-gray-200 line-clamp-2'}`}>
                      {article.title}
                    </h3>
                    
                    <div className="flex flex-wrap gap-1 mb-2">
                      {article.types.map((t: string) => (
                        <span 
                          key={t} 
                          className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded text-[9px] font-medium uppercase tracking-wider"
                        >
                          {t}
                        </span>
                      ))}
                      {article.countries.map((c: string) => (
                        <span 
                          key={c} 
                          onClick={(e) => {
                            e.stopPropagation();
                            flyToCountry(c);
                          }}
                          className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-[9px] font-medium uppercase tracking-wider hover:bg-gray-300 dark:hover:bg-gray-600 cursor-pointer"
                        >
                          {COUNTRY_INFO[c]?.name || c}
                        </span>
                      ))}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-3 line-clamp-[10]" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(article.contentSnippet) }}></p>
                      <a 
                        href={article.link} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-[#B63830] hover:text-red-700 dark:hover:text-red-400"
                      >
                        Read full article <ExternalLink size={12} />
                      </a>
                    </div>
                  )}
                </div>
              );
            })}
            
            {filteredArticles.length > visibleCount && (
              <button
                onClick={() => setVisibleCount((prev: number) => prev + 50)}
                className="w-full py-3 text-xs font-bold text-gray-500 dark:text-gray-400 hover:text-[#B63830] transition-colors border-t border-gray-100 dark:border-gray-800 mt-2"
              >
                Load More (+50)
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}