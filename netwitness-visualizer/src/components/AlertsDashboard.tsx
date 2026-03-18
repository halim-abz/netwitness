import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Activity, AlertTriangle, ArrowRight, Calendar, Check, ChevronRight, 
  Clock, Copy, FileJson, Filter, Info, Search, Server, Shield, ShieldAlert, Target, X,
  Globe, User, FileText, MapPin, Lock, Monitor
} from 'lucide-react';
import { 
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, 
  ResponsiveContainer, Tooltip as RechartsTooltip, TooltipProps, XAxis, YAxis 
} from 'recharts';
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

const CustomTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
  if (active && payload && payload.length) {
    const rawLabel = label || payload[0].name;
    const displayLabel = /^[T][A\d]/.test(rawLabel) ? getMitreName(rawLabel) : rawLabel;
    return (
      <div className="bg-gray-900 text-white text-xs rounded shadow-lg p-2 border border-gray-800 z-50">
        <p className="font-semibold mb-1">{displayLabel}</p>
        <p className="text-gray-300">Count: <span className="text-white font-bold">{payload[0].value}</span></p>
      </div>
    );
  }
  return null;
};

const TrendTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-gray-900 text-white text-xs rounded shadow-lg p-3 border border-gray-800 z-50 min-w-[120px]">
        <p className="font-bold mb-2 pb-1 border-b border-gray-700">{label}</p>
        {[...payload].reverse().map((entry, index) => (
           <div key={index} className="flex justify-between items-center py-0.5 gap-4">
             <div className="flex items-center gap-1.5">
               <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color || entry.stroke }} />
               <span className="text-gray-300">{entry.name}</span>
             </div>
             <span className="font-semibold text-white">{entry.value}</span>
           </div>
        ))}
      </div>
    );
  }
  return null;
};

