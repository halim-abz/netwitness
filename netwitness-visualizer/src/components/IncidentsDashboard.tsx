import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Activity, Check, 
  Clock, Copy, FileJson, Filter, Search, Server, Shield, Target, X,
  AlertOctagon, List, FileText
} from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import { format, formatDistanceToNow } from 'date-fns';
import { MITRE_DICT } from '../lib/mitreDict';
import { AlertsDashboardProps, Alert, AlertEvent } from './AlertsDashboard';

// --- Types & Interfaces ---

export interface IncidentsDashboardProps extends AlertsDashboardProps {
  onNavigateToAlerts?: (filter: { alertId?: string, ip?: string }) => void;
}

export interface Incident {
  id: string;
  title: string;
  summary: string | null;
  priority: string;
  riskScore: number;
  status: string;
  alertCount: number;
  averageAlertRiskScore: number;
  sealed: boolean;
  created: string;
  lastUpdated: string;
  lastUpdatedBy: string | null;
  assignee: string | null;
  sources: string[];
  categories: string[] | null;
  journalEntries: any[] | null;
  createdBy: string;
  eventCount: number;
  alertMeta: {
    SourceIp?: string[];
    DestinationIp?: string[];
    [key: string]: string[] | undefined;
  } | null;
  tactics: string[];
  techniques: string[];
}

// --- Constants ---

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_YEAR = 365 * MS_PER_DAY;

const PRIORITY_COLORS: Record<string, string> = {
  'Low': '#3b82f6', // Blue
  'Medium': '#eab308', // Yellow
  'High': '#f97316', // Orange
  'Critical': '#ef4444', // Red
};

