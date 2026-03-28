import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Activity, AlertTriangle, ArrowRight, Check, 
  Clock, Copy, FileJson, Filter, Search, Server, Shield, ShieldAlert, Target, X,
  Globe, User, FileText, MapPin, Lock, Monitor
} from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import { format, formatDistanceToNow } from 'date-fns';
import { MITRE_DICT } from '../lib/mitreDict';

// --- Types & Interfaces ---

export interface AlertsDashboardProps {
  host: string;
  port?: string;
  username: string;
  password?: string; // SECURITY NOTE: Passing passwords via frontend props is an anti-pattern unless strictly local/proxied.
  isDark: boolean;
  queryTrigger: number;
}

export interface AlertEvent {
  time?: number | string;
  ip_src?: string;
  ip_dst?: string;
  device_ip?: string;
  ip_addr?: string;
  user_dst?: string;
  host_src?: string[];
  country_dst?: string;
  city_dst?: string;
  direction?: string;
  device_name?: string;
  tcp_srcport?: string | number;
  udp_srcport?: string | number;
  tcp_dstport?: string | number;
  udp_dstport?: string | number;
  [key: string]: unknown;
}

export interface Alert {
  id: string;
  severity: number;
  moduleName: string;
  time: string | number;
  events: AlertEvent[];
  tactics?: string[];
  techniques?: string[];
  rawScore?: number;
}

// --- Constants ---

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_YEAR = 365 * MS_PER_DAY;

const SEVERITY_COLORS: Record<number, string> = {
  1: '#3b82f6', // Low - Blue
  2: '#eab308', // Medium - Yellow
  3: '#f97316', // High - Orange
  4: '#ef4444', // Critical - Red
};

const SEVERITY_LABELS: Record<number, string> = {
  1: 'Low',
  2: 'Medium',
  3: 'High',
  4: 'Critical',
};

const CHART_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#10b981', '#06b6d4'];

const TIME_RANGES = [
  { label: 'Past 1 Day', value: '1d', getSince: () => new Date(Date.now() - 1 * MS_PER_DAY).toISOString() },
  { label: 'Past 2 Days', value: '2d', getSince: () => new Date(Date.now() - 2 * MS_PER_DAY).toISOString() },
  { label: 'Past 7 Days', value: '7d', getSince: () => new Date(Date.now() - 7 * MS_PER_DAY).toISOString() },
  { label: 'Past 14 Days', value: '14d', getSince: () => new Date(Date.now() - 14 * MS_PER_DAY).toISOString() },
  { label: 'Past 1 Month', value: '1m', getSince: () => new Date(Date.now() - 30 * MS_PER_DAY).toISOString() },
  { label: 'Past 1 Year', value: '1y', getSince: () => new Date(Date.now() - MS_PER_YEAR).toISOString() },
  { label: 'All Data (5 Years)', value: '5y', getSince: () => new Date(Date.now() - 5 * MS_PER_YEAR).toISOString() },
];

// --- Pure Helper Functions ---

const getMitreName = (id?: string): string => {
  if (!id) return '';
  const cleanId = id.trim();
  if (MITRE_DICT[cleanId]) return `${cleanId}: ${MITRE_DICT[cleanId]}`;
  
  if (cleanId.includes('.')) {
    const base = cleanId.split('.')[0];
    if (MITRE_DICT[base]) return `${cleanId}: ${MITRE_DICT[base]} (Subtechnique)`;
  }
  return cleanId;
};

const getSeverityLevel = (score: number | string): number => {
  const s = Number(score);
  if (isNaN(s)) return 1;
  
  if (s < 10) {
    if (s >= 8) return 4;
    if (s >= 6) return 3;
    if (s >= 4) return 2;
    return 1;            
  } else {
    if (s >= 90) return 4;
    if (s >= 70) return 3;
    if (s >= 31) return 2;
    return 1;             
  }
};

const getSourceIdentity = (e?: AlertEvent | null): string | null => {
  if (!e) return null;
  if (e.ip_src && e.ip_src !== '-') return String(e.ip_src);
  if (e.device_ip && e.device_ip !== '-') return String(e.device_ip);
  if (Array.isArray(e.host_src) && e.host_src[0] !== '-') return String(e.host_src[0]);
  return null;
};

const getDestIdentity = (e?: AlertEvent | null): string | null => {
  if (!e) return null;
  if (e.ip_dst && e.ip_dst !== '-') return String(e.ip_dst);
  if (e.ip_addr && e.ip_addr !== '-') return String(e.ip_addr);
  if (e.user_dst && e.user_dst !== '-') return String(e.user_dst);
  return null;
};