const KPICard = ({ icon: Icon, label, value, color = "text-nw-red" }: { icon: React.ElementType, label: string, value: string | number, color?: string }) => (
  <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800 flex items-center gap-4">
    <div className={`p-3 rounded-lg bg-gray-50 dark:bg-gray-800 ${color}`}>
      <Icon className="w-6 h-6" />
    </div>
    <div>
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
    </div>
  </div>
);

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
  
  const eventGridData = Object.entries(event).filter(([key, value]) => {
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
                eventGridData.map(([key, value]) => (
                  <div key={key}>
                    <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5 truncate" title={key}>
                      {key.replace(/_/g, ' ')}
                    </span>
                    <span className="block text-sm font-semibold text-gray-900 dark:text-gray-200 truncate" title={String(value)}>
                      {String(value)}
                    </span>
                  </div>
                ))
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
        const searchStr = `${alert.moduleName} ${alert.id} ${alert.tactics?.join(' ')} ${alert.techniques?.join(' ')}`.toLowerCase();
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
      .map(([name, count]) => ({ name, count }))
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
          <KPICard icon={AlertTriangle} label="Total Alerts" value={kpis.total} />
          <KPICard icon={Activity} label="Critical / High" value={kpis.criticalHigh} color="text-red-500" />
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
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={volumeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorLow" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={SEVERITY_COLORS[1]} stopOpacity={0.6}/>
                            <stop offset="95%" stopColor={SEVERITY_COLORS[1]} stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorMedium" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={SEVERITY_COLORS[2]} stopOpacity={0.6}/>
                            <stop offset="95%" stopColor={SEVERITY_COLORS[2]} stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorHigh" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={SEVERITY_COLORS[3]} stopOpacity={0.6}/>
                            <stop offset="95%" stopColor={SEVERITY_COLORS[3]} stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorCritical" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={SEVERITY_COLORS[4]} stopOpacity={0.6}/>
                            <stop offset="95%" stopColor={SEVERITY_COLORS[4]} stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? '#374151' : '#e5e7eb'} opacity={0.5} />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} />
                        <RechartsTooltip content={<TrendTooltip />} />
                        <Area type="monotone" dataKey="Low" stackId="1" stroke={SEVERITY_COLORS[1]} strokeWidth={2} fill="url(#colorLow)" />
                        <Area type="monotone" dataKey="Medium" stackId="1" stroke={SEVERITY_COLORS[2]} strokeWidth={2} fill="url(#colorMedium)" />
                        <Area type="monotone" dataKey="High" stackId="1" stroke={SEVERITY_COLORS[3]} strokeWidth={2} fill="url(#colorHigh)" />
                        <Area type="monotone" dataKey="Critical" stackId="1" stroke={SEVERITY_COLORS[4]} strokeWidth={2} fill="url(#colorCritical)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Severity Donut */}
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex flex-col">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Severity</h3>
                  <div className="flex-1 min-h-0 relative">
                    {severityData.length === 0 ? (
                      <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500">No Data</div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={severityData}
                            innerRadius="60%"
                            outerRadius="80%"
                            paddingAngle={5}
                            dataKey="value"
                            stroke="none"
                          >
                            {severityData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <RechartsTooltip content={<CustomTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>

              {/* Row 2: Top Alerts & MITRE */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-none h-[220px]">
                
                {/* Top Alert Names */}
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex flex-col">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Top Signatures Triggered</h3>
                  <div className="flex-1 min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topAlertsData} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} width={120} />
                        <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(156, 163, 175, 0.1)' }} />
                        <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={16} onClick={handleBarClick as any} className="cursor-pointer">
                          {topAlertsData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} className="hover:opacity-80 transition-opacity" />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* MITRE Tactics */}
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex flex-col">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Top MITRE Tactics</h3>
                  <div className="flex-1 min-h-0">
                    {mitreData.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-xs text-gray-500">No mapped tactics found.</div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={mitreData} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                          <XAxis type="number" hide />
                          <YAxis 
                            dataKey="name" 
                            type="category" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#6b7280', fontSize: 11 }} 
                            width={80} 
                          />
                          <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(156, 163, 175, 0.1)' }} />
                          <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={16} onClick={handleBarClick as any} className="cursor-pointer">
                            {mitreData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={CHART_COLORS[(index + 2) % CHART_COLORS.length]} className="hover:opacity-80 transition-opacity" />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
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
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800/50 text-xs uppercase text-gray-500 dark:text-gray-400 z-10">
                      <tr>
                        <th className="px-4 py-3 font-medium">Time</th>
                        <th className="px-4 py-3 font-medium">Severity</th>
                        <th className="px-4 py-3 font-medium">Name</th>
                        <th className="px-4 py-3 font-medium">Source</th>
                        <th className="px-4 py-3 font-medium">Dest</th>
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
                              <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                {formatDateSafe(alert)}
                              </td>
                              <td className="px-4 py-3">
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
                                <div className="font-medium text-gray-900 dark:text-gray-200 max-w-[200px] truncate" title={alert.moduleName}>
                                  {alert.moduleName}
                                </div>
                                {(alert.tactics?.length || alert.techniques?.length) ? (
                                  <div className="flex flex-wrap gap-1 mt-1.5">
                                    {alert.tactics?.map(tactic => (
                                      <span 
                                        key={tactic} 
                                        title={getMitreName(tactic)}
                                        className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-[10px] font-semibold border border-blue-200 dark:border-blue-800 cursor-help"
                                      >
                                        {tactic}
                                      </span>
                                    ))}
                                    {alert.techniques?.map(tech => (
                                      <span 
                                        key={tech} 
                                        title={getMitreName(tech)}
                                        className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded text-[10px] font-semibold border border-purple-200 dark:border-purple-800 cursor-help"
                                      >
                                        {tech}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                              </td>
                              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                {srcId ? (
                                  <button 
                                    onClick={() => setSelectedIP(srcId)}
                                    className={`hover:text-nw-red transition-colors ${selectedIP === srcId ? 'text-nw-red font-semibold' : 'text-gray-600 dark:text-gray-300'}`}
                                  >
                                    {srcId}
                                  </button>
                                ) : <span className="text-gray-500">-</span>}
                              </td>
                              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                {dstId ? (
                                  <button 
                                    onClick={() => setSelectedIP(dstId)}
                                    className={`hover:text-nw-red transition-colors ${selectedIP === dstId ? 'text-nw-red font-semibold' : 'text-gray-600 dark:text-gray-300'}`}
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
                        if (val && val !== '-') return String(val);
                      }
                      return null;
                    };

                    // Extract requested context fields
                    const domainStr = getField(['domain', 'domain_dst', 'domain_src']);
                    const userStr = getField(['username', 'user_src', 'user_dst', 'ad_username_src', 'ad_username_dst']);
                    const fileStr = getField(['filename', 'attachment']);
                    const countrySrc = getField(['country_src']);
                    const countryDst = getField(['country_dst']);
                    const sslCaStr = getField(['ssl_ca']);
                    const sslSubjectStr = getField(['ssl_subject']);
                    const clientStr = getField(['client']);

                    // Format country (show direction if both exist and differ, else just show the one available)
                    let countryStr = null;
                    if (countrySrc && countryDst && countrySrc !== countryDst) {
                      countryStr = `${countrySrc} → ${countryDst}`;
                    } else if (countrySrc || countryDst) {
                      countryStr = countrySrc || countryDst;
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
                            {formatDistanceToNow(getAlertTimeSafe(alert), { addSuffix: true })}
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
                                      title={getMitreName(tactic)}
                                      className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-[10px] font-semibold border border-blue-200 dark:border-blue-800 cursor-help"
                                    >
                                        {tactic}
                                    </span>
                                ))}
                                {alert.techniques?.map(tech => (
                                    <span 
                                      key={tech} 
                                      title={getMitreName(tech)}
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
                                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded text-[10px] font-medium border border-gray-200 dark:border-gray-700" title={userStr}>
                                  <User className="w-3 h-3 flex-none" />
                                  <span className="truncate max-w-[120px]">{userStr}</span>
                                </span>
                              )}
                              {domainStr && (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded text-[10px] font-medium border border-gray-200 dark:border-gray-700" title={domainStr}>
                                  <Globe className="w-3 h-3 flex-none" />
                                  <span className="truncate max-w-[120px]">{domainStr}</span>
                                </span>
                              )}
                              {fileStr && (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded text-[10px] font-medium border border-gray-200 dark:border-gray-700" title={fileStr}>
                                  <FileText className="w-3 h-3 flex-none" />
                                  <span className="truncate max-w-[120px]">{fileStr}</span>
                                </span>
                              )}
                              {countryStr && (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded text-[10px] font-medium border border-gray-200 dark:border-gray-700" title={countryStr}>
                                  <MapPin className="w-3 h-3 flex-none" />
                                  <span className="truncate max-w-[120px]">{countryStr}</span>
                                </span>
                              )}
                              {sslCaStr && (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded text-[10px] font-medium border border-gray-200 dark:border-gray-700" title={sslCaStr}>
                                  <Lock className="w-3 h-3 flex-none" />
                                  <span className="truncate max-w-[120px]">{sslCaStr}</span>
                                </span>
                              )}
                              {sslSubjectStr && (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded text-[10px] font-medium border border-gray-200 dark:border-gray-700" title={sslSubjectStr}>
                                  <Lock className="w-3 h-3 flex-none" />
                                  <span className="truncate max-w-[120px]">{sslSubjectStr}</span>
                                </span>
                              )}
                              {clientStr && (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded text-[10px] font-medium border border-gray-200 dark:border-gray-700" title={clientStr}>
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