const STATUS_COLORS: Record<string, string> = {
  'New': '#3b82f6', // Blue
  'Assigned': '#d946ef', // Fuschia
  'Reopen': '#6366f1', // Indigo
  'InProgress': '#f59e0b', // Amber
  'Closed': '#10b981', // Emerald
  'ClosedFalsePositive': '#6b7280', // Gray
  'RemediationRequested': '#8b5cf6', // Purple
  'RemediationComplete': '#14b8a6', // Teal
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

const getIncidentTimeSafe = (incident: Partial<Incident>): Date => {
  if (incident.created) {
    const d = new Date(incident.created);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date(); 
};

const formatDateSafe = (incident: Partial<Incident>): string => {
  try {
    return format(getIncidentTimeSafe(incident), 'MMM dd, HH:mm:ss');
  } catch {
    return 'Invalid Date';
  }
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

const SEVERITY_LABELS: Record<number, string> = {
  1: 'Low',
  2: 'Medium',
  3: 'High',
  4: 'Critical',
};

const SEVERITY_COLORS: Record<number, string> = {
  1: '#3b82f6', // Low - Blue
  2: '#eab308', // Medium - Yellow
  3: '#f97316', // High - Orange
  4: '#ef4444', // Critical - Red
};

// --- Sub-Components ---

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

interface IncidentDrawerProps {
  incident: Incident | null;
  onClose: () => void;
  host: string;
  port?: string;
  username: string;
  password?: string;
  onIPClick?: (ip: string) => void;
  onAlertClick?: (alertId: string) => void;
}

const IncidentDrawer: React.FC<IncidentDrawerProps> = ({ incident, onClose, host, port, username, password, onIPClick, onAlertClick }) => {
  const [copied, setCopied] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  
  useEffect(() => {
    setCopied(false);
    if (incident) {
      fetchIncidentAlerts();
    } else {
      setAlerts([]);
    }
  }, [incident]);

  const fetchIncidentAlerts = async () => {
    if (!incident) return;
    setLoadingAlerts(true);
    setAlertsError(null);
    try {
      const response = await fetch(`/api/incidents/${encodeURIComponent(incident.id)}/alerts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, port, username, password })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Unknown server error' }));
        throw new Error(errData.error || `Failed to fetch incident alerts: ${response.statusText}`);
      }

      const data = await response.json();
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
          moduleName: String(item.title || originalHeaders.name || item.name || 'Unknown Alert'),
          time: (item.created || originalHeaders.timestamp || item.timestamp || item.receivedTime) as string | number,
          tactics: (item.tactics || originalAlert.tactics || []) as string[],
          techniques: (item.techniques || originalAlert.techniques || []) as string[],
          events
        };
      });
      
      setAlerts(alertsList);
    } catch (err: unknown) {
      setAlertsError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setLoadingAlerts(false);
    }
  };

  if (!incident) return null;
  
  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(incident, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const priorityColor = PRIORITY_COLORS[incident.priority] || '#9ca3af';
  const statusColor = STATUS_COLORS[incident.status] || '#9ca3af';

  const renderMetadataLink = (key: string, value: string) => {
    const baseUrl = (import.meta.env.VITE_NW_NAVIGATE_URL || 'https://nw-head-node/investigate/navigate').replace(/\/$/, '');
    const isIPv4 = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(value);
    const isIPv6 = /^[0-9a-fA-F:]+$/.test(value) && value.includes(':');
    const isNumber = !isNaN(Number(value)) && value.trim() !== '';
    const formattedValue = (isIPv4 || isIPv6 || isNumber) ? value : `'${value}'`;
    const investigateUrl = `${baseUrl}/query/${encodeURIComponent(key)}=${encodeURIComponent(formattedValue)}`;

    return (
      <div className="flex items-center gap-2 group">
        <span 
          className={`block text-sm font-semibold truncate ${
            (key === 'ip.src' || key === 'ip.dst') && onIPClick 
              ? 'text-nw-red cursor-pointer hover:underline' 
              : 'text-gray-900 dark:text-gray-200'
          }`}
          title={value}
          onClick={() => {
            if ((key === 'ip.src' || key === 'ip.dst') && onIPClick) {
              onIPClick(value);
            }
          }}
        >
          {value}
        </span>
        <a 
          href={investigateUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-gray-400 hover:text-nw-red"
          title={`Investigate ${key} in NetWitness`}
          onClick={(e) => e.stopPropagation()}
        >
          <Search className="w-3 h-3" />
        </a>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div 
        className="absolute inset-0 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm transition-opacity" 
        onClick={onClose} 
      />
      
      <div className="relative w-full max-w-3xl bg-white dark:bg-gray-900 h-full shadow-2xl flex flex-col border-l border-gray-200 dark:border-gray-800 transform transition-transform duration-300 ease-in-out">
        <div className="flex-none px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 flex justify-between items-start gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span 
                className="px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider"
                style={{ 
                  backgroundColor: `${priorityColor}20`,
                  color: priorityColor,
                  border: `1px solid ${priorityColor}40`
                }}
              >
                {incident.priority} (Score: {incident.riskScore})
              </span>
              <span 
                className="px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider"
                style={{ 
                  backgroundColor: `${statusColor}20`,
                  color: statusColor,
                  border: `1px solid ${statusColor}40`
                }}
              >
                {incident.status}
              </span>
              <span className="text-sm text-gray-500 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {formatDateSafe(incident)}
              </span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white leading-tight mt-2">
              {incident.title}
            </h2>
            <p className="text-xs text-gray-400 mt-1 font-mono">ID: {incident.id}</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors flex-none"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          
          {incident.summary && (
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-2">Summary</h3>
              <p className="text-sm text-gray-700 dark:text-gray-300">{incident.summary}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Sources</p>
              <div className="flex flex-wrap gap-1">
                {incident.sources?.map(s => (
                  <span key={s} className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-xs text-gray-800 dark:text-gray-200">{s}</span>
                ))}
              </div>
            </div>
            <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Assignee</p>
              <p className="text-base font-medium text-gray-900 dark:text-gray-200 break-all">
                {incident.assignee || 'Unassigned'}
              </p>
            </div>
          </div>

          {(incident.tactics?.length || incident.techniques?.length) ? (
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <Target className="w-4 h-4 text-nw-red" />
                MITRE ATT&CK Mapping
              </h3>
              <div className="flex flex-wrap gap-2">
                {incident.tactics?.map(t => (
                  <div key={t} className="px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg text-sm font-medium border border-blue-200 dark:border-blue-800/50">
                    {getMitreName(t)}
                  </div>
                ))}
                {incident.techniques?.map(t => (
                  <div key={t} className="px-3 py-1.5 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 rounded-lg text-sm font-medium border border-purple-200 dark:border-purple-800/50">
                    {getMitreName(t)}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {incident.alertMeta && Object.keys(incident.alertMeta).length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <Server className="w-4 h-4 text-nw-red" />
                Incident Metadata
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-6 bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800">
                {Object.entries(incident.alertMeta).map(([key, values]) => {
                  if (!values || values.length === 0) return null;
                  const displayKey = key.replace(/_/g, ' ');
                  // Map common keys to NetWitness query keys if needed
                  let queryKey = key.toLowerCase();
                  if (queryKey === 'sourceip') queryKey = 'ip.src';
                  if (queryKey === 'destinationip') queryKey = 'ip.dst';

                  return (
                    <div key={key} className="flex flex-col gap-1">
                      <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5" title={displayKey}>
                        {displayKey}
                      </span>
                      <div className="flex flex-col gap-1">
                        {values.map((val, idx) => (
                          <div key={idx}>
                            {renderMetadataLink(queryKey, val)}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <List className="w-4 h-4 text-nw-red" />
              Related Alerts ({incident.alertCount})
            </h3>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              {loadingAlerts ? (
                <div className="p-8 flex justify-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-nw-red"></div>
                </div>
              ) : alertsError ? (
                <div className="p-4 text-sm text-red-500">{alertsError}</div>
              ) : alerts.length === 0 ? (
                <div className="p-4 text-sm text-gray-500 text-center">No alerts found for this incident.</div>
              ) : (
                <div className="max-h-96 overflow-y-auto">
                  <table className="w-full text-left border-collapse table-fixed">
                    <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800/50 text-xs uppercase text-gray-500 dark:text-gray-400 z-10">
                      <tr>
                        <th className="px-4 py-2 font-medium w-32">Time</th>
                        <th className="px-4 py-2 font-medium w-24">Severity</th>
                        <th className="px-4 py-2 font-medium">Name</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-800 text-sm">
                      {alerts.map((alert) => (
                        <tr 
                          key={alert.id} 
                          className={`hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors ${onAlertClick ? 'cursor-pointer' : ''}`}
                          onClick={() => onAlertClick && onAlertClick(alert.id)}
                        >
                          <td className="px-4 py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap truncate">
                            {formatDateSafe(alert)}
                          </td>
                          <td className="px-4 py-2 truncate">
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
                          <td className="px-4 py-2 truncate text-gray-900 dark:text-gray-200" title={alert.moduleName}>
                            {alert.moduleName}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {incident.journalEntries && incident.journalEntries.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4 text-nw-red" />
                Journal Entries
              </h3>
              <div className="space-y-3">
                {incident.journalEntries.map((entry, idx) => (
                  <div key={idx} className="p-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-semibold text-gray-900 dark:text-gray-200">{entry.author || 'Unknown Author'}</span>
                      <div className="flex items-center gap-2">
                        {entry.milestone && entry.milestone !== 'None' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50 uppercase tracking-wider">
                            {entry.milestone}
                          </span>
                        )}
                        <span className="text-xs text-gray-500">{entry.created ? formatDateSafe({ created: entry.created }) : ''}</span>
                      </div>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{entry.notes || entry.comment || JSON.stringify(entry)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

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
                {JSON.stringify(incident, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Main Component ---

export default function IncidentsDashboard({ host, port, username, password, isDark, queryTrigger, onNavigateToAlerts }: IncidentsDashboardProps) {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [timeRange, setTimeRange] = useState(TIME_RANGES[2]); 
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIP, setSelectedIP] = useState<string | null>(null);
  const handleIPClick = (ip: string) => {
    if (onNavigateToAlerts) {
      onNavigateToAlerts({ ip });
    } else {
      setSelectedIP(ip);
    }
  };

  const handleAlertClick = (alertId: string) => {
    if (onNavigateToAlerts) {
      onNavigateToAlerts({ alertId });
    }
  };
  
  const [filterPriority, setFilterPriority] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [filterAssignee, setFilterAssignee] = useState<string>('All');
  const [showFilters, setShowFilters] = useState(false);
  
  const [selectedIncidentDetails, setSelectedIncidentDetails] = useState<Incident | null>(null);

  useEffect(() => {
    const fetchIncidents = async () => {
      if (!queryTrigger) return;

      if (!host || !username || !password) {
        setError("Missing connection details. Please configure them in the sidebar.");
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/incidents', {
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
          throw new Error(errData.error || `Failed to fetch incidents: ${response.statusText}`);
        }

        const data = await response.json();
        
        let rawItems: any[] = [];
        if (data && Array.isArray(data.items)) {
          rawItems = data.items;
        } else if (Array.isArray(data)) {
          rawItems = data;
        }

        const processAlertMeta = (meta: any) => {
          if (!meta) return null;
          const processed: any = {};
          for (const [k, v] of Object.entries(meta)) {
            if (Array.isArray(v)) {
              processed[k] = v.flatMap((val: any) => typeof val === 'string' ? val.split(',').map(s => s.trim()) : val);
            } else if (typeof v === 'string') {
              processed[k] = v.split(',').map(s => s.trim());
            } else {
              processed[k] = v;
            }
          }
          return processed;
        };

        const incidentsList: Incident[] = rawItems.map((item) => {
          return {
            id: item.id || '',
            title: item.title || 'Untitled Incident',
            summary: item.summary || null,
            priority: item.priority || 'Low',
            riskScore: item.riskScore || 0,
            status: item.status || 'New',
            alertCount: item.alertCount || 0,
            averageAlertRiskScore: item.averageAlertRiskScore || 0,
            sealed: item.sealed || false,
            created: item.created || new Date().toISOString(),
            lastUpdated: item.lastUpdated || new Date().toISOString(),
            lastUpdatedBy: item.lastUpdatedBy || null,
            assignee: item.assignee || null,
            sources: item.sources || [],
            categories: item.categories || [],
            journalEntries: item.journalEntries || [],
            createdBy: item.createdBy || 'Unknown',
            eventCount: item.eventCount || 0,
            alertMeta: processAlertMeta(item.alertMeta),
            tactics: item.tactics || [],
            techniques: item.techniques || []
          };
        });
        
        incidentsList.sort((a, b) => getIncidentTimeSafe(b).getTime() - getIncidentTimeSafe(a).getTime());
        setIncidents(incidentsList);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      } finally {
        setIsLoading(false);
      }
    };

    fetchIncidents();
  }, [host, port, username, password, timeRange, queryTrigger]);

  const filteredIncidents = useMemo(() => {
    const lowerQuery = searchQuery.toLowerCase();
    
    return incidents.filter(incident => {
      // Text Search
      let matchesSearch = true;
      if (lowerQuery) {
        const metaValues = incident.alertMeta ? Object.values(incident.alertMeta).flat().join(' ') : '';
        const searchStr = `${incident.title} ${incident.id} ${incident.tactics?.join(' ')} ${incident.techniques?.join(' ')} ${metaValues}`.toLowerCase();
        matchesSearch = searchStr.includes(lowerQuery);
      }

      // IP Click Filter
      let matchesIP = true;
      if (selectedIP) {
        matchesIP = false;
        if (incident.alertMeta) {
          const ips = [
            ...(incident.alertMeta.SourceIp || []),
            ...(incident.alertMeta.DestinationIp || [])
          ];
          matchesIP = ips.includes(selectedIP);
        }
      }

      // Dropdown Filters
      const matchesPriority = filterPriority === 'All' || incident.priority === filterPriority;
      const matchesStatus = filterStatus === 'All' || incident.status === filterStatus;
      const assignee = incident.assignee || 'Unassigned';
      const matchesAssignee = filterAssignee === 'All' || assignee === filterAssignee;

      return matchesSearch && matchesIP && matchesPriority && matchesStatus && matchesAssignee;
    });
  }, [incidents, searchQuery, selectedIP, filterPriority, filterStatus, filterAssignee]);

  const uniquePriorities = useMemo(() => Array.from(new Set(incidents.map(i => i.priority))).sort(), [incidents]);
  const uniqueStatuses = useMemo(() => Array.from(new Set(incidents.map(i => i.status))).sort(), [incidents]);
  const uniqueAssignees = useMemo(() => Array.from(new Set(incidents.map(i => i.assignee || 'Unassigned'))).sort(), [incidents]);

  const kpis = useMemo(() => {
    const total = filteredIncidents.length;
    const criticalHigh = filteredIncidents.filter(a => a.priority === 'Critical' || a.priority === 'High').length;
    const openIncidents = filteredIncidents.filter(a => a.status === 'New' || a.status === 'In Progress').length;
    
    const ipCounts: Record<string, number> = {};
    filteredIncidents.forEach(incident => {
      if (incident.alertMeta) {
        const ips = [
          ...(incident.alertMeta.SourceIp || []),
          ...(incident.alertMeta.DestinationIp || [])
        ];
        ips.forEach(ip => {
          ipCounts[ip] = (ipCounts[ip] || 0) + 1;
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

    return { total, criticalHigh, openIncidents, topIP };
  }, [filteredIncidents]);

  const volumeData = useMemo(() => {
    const countsByDate: Record<string, { Low: number, Medium: number, High: number, Critical: number }> = {};
    const ascendingIncidents = [...filteredIncidents].sort((a, b) => getIncidentTimeSafe(a).getTime() - getIncidentTimeSafe(b).getTime());
    
    ascendingIncidents.forEach(a => {
      try {
        const date = format(getIncidentTimeSafe(a), 'MMM dd');
        if (!countsByDate[date]) {
          countsByDate[date] = { Low: 0, Medium: 0, High: 0, Critical: 0 };
        }
        
        const priority = a.priority as 'Low' | 'Medium' | 'High' | 'Critical';
        if (priority && countsByDate[date][priority] !== undefined) {
            countsByDate[date][priority] += 1;
        }
      } catch {
        // Silently skip invalid dates
      }
    });
    
    return Object.entries(countsByDate).map(([date, counts]) => ({ date, ...counts }));
  }, [filteredIncidents]);

  const totalTrendData = useMemo(() => {
    const data = volumeData.map(d => ({ value: d.Low + d.Medium + d.High + d.Critical }));
    if (data.length === 1) return [data[0], data[0]];
    return data;
  }, [volumeData]);

  const criticalHighTrendData = useMemo(() => {
    const data = volumeData.map(d => ({ value: d.High + d.Critical }));
    if (data.length === 1) return [data[0], data[0]];
    return data;
  }, [volumeData]);

  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredIncidents.forEach(a => {
      counts[a.status] = (counts[a.status] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value, color: STATUS_COLORS[name] || '#9ca3af' }))
      .filter(item => item.value > 0);
  }, [filteredIncidents]);

  const mitreData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredIncidents.forEach(a => {
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
  }, [filteredIncidents]);

  const topAssetsData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredIncidents.forEach(incident => {
      if (incident.alertMeta) {
        const ips = [
          ...(incident.alertMeta.SourceIp || []),
          ...(incident.alertMeta.DestinationIp || [])
        ];
        ips.forEach(ip => {
          counts[ip] = (counts[ip] || 0) + 1;
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
  }, [filteredIncidents]);

  const handleBarClick = useCallback((data: { name?: string }) => {
    if (data?.name) {
      setSearchQuery(data.name);
    }
  }, []);

  return (
    <div className="flex flex-col h-full w-full min-w-full overflow-hidden bg-gray-50 dark:bg-gray-950 relative">
      <IncidentDrawer 
        incident={selectedIncidentDetails} 
        onClose={() => setSelectedIncidentDetails(null)} 
        host={host}
        port={port}
        username={username}
        password={password}
        onIPClick={handleIPClick}
        onAlertClick={handleAlertClick}
      />
      
      {/* Header */}
      <div className="flex-none p-6 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <AlertOctagon className="w-6 h-6 text-nw-red" />
              Incidents Dashboard
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Monitor and investigate security incidents from NetWitness
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text"
                placeholder="Search incidents or MITRE..."
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
            
            <button 
              onClick={() => setShowFilters(!showFilters)}
              className={`p-2 rounded-lg transition-colors ${showFilters ? 'bg-nw-red text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
              title="Advanced Filters"
            >
              <Filter className="w-4 h-4" />
            </button>

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

        {showFilters && (
          <div className="flex flex-wrap gap-4 mb-6 p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm animate-in fade-in slide-in-from-top-2">
            <div className="flex flex-col gap-1.5 min-w-[150px]">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Priority</label>
              <select 
                value={filterPriority} 
                onChange={e => setFilterPriority(e.target.value)} 
                className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md px-2.5 py-1.5 text-sm text-gray-700 dark:text-gray-200 focus:ring-1 focus:ring-nw-red outline-none"
              >
                <option value="All">All Priorities</option>
                {uniquePriorities.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5 min-w-[150px]">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Status</label>
              <select 
                value={filterStatus} 
                onChange={e => setFilterStatus(e.target.value)} 
                className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md px-2.5 py-1.5 text-sm text-gray-700 dark:text-gray-200 focus:ring-1 focus:ring-nw-red outline-none"
              >
                <option value="All">All Statuses</option>
                {uniqueStatuses.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5 min-w-[150px]">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Assignee</label>
              <select 
                value={filterAssignee} 
                onChange={e => setFilterAssignee(e.target.value)} 
                className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md px-2.5 py-1.5 text-sm text-gray-700 dark:text-gray-200 focus:ring-1 focus:ring-nw-red outline-none"
              >
                <option value="All">All Assignees</option>
                {uniqueAssignees.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <button 
                onClick={() => {
                  setFilterPriority('All');
                  setFilterStatus('All');
                  setFilterAssignee('All');
                  setSearchQuery('');
                  setSelectedIP(null);
                }}
                className="text-xs text-nw-red hover:text-red-700 dark:hover:text-red-400 font-medium px-2 py-1.5"
              >
                Clear Filters
              </button>
            </div>
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard icon={AlertOctagon} label="Total Incidents" value={kpis.total} trendData={totalTrendData} trendColor="#3b82f6" />
          <KPICard icon={Activity} label="Critical / High" value={kpis.criticalHigh} color="text-red-500" trendData={criticalHighTrendData} trendColor="#ef4444" />
          <KPICard icon={Shield} label="Open Incidents" value={kpis.openIncidents} color="text-yellow-500" />
          <KPICard icon={Target} label="Top IP Impacted" value={kpis.topIP} />
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
            <AlertOctagon className="w-12 h-12 mb-4 opacity-50" />
            <p>Click "Run Query" in the sidebar to fetch incidents.</p>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-nw-red"></div>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-6 h-full">
            
            {/* Left Column: Dashlets & Table */}
            <div className="flex-1 flex flex-col gap-6 min-w-0">
              
              {/* Row 1: Volume Trend & Status */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-none h-[220px]">
                {/* Stacked Area Chart */}
                <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex flex-col">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Incident Trends</h3>
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
                          { name: 'Low', type: 'line', stack: 'Total', areaStyle: { opacity: 0.6 }, smooth: true, showSymbol: false, color: PRIORITY_COLORS['Low'], data: volumeData.map(d => d.Low) },
                          { name: 'Medium', type: 'line', stack: 'Total', areaStyle: { opacity: 0.6 }, smooth: true, showSymbol: false, color: PRIORITY_COLORS['Medium'], data: volumeData.map(d => d.Medium) },
                          { name: 'High', type: 'line', stack: 'Total', areaStyle: { opacity: 0.6 }, smooth: true, showSymbol: false, color: PRIORITY_COLORS['High'], data: volumeData.map(d => d.High) },
                          { name: 'Critical', type: 'line', stack: 'Total', areaStyle: { opacity: 0.6 }, smooth: true, showSymbol: false, color: PRIORITY_COLORS['Critical'], data: volumeData.map(d => d.Critical) }
                        ]
                      }}
                      style={{ height: '100%', width: '100%' }}
                      opts={{ renderer: 'canvas' }}
                    />
                  </div>
                </div>

                {/* Status Donut */}
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex flex-col">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Status</h3>
                  <div className="flex-1 min-h-0 relative">
                    {statusData.length === 0 ? (
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
                              data: statusData.map(d => ({ value: d.value, name: d.name, itemStyle: { color: d.color } }))
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

              {/* Row 2: MITRE & Assets */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-none h-[220px]">
                
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
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 truncate">Top Impacted IPs</h3>
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
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Incident Feed</h3>
                  
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
                        <th className="px-4 py-3 font-medium w-24">Priority</th>
                        <th className="px-4 py-3 font-medium w-24">Status</th>
                        <th className="px-4 py-3 font-medium w-32">Assignee</th>
                        <th className="px-4 py-3 font-medium w-64">Title</th>
                        <th className="px-4 py-3 font-medium w-20">Alerts</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-800 text-sm">
                      {filteredIncidents.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                            <p>No incidents found matching the current filters.</p>
                          </td>
                        </tr>
                      ) : (
                        filteredIncidents.map((incident) => {
                          const priorityColor = PRIORITY_COLORS[incident.priority] || '#9ca3af';
                          const statusColor = STATUS_COLORS[incident.status] || '#9ca3af';

                          return (
                            <tr 
                              key={incident.id} 
                              onClick={() => setSelectedIncidentDetails(incident)}
                              className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors group cursor-pointer"
                            >
                              <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap truncate">
                                {formatDateSafe(incident)}
                              </td>
                              <td className="px-4 py-3 truncate">
                                <span 
                                  className="px-2 py-1 rounded-md text-xs font-medium"
                                  style={{ 
                                    backgroundColor: `${priorityColor}20`,
                                    color: priorityColor 
                                  }}
                                >
                                  {incident.priority}
                                </span>
                              </td>
                              <td className="px-4 py-3 truncate">
                                <span 
                                  className="px-2 py-1 rounded-md text-xs font-medium"
                                  style={{ 
                                    backgroundColor: `${statusColor}20`,
                                    color: statusColor 
                                  }}
                                >
                                  {incident.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 truncate text-gray-500 dark:text-gray-400">
                                {incident.assignee || 'Unassigned'}
                              </td>
                              <td className="px-4 py-3">
                                <div className="font-medium text-gray-900 dark:text-gray-200 truncate" title={incident.title}>
                                  {incident.title}
                                </div>
                                {(incident.tactics?.length || incident.techniques?.length) ? (
                                  <div className="flex flex-wrap gap-1 mt-1.5">
                                    {incident.tactics?.map(tactic => (
                                      <span 
                                        key={tactic} 
                                        title={`Tactic: ${getMitreName(tactic)}`}
                                        className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-[10px] font-semibold border border-blue-200 dark:border-blue-800 cursor-help"
                                      >
                                        {tactic}
                                      </span>
                                    ))}
                                    {incident.techniques?.map(tech => (
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
                              <td className="px-4 py-3 truncate text-gray-500 dark:text-gray-400">
                                {incident.alertCount}
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
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Incident Timeline</h3>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4">
                <div className="relative border-l-2 border-gray-200 dark:border-gray-800 ml-3 space-y-6 pb-4">
                  {filteredIncidents.slice(0, 50).map((incident, idx) => {
                    const color = PRIORITY_COLORS[incident.priority] || '#9ca3af';
                    
                    return (
                      <div 
                        key={`${incident.id}-${idx}`} 
                        className="relative pl-6 group cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 p-2 -ml-2 rounded-lg transition-colors"
                        onClick={() => setSelectedIncidentDetails(incident)}
                      >
                        <div 
                          className="absolute left-[-1px] top-3 w-4 h-4 rounded-full border-4 border-white dark:border-gray-900"
                          style={{ backgroundColor: color }}
                        />
                        
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {formatDistanceToNow(getIncidentTimeSafe(incident), { addSuffix: true })} ({format(getIncidentTimeSafe(incident), 'yyyy-MM-dd HH:mm:ss')})
                          </span>
                          <h4 className="text-sm font-medium text-gray-900 dark:text-white leading-tight">
                            {incident.title}
                          </h4>

                          {/* MITRE Tags */}
                          {(incident.tactics?.length || incident.techniques?.length) ? (
                            <div className="flex flex-wrap gap-1 mt-1">
                                {incident.tactics?.map(tactic => (
                                    <span 
                                      key={tactic} 
                                      title={`Tactic: ${getMitreName(tactic)}`}
                                      className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-[10px] font-semibold border border-blue-200 dark:border-blue-800 cursor-help"
                                    >
                                        {tactic}
                                    </span>
                                ))}
                                {incident.techniques?.map(tech => (
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
                          
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Status: {incident.status} | Alerts: {incident.alertCount}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  
                  {filteredIncidents.length === 0 && (
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