const getAlertTimeSafe = (alert: Partial<Alert>): Date => {
  if (alert.time) {
    // Check if time is a numeric string (Unix epoch) and convert to Number
    const timeValue = typeof alert.time === 'string' && /^\d+$/.test(alert.time) 
      ? Number(alert.time) 
      : alert.time;
      
    const d = new Date(timeValue);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date(); 
};

const formatDateSafe = (alert: Partial<Alert>): string => {
  try {
    return format(getAlertTimeSafe(alert), 'MMM dd, HH:mm:ss');
  } catch {
    return 'Invalid Date';
  }
};

// --- Sub-Components (Extracted for performance) ---

const KPICard = ({ icon: Icon, label, value, color = "text-nw-red", trendData, trendColor = "#ef4444" }: { icon: React.ElementType, label: string, value: string | number, color?: string, trendData?: { value: number }[], trendColor?: string }) => {
  const option = trendData && trendData.length > 0 ? {
    grid: { top: 0, right: 0, bottom: 0, left: 0 },
    xAxis: { type: 'category', show: false, data: trendData.map((_, i) => i) },
    yAxis: { type: 'value', show: false, min: 'dataMin', max: 'dataMax' },
    series: [{
      data: trendData.map(d => d.value),
      type: 'line',
      smooth: true,
      showSymbol: false,
      lineStyle: { color: trendColor, width: 2, opacity: 0.3 },
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: trendColor },
            { offset: 1, color: 'rgba(255,255,255,0)' }
          ]
        },
        opacity: 0.15
      },
      animation: false
    }]
  } : null;

  return (
    <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800 flex items-center gap-4 relative overflow-hidden">
      {option && (
        <div className="absolute inset-0 pointer-events-none opacity-50">
          <ReactECharts option={option} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} />
        </div>
      )}
      <div className={`p-3 rounded-lg bg-gray-50 dark:bg-gray-800 ${color} relative z-10`}>
        <Icon className="w-6 h-6" />
      </div>
      <div className="relative z-10">
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
        <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      </div>
    </div>
  );
};

interface AlertDrawerProps {
  alert: Alert | null;
  onClose: () => void;
}

const AlertDrawer: React.FC<AlertDrawerProps> = ({ alert, onClose }) => {
  const [copied, setCopied] = useState(false);
  
  // Reset copy state when alert changes
  useEffect(() => setCopied(false), [alert]);

  if (!alert) return null;
  
  const event = alert.events?.[0] || {};
  
  const eventGridData = Object.entries(event).filter(([, value]) => {
    if (value === null || typeof value === 'object' || Array.isArray(value)) return false;
    if (typeof value === 'string' && value.length > 50) return false;
    return true;
  });

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(event, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div 
        className="absolute inset-0 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm transition-opacity" 
        onClick={onClose} 
      />
      
      <div className="relative w-full max-w-2xl bg-white dark:bg-gray-900 h-full shadow-2xl flex flex-col border-l border-gray-200 dark:border-gray-800 transform transition-transform duration-300 ease-in-out">
        <div className="flex-none px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 flex justify-between items-start gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span 
                className="px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider"
                style={{ 
                  backgroundColor: `${SEVERITY_COLORS[alert.severity]}20`,
                  color: SEVERITY_COLORS[alert.severity],
                  border: `1px solid ${SEVERITY_COLORS[alert.severity]}40`
                }}
              >
                {SEVERITY_LABELS[alert.severity]} (Score: {alert.rawScore || 'N/A'})
              </span>
              <span className="text-sm text-gray-500 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {formatDateSafe(alert)}
              </span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white leading-tight mt-2">
              {alert.moduleName}
            </h2>
            <p className="text-xs text-gray-400 mt-1 font-mono">ID: {alert.id}</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors flex-none"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Source</p>
              <p className="text-base font-medium text-gray-900 dark:text-gray-200 break-all">
                {getSourceIdentity(event) || 'Unknown'}
              </p>
              {event.tcp_srcport || event.udp_srcport ? (
                <p className="text-xs text-gray-500 mt-1">Port: {String(event.tcp_srcport || event.udp_srcport)}</p>
              ) : null}
            </div>
            <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Destination</p>
              <p className="text-base font-medium text-gray-900 dark:text-gray-200 break-all">
                {getDestIdentity(event) || 'Unknown'}
              </p>
              {event.tcp_dstport || event.udp_dstport ? (
                <p className="text-xs text-gray-500 mt-1">Port: {String(event.tcp_dstport || event.udp_dstport)}</p>
              ) : null}
            </div>
          </div>

          {(alert.tactics?.length || alert.techniques?.length) ? (
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <Target className="w-4 h-4 text-nw-red" />
                MITRE ATT&CK Mapping
              </h3>
              <div className="flex flex-wrap gap-2">
                {alert.tactics?.map(t => (
                  <div key={t} className="px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg text-sm font-medium border border-blue-200 dark:border-blue-800/50">
                    {getMitreName(t)}
                  </div>
                ))}
                {alert.techniques?.map(t => (
                  <div key={t} className="px-3 py-1.5 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 rounded-lg text-sm font-medium border border-purple-200 dark:border-purple-800/50">
                    {getMitreName(t)}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <Server className="w-4 h-4 text-nw-red" />
              Event Metadata
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-6 bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800">
              {eventGridData.length > 0 ? (
                eventGridData.map(([key, value]) => {
                  const displayKey = key.replace(/_/g, ' ');
                  const queryKey = key.replace(/_/g, '.');
                  const queryValue = String(value);
                  
                  const isIPv4 = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(queryValue);
                  const isIPv6 = /^[0-9a-fA-F:]+$/.test(queryValue) && queryValue.includes(':');
                  const isNumber = !isNaN(Number(queryValue)) && queryValue.trim() !== '';
                  const formattedValue = (isIPv4 || isIPv6 || isNumber) ? queryValue : `'${queryValue}'`;
                  
                  const baseUrl = (import.meta.env.VITE_NW_NAVIGATE_URL || 'https://nw-head-node/investigate/navigate').replace(/\/$/, '');
                  const investigateUrl = `${baseUrl}/query/${encodeURIComponent(queryKey)}=${encodeURIComponent(formattedValue)}`;

                  return (
                    <div key={key} className="group relative">
                      <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5 truncate" title={displayKey}>
                        {displayKey}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="block text-sm font-semibold text-gray-900 dark:text-gray-200 truncate" title={queryValue}>
                          {queryValue}
                        </span>
                        <a 
                          href={investigateUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-gray-400 hover:text-nw-red"
                          title={`Investigate ${queryKey} in NetWitness`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Search className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="col-span-full text-sm text-gray-500">No scalar metadata found in event payload.</div>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <FileJson className="w-4 h-4 text-nw-red" />
                Raw Payload
              </h3>
              <button 
                onClick={handleCopy}
                className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 px-2.5 py-1.5 rounded-md transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied!' : 'Copy JSON'}
              </button>
            </div>
            <div className="bg-gray-900 rounded-xl p-4 overflow-x-auto border border-gray-800 shadow-inner">
              <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap break-all leading-relaxed">
                {JSON.stringify(event, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Main Component ---

export default function AlertsDashboard({ host, port, username, password, isDark, queryTrigger }: AlertsDashboardProps) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [timeRange, setTimeRange] = useState(TIME_RANGES[2]); 
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIP, setSelectedIP] = useState<string | null>(null);
  
  const [selectedAlertDetails, setSelectedAlertDetails] = useState<Alert | null>(null);

  useEffect(() => {
    const fetchAlerts = async () => {
      if (!queryTrigger) return;

      if (!host || !username || !password) {
        setError("Missing connection details. Please configure them in the sidebar.");
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/alerts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            host,
            port,
            username,
            password,
            since: timeRange.getSince()
          })
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({ error: 'Unknown server error' }));
          throw new Error(errData.error || `Failed to fetch alerts: ${response.statusText}`);
        }

        const data = await response.json();
        
        // Handle various backend wrapper shapes safely
        let rawItems: Record<string, unknown>[] = [];
        if (data && Array.isArray(data.items)) {
          rawItems = data.items;
        } else if (Array.isArray(data)) {
          rawItems = data;
        }

        const alertsList: Alert[] = rawItems.map((item) => {
          const originalHeaders = (item.originalHeaders as Record<string, unknown>) || {};
          const originalAlert = (item.originalAlert as Record<string, unknown>) || {};
          const events = (originalAlert.events || item.events || []) as AlertEvent[];
          
          const rawScore = Number(
            originalAlert.severity ?? originalAlert.risk_score ?? item.severity ?? originalHeaders.severity ?? 10
          );

          return {
            id: String(item.id || Math.random().toString(36).substring(7)),
            rawScore,
            severity: getSeverityLevel(rawScore),
            moduleName: String(originalHeaders.name || item.name || 'Unknown Alert'),
            time: (originalHeaders.timestamp || item.timestamp || item.receivedTime) as string | number,
            tactics: (item.tactics || originalAlert.tactics || []) as string[],
            techniques: (item.techniques || originalAlert.techniques || []) as string[],
            events
          };
        });
        
        alertsList.sort((a, b) => getAlertTimeSafe(b).getTime() - getAlertTimeSafe(a).getTime());
        setAlerts(alertsList);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAlerts();
  }, [host, port, username, password, timeRange, queryTrigger]);

  const filteredAlerts = useMemo(() => {
    if (!searchQuery && !selectedIP) return alerts;

    const lowerQuery = searchQuery.toLowerCase();
    
    return alerts.filter(alert => {
      let matchesSearch = true;
      if (lowerQuery) {
        const eventValues = alert.events?.flatMap(e => Object.values(e).map(v => String(v))).filter(Boolean).join(' ') || '';
        const searchStr = `${alert.moduleName} ${alert.id} ${alert.tactics?.join(' ')} ${alert.techniques?.join(' ')} ${eventValues}`.toLowerCase();
        matchesSearch = searchStr.includes(lowerQuery);
      }
      
      let matchesIP = true;
      if (selectedIP) {
        matchesIP = Array.isArray(alert.events) && alert.events.some((e) => 
          getSourceIdentity(e) === selectedIP || getDestIdentity(e) === selectedIP
        );
      }

      return matchesSearch && matchesIP;
    });
  }, [alerts, searchQuery, selectedIP]);

  const kpis = useMemo(() => {
    const total = filteredAlerts.length;
    const criticalHigh = filteredAlerts.filter(a => a.severity >= 3).length;
    const uniqueRules = new Set(filteredAlerts.map(a => a.moduleName)).size;
    
    const ipCounts: Record<string, number> = {};
    filteredAlerts.forEach(alert => {
      if (Array.isArray(alert.events)) {
        alert.events.forEach(e => {
          const src = getSourceIdentity(e);
          const dst = getDestIdentity(e);
          if (src) ipCounts[src] = (ipCounts[src] || 0) + 1;
          if (dst) ipCounts[dst] = (ipCounts[dst] || 0) + 1;
        });
      }
    });
    
    let topIP = 'N/A';
    let maxCount = 0;
    Object.entries(ipCounts).forEach(([ip, count]) => {
      if (count > maxCount) {
        maxCount = count;
        topIP = ip;
      }
    });

    return { total, criticalHigh, uniqueRules, topIP };
  }, [filteredAlerts]);

  const volumeData = useMemo(() => {
    const countsByDate: Record<string, { Low: number, Medium: number, High: number, Critical: number }> = {};
    const ascendingAlerts = [...filteredAlerts].sort((a, b) => getAlertTimeSafe(a).getTime() - getAlertTimeSafe(b).getTime());
    
    ascendingAlerts.forEach(a => {
      try {
        const date = format(getAlertTimeSafe(a), 'MMM dd');
        if (!countsByDate[date]) {
          countsByDate[date] = { Low: 0, Medium: 0, High: 0, Critical: 0 };
        }
        
        const sevLabel = SEVERITY_LABELS[a.severity] as 'Low' | 'Medium' | 'High' | 'Critical';
        if (sevLabel) {
            countsByDate[date][sevLabel] += 1;
        }
      } catch {
        // Silently skip invalid dates
      }
    });
    
    return Object.entries(countsByDate).map(([date, counts]) => ({ date, ...counts }));
  }, [filteredAlerts]);

  const totalTrendData = useMemo(() => {
    const data = volumeData.map(d => ({ value: d.Low + d.Medium + d.High + d.Critical }));
    // Recharts needs at least 2 points to draw an area/line properly
    if (data.length === 1) return [data[0], data[0]];
    return data;
  }, [volumeData]);

  const criticalHighTrendData = useMemo(() => {
    const data = volumeData.map(d => ({ value: d.High + d.Critical }));
    if (data.length === 1) return [data[0], data[0]];
    return data;
  }, [volumeData]);

  const severityData = useMemo(() => {
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
    filteredAlerts.forEach(a => {
      if (a.severity in counts) {
        counts[a.severity as keyof typeof counts]++;
      }
    });
    return [
      { name: 'Critical', value: counts[4], color: SEVERITY_COLORS[4] },
      { name: 'High', value: counts[3], color: SEVERITY_COLORS[3] },
      { name: 'Medium', value: counts[2], color: SEVERITY_COLORS[2] },
      { name: 'Low', value: counts[1], color: SEVERITY_COLORS[1] },
    ].filter(item => item.value > 0);
  }, [filteredAlerts]);

  const topAlertsData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredAlerts.forEach(a => {
      const name = a.moduleName || 'Unknown Alert';
      counts[name] = (counts[name] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ 
        name: name.length > 25 ? name.substring(0, 25) + '...' : name, 
        fullName: name,
        count 
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [filteredAlerts]);

  const mitreData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredAlerts.forEach(a => {
      if (a.tactics && a.tactics.length > 0) {
        a.tactics.forEach(t => {
          const cleanT = t.trim();
          counts[cleanT] = (counts[cleanT] || 0) + 1;
        });
      }
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [filteredAlerts]);

  const topAssetsData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredAlerts.forEach(alert => {
      if (Array.isArray(alert.events)) {
        alert.events.forEach(e => {
          const src = getSourceIdentity(e);
          const dst = getDestIdentity(e);
          if (src) {
            counts[src] = (counts[src] || 0) + 1;
          }
          if (dst) {
            counts[dst] = (counts[dst] || 0) + 1;
          }
        });
      }
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ 
        name: name.length > 20 ? name.substring(0, 20) + '...' : name, 
        fullName: name,
        count 
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [filteredAlerts]);

  const handleBarClick = useCallback((data: { name?: string }) => {
    if (data?.name) {
      setSearchQuery(data.name);
    }
  }, []);

  return (
    <div className="flex flex-col h-full w-full min-w-full overflow-hidden bg-gray-50 dark:bg-gray-950 relative">
      <AlertDrawer alert={selectedAlertDetails} onClose={() => setSelectedAlertDetails(null)} />
      
      {/* Header */}
      <div className="flex-none p-6 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-nw-red" />
              Alerts Dashboard
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Monitor and investigate security alerts from NetWitness
            </p>
          </div>
          
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text"
                placeholder="Search alerts or MITRE..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-gray-100 dark:bg-gray-800 border-none rounded-lg text-sm focus:ring-2 focus:ring-nw-red outline-none text-gray-900 dark:text-white"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            
            <select
              value={timeRange.value}
              onChange={(e) => setTimeRange(TIME_RANGES.find(t => t.value === e.target.value) || TIME_RANGES[2])}
              className="px-4 py-2 bg-gray-100 dark:bg-gray-800 border-none rounded-lg text-sm focus:ring-2 focus:ring-nw-red outline-none text-gray-900 dark:text-white cursor-pointer"
            >
              {TIME_RANGES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard icon={AlertTriangle} label="Total Alerts" value={kpis.total} trendData={totalTrendData} trendColor="#3b82f6" />
          <KPICard icon={Activity} label="Critical / High" value={kpis.criticalHigh} color="text-red-500" trendData={criticalHighTrendData} trendColor="#ef4444" />
          <KPICard icon={Shield} label="Unique Rules" value={kpis.uniqueRules} />
          <KPICard icon={Target} label="Top IP Triggered" value={kpis.topIP} />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        {!queryTrigger ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400">
            <ShieldAlert className="w-12 h-12 mb-4 opacity-50" />
            <p>Click "Run Query" in the sidebar to fetch alerts.</p>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-nw-red"></div>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-6 h-full">
            
            {/* Left Column: Dashlets & Table */}
            <div className="flex-1 flex flex-col gap-6 min-w-0">
              
              {/* Row 1: Volume Trend & Severity */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-none h-[220px]">
                {/* Stacked Area Chart */}
                <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex flex-col">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Alert Trends</h3>
                  <div className="flex-1 min-h-0">
                    <ReactECharts 
                      option={{
                        tooltip: {
                          trigger: 'axis',
                          backgroundColor: isDark ? '#111827' : '#ffffff',
                          borderColor: isDark ? '#374151' : '#e5e7eb',
                          textStyle: { color: isDark ? '#d1d5db' : '#374151' },
                          axisPointer: { type: 'cross', label: { backgroundColor: '#6a7985' } }
                        },
                        grid: { top: 10, right: 10, left: 10, bottom: 0, containLabel: true },
                        xAxis: {
                          type: 'category',
                          boundaryGap: false,
                          data: volumeData.map(d => d.date),
                          axisLabel: { color: '#6b7280', fontSize: 11 },
                          axisLine: { show: false },
                          axisTick: { show: false }
                        },
                        yAxis: {
                          type: 'value',
                          axisLabel: { color: '#6b7280', fontSize: 11 },
                          splitLine: { lineStyle: { color: isDark ? '#374151' : '#e5e7eb', type: 'dashed', opacity: 0.5 } }
                        },
                        series: [
                          { name: 'Low', type: 'line', stack: 'Total', areaStyle: { opacity: 0.6 }, smooth: true, showSymbol: false, color: SEVERITY_COLORS[1], data: volumeData.map(d => d.Low) },
                          { name: 'Medium', type: 'line', stack: 'Total', areaStyle: { opacity: 0.6 }, smooth: true, showSymbol: false, color: SEVERITY_COLORS[2], data: volumeData.map(d => d.Medium) },
                          { name: 'High', type: 'line', stack: 'Total', areaStyle: { opacity: 0.6 }, smooth: true, showSymbol: false, color: SEVERITY_COLORS[3], data: volumeData.map(d => d.High) },
                          { name: 'Critical', type: 'line', stack: 'Total', areaStyle: { opacity: 0.6 }, smooth: true, showSymbol: false, color: SEVERITY_COLORS[4], data: volumeData.map(d => d.Critical) }
                        ]
                      }}
                      style={{ height: '100%', width: '100%' }}
                      opts={{ renderer: 'canvas' }}
                    />
                  </div>
                </div>

                {/* Severity Donut */}
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex flex-col">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Severity</h3>
                  <div className="flex-1 min-h-0 relative">
                    {severityData.length === 0 ? (
                      <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500">No Data</div>
                    ) : (
                      <ReactECharts 
                        option={{
                          tooltip: {
                            trigger: 'item',
                            backgroundColor: isDark ? '#111827' : '#ffffff',
                            borderColor: isDark ? '#374151' : '#e5e7eb',
                            textStyle: { color: isDark ? '#d1d5db' : '#374151' },
                            formatter: '{b}: {c} ({d}%)'
                          },
                          series: [
                            {
                              type: 'pie',
                              radius: ['60%', '80%'],
                              avoidLabelOverlap: false,
                              label: { show: false, position: 'center' },
                              emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold', color: isDark ? '#fff' : '#000' } },
                              labelLine: { show: false },
                              data: severityData.map(d => ({ value: d.value, name: d.name, itemStyle: { color: d.color } }))
                            }
                          ]
                        }}
                        style={{ height: '100%', width: '100%' }}
                        opts={{ renderer: 'canvas' }}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Row 2: Top Alerts, MITRE, & Assets */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-none h-[220px]">
                
                {/* Top Alert Names */}
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex flex-col">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 truncate">Top Signatures Triggered</h3>
                  <div className="flex-1 min-h-0">
                    <ReactECharts 
                      option={{
                        tooltip: {
                          trigger: 'axis',
                          axisPointer: { type: 'shadow' },
                          backgroundColor: isDark ? '#111827' : '#ffffff',
                          borderColor: isDark ? '#374151' : '#e5e7eb',
                          textStyle: { color: isDark ? '#d1d5db' : '#374151' },
                          formatter: (params: any) => {
                            const param = params[0];
                            const dataItem = topAlertsData[param.dataIndex];
                            const displayLabel = /^[T][A\d]/.test(dataItem.fullName) ? getMitreName(dataItem.fullName) : dataItem.fullName;
                            return `<div class="font-semibold mb-1">${displayLabel}</div><div class="text-gray-500">Count: <span class="font-bold text-gray-900 dark:text-white">${param.value}</span></div>`;
                          }
                        },
                        grid: { top: 0, right: 20, bottom: 0, left: 0, containLabel: true },
                        xAxis: { type: 'value', show: false },
                        yAxis: {
                          type: 'category',
                          data: topAlertsData.map(d => d.name),
                          axisLabel: { color: '#6b7280', fontSize: 11, width: 160, overflow: 'truncate' },
                          axisLine: { show: false },
                          axisTick: { show: false }
                        },
                        series: [
                          {
                            type: 'bar',
                            data: topAlertsData.map((d, i) => ({ value: d.count, itemStyle: { color: CHART_COLORS[i % CHART_COLORS.length] } })),
                            itemStyle: { borderRadius: [0, 4, 4, 0] },
                            barWidth: 16
                          }
                        ]
                      }}
                      onEvents={{
                        click: (params: any) => handleBarClick({ name: topAlertsData[params.dataIndex].fullName })
                      }}
                      style={{ height: '100%', width: '100%' }}
                      opts={{ renderer: 'canvas' }}
                    />
                  </div>
                </div>

                {/* MITRE Tactics */}
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex flex-col">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 truncate">Top MITRE Tactics</h3>
                  <div className="flex-1 min-h-0">
                    {mitreData.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-xs text-gray-500">No mapped tactics found.</div>
                    ) : (
                      <ReactECharts 
                        option={{
                          tooltip: {
                            trigger: 'axis',
                            axisPointer: { type: 'shadow' },
                            backgroundColor: isDark ? '#111827' : '#ffffff',
                            borderColor: isDark ? '#374151' : '#e5e7eb',
                            textStyle: { color: isDark ? '#d1d5db' : '#374151' },
                            formatter: (params: any) => {
                              const param = params[0];
                              const dataItem = mitreData[param.dataIndex];
                              const displayLabel = /^[T][A\d]/.test(dataItem.name) ? getMitreName(dataItem.name) : dataItem.name;
                              return `<div class="font-semibold mb-1">${displayLabel}</div><div class="text-gray-500">Count: <span class="font-bold text-gray-900 dark:text-white">${param.value}</span></div>`;
                            }
                          },
                          grid: { top: 0, right: 20, bottom: 0, left: 0, containLabel: true },
                          xAxis: { type: 'value', show: false },
                          yAxis: {
                            type: 'category',
                            data: mitreData.map(d => d.name),
                            axisLabel: { color: '#6b7280', fontSize: 11, width: 80, overflow: 'truncate' },
                            axisLine: { show: false },
                            axisTick: { show: false }
                          },
                          series: [
                            {
                              type: 'bar',
                              data: mitreData.map((d, i) => ({ value: d.count, itemStyle: { color: CHART_COLORS[(i + 2) % CHART_COLORS.length] } })),
                              itemStyle: { borderRadius: [0, 4, 4, 0] },
                              barWidth: 16
                            }
                          ]
                        }}
                        onEvents={{
                          click: (params: any) => handleBarClick({ name: mitreData[params.dataIndex].name })
                        }}
                        style={{ height: '100%', width: '100%' }}
                        opts={{ renderer: 'canvas' }}
                      />
                    )}
                  </div>
                </div>

                {/* Top Impacted Assets */}
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex flex-col">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 truncate">Top Impacted Assets</h3>
                  <div className="flex-1 min-h-0">
                    {topAssetsData.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-xs text-gray-500">No asset data found.</div>
                    ) : (
                      <ReactECharts 
                        option={{
                          tooltip: {
                            trigger: 'axis',
                            axisPointer: { type: 'shadow' },
                            backgroundColor: isDark ? '#111827' : '#ffffff',
                            borderColor: isDark ? '#374151' : '#e5e7eb',
                            textStyle: { color: isDark ? '#d1d5db' : '#374151' },
                            formatter: (params: any) => {
                              const param = params[0];
                              const dataItem = topAssetsData[param.dataIndex];
                              return `<div class="font-semibold mb-1">${dataItem.fullName}</div><div class="text-gray-500">Count: <span class="font-bold text-gray-900 dark:text-white">${param.value}</span></div>`;
                            }
                          },
                          grid: { top: 0, right: 20, bottom: 0, left: 0, containLabel: true },
                          xAxis: { type: 'value', show: false },
                          yAxis: {
                            type: 'category',
                            data: topAssetsData.map(d => d.name),
                            axisLabel: { color: '#6b7280', fontSize: 11, width: 100, overflow: 'truncate' },
                            axisLine: { show: false },
                            axisTick: { show: false }
                          },
                          series: [
                            {
                              type: 'bar',
                              data: topAssetsData.map((d, i) => ({ value: d.count, itemStyle: { color: CHART_COLORS[(i + 4) % CHART_COLORS.length] } })),
                              itemStyle: { borderRadius: [0, 4, 4, 0] },
                              barWidth: 16
                            }
                          ]
                        }}
                        onEvents={{
                          click: (params: any) => handleBarClick({ name: topAssetsData[params.dataIndex].fullName })
                        }}
                        style={{ height: '100%', width: '100%' }}
                        opts={{ renderer: 'canvas' }}
                      />
                    )}
                  </div>
                </div>

              </div>

              {/* Table Section */}
              <div className="flex-1 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 flex flex-col min-h-[300px]">
                <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center flex-none">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Alert Feed</h3>
                  
                  {selectedIP && (
                    <div className="flex items-center gap-2 px-3 py-1 bg-nw-red/10 text-nw-red rounded-full text-xs font-medium">
                      <Filter className="w-3 h-3" />
                      IP: {selectedIP}
                      <button onClick={() => setSelectedIP(null)} className="hover:bg-nw-red/20 p-0.5 rounded-full ml-1 transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
                
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-left border-collapse table-fixed">
                    <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800/50 text-xs uppercase text-gray-500 dark:text-gray-400 z-10">
                      <tr>
                        <th className="px-4 py-3 font-medium w-32">Time</th>
                        <th className="px-4 py-3 font-medium w-24">Severity</th>
                        <th className="px-4 py-3 font-medium w-64">Name</th>
                        <th className="px-4 py-3 font-medium w-40">Source</th>
                        <th className="px-4 py-3 font-medium w-40">Dest</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-800 text-sm">
                      {filteredAlerts.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                            <p>No alerts found matching the current filters.</p>
                          </td>
                        </tr>
                      ) : (
                        filteredAlerts.map((alert) => {
                          const firstEvent = alert.events?.[0] || {};
                          const srcId = getSourceIdentity(firstEvent);
                          const dstId = getDestIdentity(firstEvent);

                          return (
                            <tr 
                              key={alert.id} 
                              onClick={() => setSelectedAlertDetails(alert)}
                              className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors group cursor-pointer"
                            >
                              <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap truncate">
                                {formatDateSafe(alert)}
                              </td>
                              <td className="px-4 py-3 truncate">
                                <span 
                                  className="px-2 py-1 rounded-md text-xs font-medium"
                                  style={{ 
                                    backgroundColor: `${SEVERITY_COLORS[alert.severity]}20`,
                                    color: SEVERITY_COLORS[alert.severity] 
                                  }}
                                >
                                  {SEVERITY_LABELS[alert.severity] || 'Unknown'}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="font-medium text-gray-900 dark:text-gray-200 truncate" title={alert.moduleName}>
                                  {alert.moduleName}
                                </div>
                                {(alert.tactics?.length || alert.techniques?.length) ? (
                                  <div className="flex flex-wrap gap-1 mt-1.5">
                                    {alert.tactics?.map(tactic => (
                                      <span 
                                        key={tactic} 
                                        title={`Tactic: ${getMitreName(tactic)}`}
                                        className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-[10px] font-semibold border border-blue-200 dark:border-blue-800 cursor-help"
                                      >
                                        {tactic}
                                      </span>
                                    ))}
                                    {alert.techniques?.map(tech => (
                                      <span 
                                        key={tech} 
                                        title={`Technique: ${getMitreName(tech)}`}
                                        className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded text-[10px] font-semibold border border-purple-200 dark:border-purple-800 cursor-help"
                                      >
                                        {tech}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                              </td>
                              <td className="px-4 py-3 truncate" onClick={(e) => e.stopPropagation()}>
                                {srcId ? (
                                  <button 
                                    onClick={() => setSelectedIP(srcId)}
                                    className={`hover:text-nw-red transition-colors truncate w-full text-left ${selectedIP === srcId ? 'text-nw-red font-semibold' : 'text-gray-600 dark:text-gray-300'}`}
                                    title={srcId}
                                  >
                                    {srcId}
                                  </button>
                                ) : <span className="text-gray-500">-</span>}
                              </td>
                              <td className="px-4 py-3 truncate" onClick={(e) => e.stopPropagation()}>
                                {dstId ? (
                                  <button 
                                    onClick={() => setSelectedIP(dstId)}
                                    className={`hover:text-nw-red transition-colors truncate w-full text-left ${selectedIP === dstId ? 'text-nw-red font-semibold' : 'text-gray-600 dark:text-gray-300'}`}
                                    title={dstId}
                                  >
                                    {dstId}
                                  </button>
                                ) : <span className="text-gray-500">-</span>}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Right Column: Timeline */}
            <div className="w-full lg:w-80 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 flex flex-col h-[600px] lg:h-auto flex-none">
              <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Alert Timeline</h3>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4">
                <div className="relative border-l-2 border-gray-200 dark:border-gray-800 ml-3 space-y-6 pb-4">
                  {filteredAlerts.slice(0, 50).map((alert, idx) => {
                    const firstEvent = alert.events?.[0] || {};
                    const color = SEVERITY_COLORS[alert.severity] || '#9ca3af';
                    const srcId = getSourceIdentity(firstEvent);
                    const dstId = getDestIdentity(firstEvent);
                    
                    // Helper to safely extract the first available field that isn't null or '-'
                    const getField = (keys: string[]) => {
                      for (const k of keys) {
                        const val = firstEvent[k];
                        if (val && val !== '-') {
                          return {
                            key: k,
                            value: Array.isArray(val) ? val : [String(val)]
                          };
                        }
                      }
                      return null;
                    };

                    // Extract requested context fields
                    const domainObj = getField(['domain', 'domain_dst', 'domain_src']);
                    const userObj = getField(['username', 'user_src', 'user_dst', 'ad_username_src', 'ad_username_dst']);
                    const fileObj = getField(['filename', 'attachment']);
                    const countrySrcObj = getField(['country_src']);
                    const countryDstObj = getField(['country_dst']);
                    const sslCaObj = getField(['ssl_ca']);
                    const sslSubjectObj = getField(['ssl_subject']);
                    const clientObj = getField(['client']);

                    const formatTooltip = (obj: { key: string, value: string[] } | null, label: string) => {
                      if (!obj) return '';
                      const valuesStr = obj.value.length > 1 ? `\n  - ${obj.value.join('\n  - ')}` : ` ${obj.value[0]}`;
                      return `${label}:${valuesStr}`;
                    };

                    const formatDisplay = (obj: { key: string, value: string[] } | null) => {
                      if (!obj) return '';
                      return obj.value.length > 1 ? `${obj.value[0]} (+${obj.value.length - 1})` : obj.value[0];
                    };

                    const domainStr = formatDisplay(domainObj);
                    const userStr = formatDisplay(userObj);
                    const fileStr = formatDisplay(fileObj);
                    const sslCaStr = formatDisplay(sslCaObj);
                    const sslSubjectStr = formatDisplay(sslSubjectObj);
                    const clientStr = formatDisplay(clientObj);

                    // Format country (show direction if both exist and differ, else just show the one available)
                    let countryStr = null;
                    let countryTooltip = '';
                    if (countrySrcObj && countryDstObj && countrySrcObj.value[0] !== countryDstObj.value[0]) {
                      countryStr = `${countrySrcObj.value[0]} → ${countryDstObj.value[0]}`;
                      countryTooltip = `Country: ${countrySrcObj.value[0]} → ${countryDstObj.value[0]}`;
                    } else if (countrySrcObj || countryDstObj) {
                      countryStr = countrySrcObj ? countrySrcObj.value[0] : (countryDstObj ? countryDstObj.value[0] : null);
                      countryTooltip = formatTooltip(countrySrcObj || countryDstObj, 'Country');
                    }
                    
                    return (
                      <div 
                        key={`${alert.id}-${idx}`} 
                        className="relative pl-6 group cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 p-2 -ml-2 rounded-lg transition-colors"
                        onClick={() => setSelectedAlertDetails(alert)}
                      >
                        <div 
                          className="absolute left-[-1px] top-3 w-4 h-4 rounded-full border-4 border-white dark:border-gray-900"
                          style={{ backgroundColor: color }}
                        />
                        
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {formatDistanceToNow(getAlertTimeSafe(alert), { addSuffix: true })} ({format(getAlertTimeSafe(alert), 'yyyy-MM-dd HH:mm:ss')})
                          </span>
                          <h4 className="text-sm font-medium text-gray-900 dark:text-white leading-tight">
                            {alert.moduleName}
                          </h4>

                          {/* MITRE Tags */}
                          {(alert.tactics?.length || alert.techniques?.length) ? (
                            <div className="flex flex-wrap gap-1 mt-1">
                                {alert.tactics?.map(tactic => (
                                    <span 
                                      key={tactic} 
                                      title={`Tactic: ${getMitreName(tactic)}`}
                                      className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-[10px] font-semibold border border-blue-200 dark:border-blue-800 cursor-help"
                                    >
                                        {tactic}
                                    </span>
                                ))}
                                {alert.techniques?.map(tech => (
                                    <span 
                                      key={tech} 
                                      title={`Technique: ${getMitreName(tech)}`}
                                      className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded text-[10px] font-semibold border border-purple-200 dark:border-purple-800 cursor-help"
                                    >
                                        {tech}
                                    </span>
                                ))}
                            </div>
                          ) : null}

                          {/* Extracted Context Badges */}
                          {(domainStr || userStr || fileStr || countryStr || sslCaStr || sslSubjectStr || clientStr) && (
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {userStr && (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded text-[10px] font-medium border border-gray-200 dark:border-gray-700 whitespace-pre" title={formatTooltip(userObj, 'User')}>
                                  <User className="w-3 h-3 flex-none" />
                                  <span className="truncate max-w-[120px]">{userStr}</span>
                                </span>
                              )}
                              {domainStr && (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded text-[10px] font-medium border border-gray-200 dark:border-gray-700 whitespace-pre" title={formatTooltip(domainObj, 'Domain')}>
                                  <Globe className="w-3 h-3 flex-none" />
                                  <span className="truncate max-w-[120px]">{domainStr}</span>
                                </span>
                              )}
                              {fileStr && (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded text-[10px] font-medium border border-gray-200 dark:border-gray-700 whitespace-pre" title={formatTooltip(fileObj, 'File')}>
                                  <FileText className="w-3 h-3 flex-none" />
                                  <span className="truncate max-w-[120px]">{fileStr}</span>
                                </span>
                              )}
                              {countryStr && (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded text-[10px] font-medium border border-gray-200 dark:border-gray-700 whitespace-pre" title={countryTooltip}>
                                  <MapPin className="w-3 h-3 flex-none" />
                                  <span className="truncate max-w-[120px]">{countryStr}</span>
                                </span>
                              )}
                              {sslCaStr && (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded text-[10px] font-medium border border-gray-200 dark:border-gray-700 whitespace-pre" title={formatTooltip(sslCaObj, 'SSL CA')}>
                                  <Lock className="w-3 h-3 flex-none" />
                                  <span className="truncate max-w-[120px]">{sslCaStr}</span>
                                </span>
                              )}
                              {sslSubjectStr && (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded text-[10px] font-medium border border-gray-200 dark:border-gray-700 whitespace-pre" title={formatTooltip(sslSubjectObj, 'SSL Subject')}>
                                  <Lock className="w-3 h-3 flex-none" />
                                  <span className="truncate max-w-[120px]">{sslSubjectStr}</span>
                                </span>
                              )}
                              {clientStr && (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded text-[10px] font-medium border border-gray-200 dark:border-gray-700 whitespace-pre" title={formatTooltip(clientObj, 'Client')}>
                                  <Monitor className="w-3 h-3 flex-none" />
                                  <span className="truncate max-w-[120px]">{clientStr}</span>
                                </span>
                              )}
                            </div>
                          )}
                          
                          {/* Source -> Dest Identities */}
                          {(srcId || dstId) && (
                            <div className="flex items-center gap-2 mt-2 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 p-2 rounded-md border border-gray-100 dark:border-gray-800">
                              {srcId && (
                                <span className="truncate max-w-[100px]" title={srcId}>{srcId}</span>
                              )}
                              {srcId && dstId && (
                                <ArrowRight className="w-3 h-3 flex-none text-gray-400" />
                              )}
                              {dstId && (
                                <span className="truncate max-w-[100px]" title={dstId}>{dstId}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  
                  {filteredAlerts.length === 0 && (
                    <div className="pl-6 text-sm text-gray-500">No events to display</div>
                  )}
                </div>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}