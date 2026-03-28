import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2, Edit2, RefreshCw, LayoutDashboard, BarChart3, PieChart, LineChart, Table as TableIcon, Download, Upload, Activity, Radar as RadarIcon, ScatterChart as ScatterChartIcon, Layers, ZoomOut, GripVertical, AlertCircle, Lock } from 'lucide-react';
import { QueryConfig } from './Sidebar';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell, LineChart as RechartsLineChart, Line, AreaChart, Area, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend, ScatterChart, Scatter, ZAxis, ReferenceArea, RadialBarChart, RadialBar, Treemap } from 'recharts';
import { formatDistanceToNow } from 'date-fns';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  defaultDropAnimationSideEffects,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export interface DashletConfig {
  id: string;
  title: string;
  query: string;
  timeRange: string;
  size: number;
  visualizationType: 'bar' | 'pie' | 'line' | 'table' | 'area' | 'donut' | 'radar' | 'scatter' | 'radialBar' | 'treeMap' | 'stackedArea' | 'percentArea' | 'stackedBar';
  fieldName: string; // The metakey to extract
  valueType: 'sessions' | 'size'; // 1st flag
  sortOrder: 'order-ascending' | 'order-descending'; // 3rd flag
  mode?: 'summarized' | 'real-time';
  frequency?: string;
  topX?: number;
  showLegend?: boolean;
  showBrush?: boolean;
  visualSize?: 'small' | 'medium' | 'large' | 'full';
  refreshInterval?: number;
  colorPalette?: string;
}

interface CustomDashboardProps {
  latestConfig: QueryConfig | null;
}

const formatBytes = (bytes: number, decimals = 2) => {
  if (!+bytes) return '0 B';
  const isNegative = bytes < 0;
  const absBytes = Math.abs(bytes);
  if (absBytes < 1) return `${bytes} B`;
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(absBytes) / Math.log(k));
  return `${isNegative ? '-' : ''}${parseFloat((absBytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

const COLOR_PALETTES: Record<string, string[]> = {
  default: ['#BE3B37', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'],
  ocean: ['#0EA5E9', '#0284C7', '#0369A1', '#075985', '#0C4A6E'],
  forest: ['#10B981', '#059669', '#047857', '#065F46', '#064E3B'],
  sunset: ['#F59E0B', '#D97706', '#B45309', '#92400E', '#78350F'],
  purple: ['#8B5CF6', '#7C3AED', '#6D28D9', '#5B21B6', '#4C1D95'],
  monochrome: ['#6B7280', '#4B5563', '#374151', '#1F2937', '#111827']
};

const getDashletSizeClass = (visualSize?: string) => {
  switch (visualSize) {
    case 'small': return 'col-span-1';
    case 'large': return 'col-span-1 md:col-span-2 lg:col-span-3';
    case 'full': return 'col-span-1 md:col-span-2 lg:col-span-4';
    case 'medium':
    default: return 'col-span-1 md:col-span-2';
  }
};

const Dashlet = ({ config, latestConfig, onRemove, onEdit, dragHandleProps, isOverlay }: { config: DashletConfig, latestConfig: QueryConfig, onRemove: () => void, onEdit: () => void, dragHandleProps?: any, isOverlay?: boolean }) => {
  const [data, setData] = useState<any[]>([]);
  const [seriesKeys, setSeriesKeys] = useState<string[]>(['value']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Check for dark mode
  const [isDark, setIsDark] = useState(false);
  
  useEffect(() => {
    const checkDark = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };
    checkDark();
    
    const observer = new MutationObserver(checkDark);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    
    return () => observer.disconnect();
  }, []);

  // Zoom State
  const [refAreaLeft, setRefAreaLeft] = useState<string | number | null>(null);
  const [refAreaRight, setRefAreaRight] = useState<string | number | null>(null);
  const [left, setLeft] = useState<any>('dataMin');
  const [right, setRight] = useState<any>('dataMax');

  const zoom = () => {
    if (refAreaLeft === refAreaRight || refAreaRight === null) {
      setRefAreaLeft(null);
      setRefAreaRight(null);
      return;
    }

    setLeft(refAreaLeft);
    setRight(refAreaRight);
    setRefAreaLeft(null);
    setRefAreaRight(null);
  };

  const zoomOut = () => {
    setLeft('dataMin');
    setRight('dataMax');
    setRefAreaLeft(null);
    setRefAreaRight(null);
  };

  const filteredData = useMemo(() => {
    if (left === 'dataMin' || right === 'dataMax') return data;
    
    const leftIndex = data.findIndex(d => d.name === left);
    const rightIndex = data.findIndex(d => d.name === right);
    
    if (leftIndex === -1 || rightIndex === -1) return data;
    
    const start = Math.min(leftIndex, rightIndex);
    const end = Math.max(leftIndex, rightIndex);
    
    return data.slice(start, end + 1);
  }, [data, left, right]);

  const fetchData = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      if (config.mode === 'real-time') {
        const selectClause = config.valueType === 'size' ? `${config.fieldName},time,size` : `${config.fieldName},time`;
        let fullQuery = config.query;
        if (config.timeRange !== "all") {
          if (fullQuery && fullQuery.trim() !== '') {
            fullQuery = `(${fullQuery}) && time=rtp(latest,${config.timeRange})-u`;
          } else {
            fullQuery = `time=rtp(latest,${config.timeRange})-u`;
          }
        }

        const response = await fetch("/api/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            host: latestConfig.host,
            port: latestConfig.port,
            query: `select ${selectClause} where ${fullQuery}`,
            size: config.size,
            username: latestConfig.username,
            password: latestConfig.password,
          }),
          signal: abortControllerRef.current.signal
        });

        const rawResponse = await response.json();
        if (!response.ok) throw new Error(rawResponse.error || `HTTP error ${response.status}`);
        if (!rawResponse.results?.fields) throw new Error("No data returned");

        const sessionsMap = new Map<number, any>();
        rawResponse.results.fields.forEach((field: any) => {
          const groupId = field.group;
          let session = sessionsMap.get(groupId);
          if (!session) {
            session = { group: groupId };
            sessionsMap.set(groupId, session);
          }
          
          const existing = session[field.type];
          if (existing !== undefined) {
            if (Array.isArray(existing)) {
              if (!existing.includes(field.value)) existing.push(field.value);
            } else if (existing !== field.value) {
              session[field.type] = [existing, field.value];
            }
          } else {
            session[field.type] = field.value;
          }
        });

        const sessions = Array.from(sessionsMap.values());
        const aggregated: Record<string, any> = {};
        const allSeriesKeys = new Set<string>();
        const seriesTotals: Record<string, number> = {};

        const formatTimeBucket = (timeVal: any, range: string, freq?: string) => {
          if (!timeVal) return 'Unknown';
          let date: Date;
          if (typeof timeVal === 'number') {
            date = new Date(timeVal < 10000000000 ? timeVal * 1000 : timeVal);
          } else {
            date = new Date(timeVal);
          }
          if (isNaN(date.getTime())) return String(timeVal);

          const effectiveFreq = freq || (
            (range === '5m' || range === '15m' || range === '1h') ? '1m' :
            (range === '6h' || range === '24h') ? '1h' : '1d'
          );

          if (effectiveFreq === '1m') {
            return `${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
          } else if (effectiveFreq === '1h') {
            return `${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:00`;
          } else if (effectiveFreq === '15m') {
            const mins = Math.floor(date.getMinutes() / 15) * 15;
            return `${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
          } else if (effectiveFreq === '5m') {
            const mins = Math.floor(date.getMinutes() / 5) * 5;
            return `${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
          } else {
            return `${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
          }
        };

        sessions.forEach(session => {
          let timeVals = session['time'];
          if (timeVals === undefined) return;
          if (!Array.isArray(timeVals)) timeVals = [timeVals];
          timeVals = timeVals.map((v: any) => formatTimeBucket(v, config.timeRange, config.frequency));

          let fieldVals = session[config.fieldName];
          if (fieldVals === undefined) fieldVals = ['Unknown'];
          if (!Array.isArray(fieldVals)) fieldVals = [fieldVals];

          let yValue = 1;
          if (config.valueType === 'size') {
             const sizeRaw = session['size'];
             if (sizeRaw !== undefined) {
                yValue = Array.isArray(sizeRaw) ? parseFloat(sizeRaw[0]) : parseFloat(sizeRaw);
                if (isNaN(yValue)) yValue = 0;
             } else {
                yValue = 0;
             }
          }

          timeVals.forEach((tVal: any) => {
            const tStr = String(tVal);
            if (!aggregated[tStr]) {
              aggregated[tStr] = { name: tStr, _total: 0 };
            }
            
            fieldVals.forEach((fVal: any) => {
               const fStr = String(fVal);
               allSeriesKeys.add(fStr);
               
               if (!aggregated[tStr][fStr]) {
                 aggregated[tStr][fStr] = 0;
               }
               
               aggregated[tStr][fStr] += yValue;
               aggregated[tStr]._total += yValue;
               seriesTotals[fStr] = (seriesTotals[fStr] || 0) + yValue;
            });
          });
        });

        let aggregatedData = Object.values(aggregated);
        aggregatedData.sort((a, b) => a.name.localeCompare(b.name));

        setData(aggregatedData);
        
        const topX = config.topX || 50;
        const sortedSeries = Array.from(allSeriesKeys).sort((a, b) => seriesTotals[b] - seriesTotals[a]);
        setSeriesKeys(sortedSeries.slice(0, topX));
        setLastUpdated(new Date());
      } else {
        // Summarized mode (default)
        let fullQuery = config.query;
        if (config.timeRange !== "all") {
          // Only append AND if there is a query
          if (fullQuery && fullQuery.trim() !== '') {
            fullQuery = `(${fullQuery}) AND time=rtp(latest,${config.timeRange})-u`;
          } else {
            fullQuery = `time=rtp(latest,${config.timeRange})-u`;
          }
        }

        const flags = `${config.valueType || 'sessions'},sort-total,${config.sortOrder || 'order-descending'}`;

        const response = await fetch("/api/values", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            host: latestConfig.host,
            port: latestConfig.port,
            query: fullQuery,
            size: config.size,
            username: latestConfig.username,
            password: latestConfig.password,
            fieldName: config.fieldName || 'service',
            flags: flags
          }),
          signal: abortControllerRef.current.signal
        });

        const rawResponse = await response.json();
        
        if (!response.ok) {
          throw new Error(rawResponse.error || `HTTP error ${response.status}`);
        }

        // rawResponse is an array of { value: string, count: number }
        // We need to map it to { name: string, value: number } for the charts
        let aggregatedData = rawResponse.map((item: any) => ({
          name: item.value || 'Unknown',
          value: item.count || 0
        }));

        const topX = config.topX || 50;
        aggregatedData = aggregatedData.slice(0, topX);

        setData(aggregatedData);
        setSeriesKeys(['value']);
        setLastUpdated(new Date());
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [config, latestConfig]);

  useEffect(() => {
    fetchData();
    
    let intervalId: ReturnType<typeof setInterval>;
    if (config.refreshInterval && config.refreshInterval > 0) {
      intervalId = setInterval(() => {
        fetchData();
      }, config.refreshInterval * 60 * 1000);
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchData, config.refreshInterval]);

  const formatXAxisTick = (tickItem: any) => {
    if (typeof tickItem === 'string' && tickItem.match(/^\d{4}-\d{2}-\d{2}/)) {
      const parts = tickItem.split(' ');
      if (parts.length === 2) {
        return `${parts[0].substring(5)} ${parts[1]}`;
      }
      return tickItem.substring(5);
    }
    return tickItem;
  };

  const formatYAxisTick = (tickItem: any) => {
    if (config.valueType === 'size') {
      return formatBytes(tickItem, 0);
    }
    return tickItem;
  };

  const handleLegendClick = (e: any) => {
    const dataKey = e.dataKey || e.value;
    setHiddenSeries(prev => {
      const next = new Set(prev);
      if (next.has(dataKey)) {
        next.delete(dataKey);
      } else {
        next.add(dataKey);
      }
      return next;
    });
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const colors = COLOR_PALETTES[config.colorPalette || 'default'] || COLOR_PALETTES.default;
      const primaryColor = colors[0];
      
      const total = payload.reduce((sum: number, entry: any) => sum + (entry.value || 0), 0);
      
      return (
        <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border border-gray-200 dark:border-gray-800 p-3.5 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.4)] z-50 min-w-[220px] animate-in fade-in zoom-in-95 duration-200 ring-1 ring-black/5 dark:ring-white/5">
          {label && (
            <div className="flex items-center justify-between mb-3 border-b border-gray-100 dark:border-gray-800/50 pb-2.5">
              <p className="font-bold text-[10px] uppercase tracking-[0.15em] text-gray-400 dark:text-gray-500 truncate max-w-[180px]">{label}</p>
            </div>
          )}
          <div className="space-y-2.5">
            {payload.map((entry: any, index: number) => {
              const displayName = entry.dataKey === '_displayValue' ? entry.payload.name : entry.name;
              const displayValue = entry.dataKey === '_displayValue' ? entry.payload.value : entry.value;
              
              let dotColor = entry.payload?._color || entry.color || entry.fill || primaryColor;
              if (dotColor && dotColor.startsWith('url(')) {
                dotColor = primaryColor; // Fallback if _color is missing
              }

              return (
                <div key={index} className="flex items-center justify-between gap-6 group/item">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="w-2.5 h-2.5 rounded-full shadow-sm relative z-10" style={{ backgroundColor: dotColor }} />
                      <div className="absolute inset-0 rounded-full blur-[4px] opacity-40" style={{ backgroundColor: dotColor }} />
                    </div>
                    <span className="text-[11px] text-gray-600 dark:text-gray-300 font-bold truncate max-w-[140px] group-hover/item:text-gray-900 dark:group-hover/item:text-white transition-colors">{displayName}</span>
                  </div>
                  <span className="text-[12px] font-bold text-gray-900 dark:text-white font-mono tabular-nums">
                    {config.valueType === 'size' ? formatBytes(displayValue, 1) : displayValue.toLocaleString()}
                  </span>
                </div>
              );
            })}
            {payload.length > 1 && (
              <div className="flex items-center justify-between gap-6 pt-3 mt-1.5 border-t border-gray-100 dark:border-gray-800/50">
                <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.1em]">Total</span>
                <span className="text-[12px] font-bold text-[#BE3B37] font-mono tabular-nums">
                  {config.valueType === 'size' ? formatBytes(total, 1) : total.toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  const renderCustomLegend = (props: any) => {
    const { payload } = props;
    const colors = COLOR_PALETTES[config.colorPalette || 'default'] || COLOR_PALETTES.default;
    return (
      <div className="flex flex-wrap gap-x-5 gap-y-2 justify-end pt-4 pb-2">
        {payload.map((entry: any, index: number) => {
          const dataKey = entry.dataKey || entry.value;
          const isHidden = hiddenSeries.has(dataKey);
          
          let dotColor = entry.payload?._color || entry.color || entry.fill || colors[index % colors.length];
          if (dotColor && dotColor.startsWith('url(')) {
            dotColor = colors[index % colors.length];
          }

          return (
            <div 
              key={`item-${index}`} 
              className={`flex items-center gap-2 cursor-pointer transition-all duration-300 hover:opacity-80 ${isHidden ? 'opacity-30 grayscale' : 'opacity-100'}`}
              onClick={() => handleLegendClick(entry)}
            >
              <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: dotColor }} />
              <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider truncate max-w-[120px]" title={entry.value}>{entry.value}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const CustomTreemapContent = (props: any) => {
    const { x, y, width, height, name, value, fill, depth } = props;
    // Recharts treemap passes depth. depth 0 is the root, depth 1 are the actual items we want to render.
    // We only want to render the leaf nodes (depth === 1 in this simple data structure)
    if (depth === 0) return null;
    
    if (width < 40 || height < 40) {
      return (
        <g>
          <rect x={x + 2} y={y + 2} width={Math.max(0, width - 4)} height={Math.max(0, height - 4)} fill={fill} rx={4} ry={4} opacity={0.8} />
        </g>
      );
    }
    return (
      <g>
        <rect x={x + 2} y={y + 2} width={Math.max(0, width - 4)} height={Math.max(0, height - 4)} fill={fill} rx={8} ry={8} opacity={0.9} className="transition-all duration-300 hover:opacity-100 cursor-pointer" />
        <foreignObject x={x + 6} y={y + 6} width={Math.max(0, width - 12)} height={Math.max(0, height - 12)} className="pointer-events-none">
          <div className="w-full h-full flex flex-col justify-center items-center text-center overflow-hidden p-1">
            <div className="text-white font-bold text-[11px] leading-tight line-clamp-2 drop-shadow-md">{name}</div>
            <div className="text-white/90 font-mono text-[10px] mt-0.5 drop-shadow-md">{config.valueType === 'size' ? formatBytes(value, 1) : value.toLocaleString()}</div>
          </div>
        </foreignObject>
      </g>
    );
  };

  const renderCustomPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    if ((percent || 0) < 0.05) return null;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="bold" className="pointer-events-none drop-shadow-md">
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

    const renderChart = () => {
    if (error) {
      return <div className="flex flex-col items-center justify-center h-full text-red-500 text-xs text-center px-4 gap-2">
        <AlertCircle size={24} />
        <span>{error}</span>
      </div>;
    }
    if (!loading && data.length === 0) {
      return <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-600 text-xs gap-2">
        <Activity size={24} className="opacity-20" />
        <span>No data found for this period</span>
      </div>;
    }

    const colors = COLOR_PALETTES[config.colorPalette || 'default'] || COLOR_PALETTES.default;
    const primaryColor = colors[0];

    const commonAxisProps = {
      tick: { fontSize: 9, fill: isDark ? '#94A3B8' : '#64748B', fontWeight: 500 },
      axisLine: false,
      tickLine: false,
    };

    const renderSeries = () => {
      if (seriesKeys.length === 0 || (seriesKeys.length === 1 && seriesKeys[0] === 'value')) {
        // Single series
        switch (config.visualizationType) {
          case 'bar': return (
            <Bar dataKey="value" radius={[4, 4, 0, 0]} hide={hiddenSeries.has('value')} animationDuration={1000}>
              {data.map((_entry, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} fillOpacity={0.8} />
              ))}
            </Bar>
          );
          case 'stackedBar': return (
            <Bar dataKey="value" stackId="1" radius={[4, 4, 0, 0]} hide={hiddenSeries.has('value')} animationDuration={1000}>
              {data.map((_entry, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} fillOpacity={0.8} />
              ))}
            </Bar>
          );
          case 'line': return <Line type="monotone" dataKey="value" stroke={primaryColor} strokeWidth={3} dot={{ r: 4, fill: primaryColor, strokeWidth: 2, stroke: isDark ? '#111827' : '#fff' }} activeDot={{ r: 6, strokeWidth: 0 }} hide={hiddenSeries.has('value')} animationDuration={1000} />;
          case 'area': return <Area type="monotone" dataKey="value" stroke={primaryColor} strokeWidth={2} fill={`url(#gradient-${config.id})`} hide={hiddenSeries.has('value')} animationDuration={1000} />;
          case 'stackedArea': return <Area type="monotone" dataKey="value" stackId="1" stroke={primaryColor} strokeWidth={1} fill={primaryColor} fillOpacity={0.8} hide={hiddenSeries.has('value')} animationDuration={1000} />;
          case 'percentArea': return <Area type="monotone" dataKey="value" stackId="1" stroke={primaryColor} strokeWidth={1} fill={primaryColor} fillOpacity={0.8} hide={hiddenSeries.has('value')} animationDuration={1000} />;
          case 'radar': return <Radar name="Count" dataKey="value" stroke={primaryColor} strokeWidth={2} fill={primaryColor} fillOpacity={0.5} hide={hiddenSeries.has('value')} animationDuration={1000} />;
          case 'scatter': return <Scatter name="Value" dataKey="value" fill={primaryColor} hide={hiddenSeries.has('value')} animationDuration={1000} />;
          default: return null;
        }
      } else {
        // Multiple series
        return seriesKeys.map((key, index) => {
          const color = colors[index % colors.length];
          switch (config.visualizationType) {
            case 'bar': return <Bar key={key} dataKey={key} name={key} fill={color} fillOpacity={0.8} radius={[4, 4, 0, 0]} hide={hiddenSeries.has(key)} animationDuration={1000} />;
            case 'stackedBar': return <Bar key={key} dataKey={key} name={key} fill={color} fillOpacity={0.8} stackId="1" hide={hiddenSeries.has(key)} animationDuration={1000} />;
            case 'line': return <Line key={key} type="monotone" dataKey={key} name={key} stroke={color} strokeWidth={2.5} dot={{ r: 3, fill: color, strokeWidth: 1, stroke: isDark ? '#111827' : '#fff' }} activeDot={{ r: 5, strokeWidth: 0 }} hide={hiddenSeries.has(key)} animationDuration={1000} />;
            case 'area': return <Area key={key} type="monotone" dataKey={key} name={key} stroke={color} strokeWidth={2} fill={color} fillOpacity={0.2} hide={hiddenSeries.has(key)} animationDuration={1000} />;
            case 'stackedArea': return <Area key={key} type="monotone" dataKey={key} name={key} stroke={color} strokeWidth={1} fill={color} fillOpacity={0.8} stackId="1" hide={hiddenSeries.has(key)} animationDuration={1000} />;
            case 'percentArea': return <Area key={key} type="monotone" dataKey={key} name={key} stroke={color} strokeWidth={1} fill={color} fillOpacity={0.8} stackId="1" hide={hiddenSeries.has(key)} animationDuration={1000} />;
            case 'radar': return <Radar key={key} name={key} dataKey={key} stroke={color} strokeWidth={2} fill={color} fillOpacity={0.5} hide={hiddenSeries.has(key)} animationDuration={1000} />;
            case 'scatter': return <Scatter key={key} name={key} dataKey={key} fill={color} hide={hiddenSeries.has(key)} animationDuration={1000} />;
            default: return null;
          }
        });
      }
    };

    const pieData = data.map((d, index) => ({
      ...d,
      _displayValue: hiddenSeries.has(d.name) ? 0 : (seriesKeys.length > 1 ? d._total : d.value),
      _color: colors[index % colors.length]
    }));

    const renderGradients = () => (
      <defs>
        <linearGradient id={`gradient-${config.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor={primaryColor} stopOpacity={0.3}/>
          <stop offset="95%" stopColor={primaryColor} stopOpacity={0}/>
        </linearGradient>
        {colors.map((color, i) => (
          <linearGradient key={`pie-grad-${i}`} id={`pie-grad-${config.id}-${i}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={1} />
            <stop offset="100%" stopColor={color} stopOpacity={0.7} />
          </linearGradient>
        ))}
      </defs>
    );

    switch (config.visualizationType) {
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={filteredData} 
              margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
              onMouseDown={(e: any) => config.showBrush && e && e.activeLabel !== undefined && setRefAreaLeft(e.activeLabel)}
              onMouseMove={(e: any) => config.showBrush && refAreaLeft && e && e.activeLabel !== undefined && setRefAreaRight(e.activeLabel)}
              onMouseUp={zoom}
            >
              {renderGradients()}
              <CartesianGrid vertical={false} stroke={isDark ? '#1E293B' : '#F1F5F9'} strokeDasharray="0" />
              <XAxis dataKey="name" tickFormatter={formatXAxisTick} {...commonAxisProps} angle={-45} textAnchor="end" height={60} interval="preserveStartEnd" />
              <YAxis {...commonAxisProps} tickFormatter={formatYAxisTick} />
              <Tooltip cursor={{ fill: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)' }} content={<CustomTooltip />} />
              {config.showLegend && <Legend content={renderCustomLegend} />}
              {refAreaLeft && refAreaRight ? (
                <ReferenceArea x1={refAreaLeft} x2={refAreaRight} strokeOpacity={0.3} fill={primaryColor} fillOpacity={0.1} />
              ) : null}
              {renderSeries()}
            </BarChart>
          </ResponsiveContainer>
        );
      case 'pie':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <RechartsPieChart>
              {renderGradients()}
              <defs>
                <filter id="pieShadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="4" stdDeviation="6" floodOpacity="0.15" />
                </filter>
              </defs>
              <Pie 
                data={pieData} 
                cx="50%" 
                cy="50%" 
                outerRadius="80%" 
                dataKey="_displayValue" 
                stroke={isDark ? '#111827' : '#fff'} 
                strokeWidth={3}
                label={renderCustomPieLabel} 
                labelLine={false}
                animationDuration={1000}
                paddingAngle={4}
                cornerRadius={5}
                style={{ filter: 'url(#pieShadow)' }}
              >
                {pieData.map((_entry, index) => (
                  <Cell key={`cell-${index}`} fill={hiddenSeries.has(_entry.name) ? (isDark ? '#374151' : '#E5E7EB') : `url(#pie-grad-${config.id}-${index % colors.length})`} fillOpacity={1} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              {config.showLegend && <Legend content={renderCustomLegend} />}
            </RechartsPieChart>
          </ResponsiveContainer>
        );
      case 'donut':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <RechartsPieChart>
              {renderGradients()}
              <defs>
                <filter id="pieShadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="4" stdDeviation="6" floodOpacity="0.15" />
                </filter>
              </defs>
              <Pie 
                data={pieData} 
                cx="50%" 
                cy="50%" 
                innerRadius="45%" 
                outerRadius="80%" 
                dataKey="_displayValue" 
                stroke={isDark ? '#111827' : '#fff'} 
                strokeWidth={3}
                label={renderCustomPieLabel} 
                labelLine={false}
                animationDuration={1000}
                cornerRadius={4}
                paddingAngle={2}
                style={{ filter: 'url(#pieShadow)' }}
              >
                {pieData.map((_entry, index) => (
                  <Cell key={`cell-${index}`} fill={hiddenSeries.has(_entry.name) ? (isDark ? '#374151' : '#E5E7EB') : `url(#pie-grad-${config.id}-${index % colors.length})`} fillOpacity={1} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              {config.showLegend && <Legend content={renderCustomLegend} />}
            </RechartsPieChart>
          </ResponsiveContainer>
        );
      case 'line':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <RechartsLineChart 
              data={filteredData} 
              margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
              onMouseDown={(e: any) => config.showBrush && e && e.activeLabel !== undefined && setRefAreaLeft(e.activeLabel)}
              onMouseMove={(e: any) => config.showBrush && refAreaLeft && e && e.activeLabel !== undefined && setRefAreaRight(e.activeLabel)}
              onMouseUp={zoom}
            >
              <CartesianGrid vertical={false} stroke={isDark ? '#1E293B' : '#F1F5F9'} strokeDasharray="0" />
              <XAxis dataKey="name" tickFormatter={formatXAxisTick} {...commonAxisProps} angle={-45} textAnchor="end" height={60} interval="preserveStartEnd" />
              <YAxis {...commonAxisProps} tickFormatter={formatYAxisTick} />
              <Tooltip cursor={{ stroke: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' }} content={<CustomTooltip />} />
              {config.showLegend && <Legend content={renderCustomLegend} />}
              {refAreaLeft && refAreaRight ? (
                <ReferenceArea x1={refAreaLeft} x2={refAreaRight} strokeOpacity={0.3} fill={primaryColor} fillOpacity={0.1} />
              ) : null}
              {renderSeries()}
            </RechartsLineChart>
          </ResponsiveContainer>
        );
      case 'area':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart 
              data={filteredData} 
              margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
              onMouseDown={(e: any) => config.showBrush && e && e.activeLabel !== undefined && setRefAreaLeft(e.activeLabel)}
              onMouseMove={(e: any) => config.showBrush && refAreaLeft && e && e.activeLabel !== undefined && setRefAreaRight(e.activeLabel)}
              onMouseUp={zoom}
            >
              {renderGradients()}
              <CartesianGrid vertical={false} stroke={isDark ? '#1E293B' : '#F1F5F9'} strokeDasharray="0" />
              <XAxis dataKey="name" tickFormatter={formatXAxisTick} {...commonAxisProps} angle={-45} textAnchor="end" height={60} interval="preserveStartEnd" />
              <YAxis {...commonAxisProps} tickFormatter={formatYAxisTick} />
              <Tooltip cursor={{ stroke: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' }} content={<CustomTooltip />} />
              {config.showLegend && <Legend content={renderCustomLegend} />}
              {refAreaLeft && refAreaRight ? (
                <ReferenceArea x1={refAreaLeft} x2={refAreaRight} strokeOpacity={0.3} fill={primaryColor} fillOpacity={0.1} />
              ) : null}
              {renderSeries()}
            </AreaChart>
          </ResponsiveContainer>
        );
      case 'radar':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
              <PolarGrid stroke={isDark ? '#1E293B' : '#F1F5F9'} />
              <PolarAngleAxis dataKey="name" tick={{ fill: isDark ? '#94A3B8' : '#64748B', fontSize: 9, fontWeight: 500 }} />
              <PolarRadiusAxis angle={30} domain={[0, 'auto']} tick={{ fontSize: 9, fill: isDark ? '#94A3B8' : '#64748B', fontWeight: 500 }} tickFormatter={(tick: any) => formatYAxisTick(tick)} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              {config.showLegend && <Legend content={renderCustomLegend} />}
              {renderSeries()}
            </RadarChart>
          </ResponsiveContainer>
        );
      case 'scatter':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart 
              margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
              onMouseDown={(e: any) => config.showBrush && e && e.activeLabel !== undefined && setRefAreaLeft(e.activeLabel)}
              onMouseMove={(e: any) => config.showBrush && refAreaLeft && e && e.activeLabel !== undefined && setRefAreaRight(e.activeLabel)}
              onMouseUp={zoom}
            >
              <CartesianGrid vertical={false} stroke={isDark ? '#1E293B' : '#F1F5F9'} strokeDasharray="0" />
              <XAxis dataKey="name" type="category" allowDuplicatedCategory={false} tickFormatter={formatXAxisTick} {...commonAxisProps} angle={-45} textAnchor="end" height={60} interval="preserveStartEnd" />
              <YAxis dataKey="value" {...commonAxisProps} tickFormatter={formatYAxisTick} />
              <ZAxis dataKey="value" range={[50, 400]} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomTooltip />} />
              {config.showLegend && <Legend content={renderCustomLegend} />}
              {refAreaLeft && refAreaRight ? (
                <ReferenceArea x1={refAreaLeft} x2={refAreaRight} strokeOpacity={0.3} fill={primaryColor} fillOpacity={0.1} />
              ) : null}
              {seriesKeys.length === 0 || (seriesKeys.length === 1 && seriesKeys[0] === 'value') ? (
                <Scatter name="Value" data={filteredData} hide={hiddenSeries.has('value')} animationDuration={1000}>
                  {filteredData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={colors[index % colors.length]} fillOpacity={0.8} />
                  ))}
                </Scatter>
              ) : (
                seriesKeys.map((key, index) => (
                  <Scatter key={key} name={key} data={filteredData.map(d => ({ name: d.name, value: d[key] }))} fill={colors[index % colors.length]} fillOpacity={0.8} hide={hiddenSeries.has(key)} animationDuration={1000} />
                ))
              )}
            </ScatterChart>
          </ResponsiveContainer>
        );
      case 'stackedBar':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={filteredData} 
              margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
              onMouseDown={(e: any) => config.showBrush && e && e.activeLabel !== undefined && setRefAreaLeft(e.activeLabel)}
              onMouseMove={(e: any) => config.showBrush && refAreaLeft && e && e.activeLabel !== undefined && setRefAreaRight(e.activeLabel)}
              onMouseUp={zoom}
            >
              <CartesianGrid vertical={false} stroke={isDark ? '#1E293B' : '#F1F5F9'} strokeDasharray="0" />
              <XAxis dataKey="name" tickFormatter={formatXAxisTick} {...commonAxisProps} angle={-45} textAnchor="end" height={60} interval="preserveStartEnd" />
              <YAxis {...commonAxisProps} tickFormatter={formatYAxisTick} />
              <Tooltip cursor={{ fill: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)' }} content={<CustomTooltip />} />
              {config.showLegend && <Legend content={renderCustomLegend} />}
              {refAreaLeft && refAreaRight ? (
                <ReferenceArea x1={refAreaLeft} x2={refAreaRight} strokeOpacity={0.3} fill={primaryColor} fillOpacity={0.1} />
              ) : null}
              {renderSeries()}
            </BarChart>
          </ResponsiveContainer>
        );
      case 'stackedArea':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart 
              data={filteredData} 
              margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
              onMouseDown={(e: any) => config.showBrush && e && e.activeLabel !== undefined && setRefAreaLeft(e.activeLabel)}
              onMouseMove={(e: any) => config.showBrush && refAreaLeft && e && e.activeLabel !== undefined && setRefAreaRight(e.activeLabel)}
              onMouseUp={zoom}
            >
              <CartesianGrid vertical={false} stroke={isDark ? '#1E293B' : '#F1F5F9'} strokeDasharray="0" />
              <XAxis dataKey="name" tickFormatter={formatXAxisTick} {...commonAxisProps} angle={-45} textAnchor="end" height={60} interval="preserveStartEnd" />
              <YAxis {...commonAxisProps} tickFormatter={formatYAxisTick} />
              <Tooltip cursor={{ stroke: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' }} content={<CustomTooltip />} />
              {config.showLegend && <Legend content={renderCustomLegend} />}
              {refAreaLeft && refAreaRight ? (
                <ReferenceArea x1={refAreaLeft} x2={refAreaRight} strokeOpacity={0.3} fill={primaryColor} fillOpacity={0.1} />
              ) : null}
              {renderSeries()}
            </AreaChart>
          </ResponsiveContainer>
        );
      case 'percentArea':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart 
              data={filteredData} 
              stackOffset="expand"
              margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
              onMouseDown={(e: any) => config.showBrush && e && e.activeLabel !== undefined && setRefAreaLeft(e.activeLabel)}
              onMouseMove={(e: any) => config.showBrush && refAreaLeft && e && e.activeLabel !== undefined && setRefAreaRight(e.activeLabel)}
              onMouseUp={zoom}
            >
              <CartesianGrid vertical={false} stroke={isDark ? '#1E293B' : '#F1F5F9'} strokeDasharray="0" />
              <XAxis dataKey="name" tickFormatter={formatXAxisTick} {...commonAxisProps} angle={-45} textAnchor="end" height={60} interval="preserveStartEnd" />
              <YAxis {...commonAxisProps} tickFormatter={(tick: any) => `${(tick * 100).toFixed(0)}%`} />
              <Tooltip cursor={{ stroke: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' }} content={<CustomTooltip />} />
              {config.showLegend && <Legend content={renderCustomLegend} />}
              {refAreaLeft && refAreaRight ? (
                <ReferenceArea x1={refAreaLeft} x2={refAreaRight} strokeOpacity={0.3} fill={primaryColor} fillOpacity={0.1} />
              ) : null}
              {renderSeries()}
            </AreaChart>
          </ResponsiveContainer>
        );
      case 'radialBar':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart cx="50%" cy="50%" innerRadius="20%" outerRadius="80%" barSize={12} data={pieData.map((d, i) => ({ ...d, fill: colors[i % colors.length] }))}>
              <RadialBar background={{ fill: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)' }} dataKey="_displayValue" animationDuration={1000} cornerRadius={10} />
              <Tooltip content={<CustomTooltip />} />
              {config.showLegend && <Legend content={renderCustomLegend} />}
            </RadialBarChart>
          </ResponsiveContainer>
        );
      case 'treeMap':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <Treemap
              data={pieData.map((d, i) => ({ name: d.name, size: d._displayValue, fill: colors[i % colors.length] })).filter(d => d.size > 0)}
              dataKey="size"
              aspectRatio={4 / 3}
              stroke={isDark ? '#111827' : '#fff'}
              animationDuration={1000}
              content={<CustomTreemapContent />}
            >
              <Tooltip content={<CustomTooltip />} />
            </Treemap>
          </ResponsiveContainer>
        );
      case 'table':
        const maxVal = Math.max(...data.map(d => seriesKeys.length > 1 ? d._total : d.value), 1);
        return (
          <div className="h-full overflow-auto rounded-xl border border-gray-100 dark:border-gray-800/50 bg-white dark:bg-gray-900/50">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-gray-50/80 dark:bg-gray-800/40 sticky top-0 backdrop-blur-md z-10">
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="px-4 py-3.5 font-bold uppercase tracking-[0.1em] text-[10px] text-gray-400 dark:text-gray-500">{config.fieldName}</th>
                  {seriesKeys.length > 1 ? (
                    seriesKeys.map(key => <th key={key} className="px-4 py-3.5 text-right font-bold uppercase tracking-[0.1em] text-[10px] text-gray-400 dark:text-gray-500">{key}</th>)
                  ) : (
                    <th className="px-4 py-3.5 text-right font-bold uppercase tracking-[0.1em] text-[10px] text-gray-400 dark:text-gray-500">{config.valueType === 'size' ? 'Size' : 'Sessions'}</th>
                  )}
                  {seriesKeys.length > 1 && <th className="px-4 py-3.5 text-right font-bold uppercase tracking-[0.1em] text-[10px] text-gray-400 dark:text-gray-500">Total</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800/30">
                {data.map((row, i) => {
                  const val = seriesKeys.length > 1 ? row._total : row.value;
                  const percent = (val / maxVal) * 100;
                  return (
                    <tr key={i} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/30 transition-all duration-200 group relative">
                      <td className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-200 truncate max-w-[200px] relative z-10" title={row.name}>
                        <div className="flex items-center gap-3">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#BE3B37] shadow-[0_0_8px_rgba(190,59,55,0.4)] opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-0 group-hover:scale-100" />
                          {row.name}
                        </div>
                      </td>
                      {seriesKeys.length > 1 ? (
                        seriesKeys.map(key => <td key={key} className="px-4 py-3 text-right font-mono text-gray-500 dark:text-gray-400 relative z-10">{row[key]?.toLocaleString() || 0}</td>)
                      ) : (
                        <td className="px-4 py-3 text-right font-mono text-gray-500 dark:text-gray-400 relative z-10">
                          <div className="flex items-center justify-end gap-3">
                            <span className="font-bold text-gray-900 dark:text-white">
                              {config.valueType === 'size' ? formatBytes(row.value, 1) : row.value?.toLocaleString() || 0}
                            </span>
                            <div className="w-16 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden hidden sm:block">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${percent}%` }}
                                transition={{ duration: 1, ease: "easeOut", delay: i * 0.05 }}
                                className="h-full bg-[#BE3B37] opacity-60"
                              />
                            </div>
                          </div>
                        </td>
                      )}
                      {seriesKeys.length > 1 && (
                        <td className="px-4 py-3 text-right relative z-10">
                          <div className="flex items-center justify-end gap-3">
                            <span className="font-bold text-gray-900 dark:text-white font-mono">{row._total?.toLocaleString()}</span>
                            <div className="w-16 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden hidden sm:block">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${percent}%` }}
                                transition={{ duration: 1, ease: "easeOut", delay: i * 0.05 }}
                                className="h-full bg-[#BE3B37] opacity-60"
                              />
                            </div>
                          </div>
                        </td>
                      )}
                      {/* Background progress bar for the whole row on hover */}
                      <div 
                        className="absolute inset-y-0 left-0 bg-[#BE3B37]/5 dark:bg-[#BE3B37]/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                        style={{ width: `${percent}%` }}
                      />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
    }
  };

  return (
    <div className={`bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col h-[400px] overflow-hidden w-full transition-all duration-500 hover:shadow-xl hover:border-[#BE3B37]/30 group/dashlet ${isOverlay ? 'shadow-2xl ring-4 ring-[#BE3B37] ring-opacity-20 scale-[1.02]' : ''}`}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800/50 bg-white/50 dark:bg-gray-900/50 backdrop-blur-md sticky top-0 z-20 rounded-t-3xl">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing p-1.5 text-gray-300 hover:text-[#BE3B37] dark:text-gray-700 dark:hover:text-[#BE3B37] transition-all duration-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg">
            <GripVertical size={16} />
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <h3 className="font-bold text-sm text-gray-900 dark:text-white line-clamp-2 leading-tight break-words" title={config.title}>
              {config.title}
            </h3>
            <div className="flex items-center gap-3 mt-1.5">
              <div className="flex items-center gap-1.5 bg-gray-100/80 dark:bg-gray-800/80 px-2 py-0.5 rounded-full border border-gray-200/50 dark:border-gray-700/50">
                <Activity size={9} className="text-[#BE3B37]" />
                <span className="text-[8.5px] font-bold uppercase tracking-[0.1em] text-gray-500 dark:text-gray-400">
                  {config.timeRange}
                </span>
              </div>
              <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-800/30 px-2 py-0.5 rounded-full border border-gray-100 dark:border-gray-700/30">
                <RefreshCw size={9} className={loading ? "animate-spin text-[#BE3B37]" : "text-gray-400"} />
                <span className="text-[8.5px] font-bold text-gray-400 dark:text-gray-500 whitespace-nowrap uppercase tracking-wider">
                  {lastUpdated ? formatDistanceToNow(lastUpdated, { addSuffix: true }) : 'Updating...'}
                </span>
              </div>
            </div>
          </div>
        </div>
        {!isOverlay && (
          <div className="flex items-center gap-1 opacity-0 group-hover/dashlet:opacity-100 transition-all duration-300 transform translate-x-2 group-hover:translate-x-0">
            {(left !== 'dataMin' || right !== 'dataMax') && (
              <button onClick={zoomOut} className="p-2 text-[#BE3B37] hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all active:scale-90" title="Reset Zoom">
                <ZoomOut size={16} />
              </button>
            )}
            <button onClick={fetchData} className="p-2 text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all active:scale-90" title="Refresh">
              <RefreshCw size={16} className={loading ? "animate-spin text-[#BE3B37]" : ""} />
            </button>
            <button onClick={onEdit} className="p-2 text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all active:scale-90" title="Edit">
              <Edit2 size={16} />
            </button>
            <button onClick={onRemove} className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all active:scale-90" title="Remove">
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>
      <div className="flex-1 p-5 min-h-0 relative select-none">
        {loading && !data.length && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/50 dark:bg-gray-900/50 backdrop-blur-[1px] z-10">
            <div className="w-8 h-8 border-2 border-gray-200 border-t-[#BE3B37] rounded-full animate-spin mb-2"></div>
            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-widest">Loading Data</span>
          </div>
        )}
        {renderChart()}
      </div>
    </div>
  );
};

const SortableDashlet = ({ id, config, latestConfig, onRemove, onEdit }: { id: string, config: DashletConfig, latestConfig: QueryConfig, onRemove: () => void, onEdit: () => void }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  const sizeClass = getDashletSizeClass(config.visualSize);

  return (
    <motion.div 
      ref={setNodeRef}
      style={style}
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      className={sizeClass}
    >
      <Dashlet
        config={config}
        latestConfig={latestConfig}
        onRemove={onRemove}
        onEdit={onEdit}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </motion.div>
  );
};

export default function CustomDashboard({ latestConfig }: CustomDashboardProps) {
  const [dashlets, setDashlets] = useState<DashletConfig[]>(() => {
    try {
      const saved = localStorage.getItem('nw_custom_dashlets');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error("Failed to parse dashlets from local storage", e);
    }
    return [
      {
        id: 'default-1',
        title: 'Top Services',
        query: 'service exists',
        fieldName: 'service',
        timeRange: '1h',
        size: 10000,
        visualizationType: 'bar',
        valueType: 'sessions',
        sortOrder: 'order-descending'
      },
      {
        id: 'default-2',
        title: 'Top Source Countries',
        query: 'country.src exists',
        fieldName: 'country.src',
        timeRange: '1h',
        size: 10000,
        visualizationType: 'pie',
        valueType: 'sessions',
        sortOrder: 'order-descending'
      }
    ];
  });

  const [activeId, setActiveId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [dashletToDelete, setDashletToDelete] = useState<string | null>(null);
  const [editingDashlet, setEditingDashlet] = useState<DashletConfig | null>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [query, setQuery] = useState('service exists');
  const [fieldName, setFieldName] = useState('service');
  const [timeRange, setTimeRange] = useState('1h');
  const [size, setSize] = useState(10000);
  const [visualizationType, setVisualizationType] = useState<'bar' | 'pie' | 'line' | 'table' | 'area' | 'donut' | 'radar' | 'scatter' | 'radialBar' | 'treeMap' | 'stackedArea' | 'percentArea' | 'stackedBar'>('bar');
  const [valueType, setValueType] = useState<'sessions' | 'size'>('sessions');
  const [sortOrder, setSortOrder] = useState<'order-ascending' | 'order-descending'>('order-descending');
  const [mode, setMode] = useState<'summarized' | 'real-time'>('summarized');
  const [frequency, setFrequency] = useState<string>('1m');
  const [topX, setTopX] = useState(50);
  const [showLegend, setShowLegend] = useState(true);
  const [showBrush, setShowBrush] = useState(false);
  const [visualSize, setVisualSize] = useState<'small' | 'medium' | 'large' | 'full'>('medium');
  const [refreshInterval, setRefreshInterval] = useState<number>(0);
  const [colorPalette, setColorPalette] = useState<string>('default');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem('nw_custom_dashlets', JSON.stringify(dashlets));
  }, [dashlets]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setDashlets((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
    setActiveId(null);
  };

  if (!latestConfig) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-gray-50 dark:bg-gray-950/50 relative overflow-hidden">
        {/* Decorative background elements */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-20 dark:opacity-10">
          <div className="absolute -top-24 -left-24 w-96 h-96 bg-[#BE3B37] rounded-full blur-[120px]" />
          <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-blue-500 rounded-full blur-[120px]" />
        </div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
          className="relative z-10"
        >
          <div className="w-32 h-32 bg-white dark:bg-gray-900 rounded-[40px] shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.3)] flex items-center justify-center mb-10 border border-gray-200 dark:border-gray-800 relative group">
            <div className="absolute inset-0 bg-gradient-to-br from-[#BE3B37]/5 to-transparent rounded-[40px] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <LayoutDashboard className="w-14 h-14 text-[#BE3B37] relative z-10" />
            <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-[#BE3B37] rounded-2xl flex items-center justify-center shadow-lg border-4 border-white dark:border-gray-900">
              <Lock size={18} className="text-white" />
            </div>
          </div>
          
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6 tracking-tight">
            Connection Required
          </h2>
          <p className="text-gray-500 dark:text-gray-400 max-w-lg leading-relaxed mb-10 text-lg font-medium">
            To visualize your network data, please establish a connection by running an initial query in the sidebar.
          </p>
          
          <div className="inline-flex items-center gap-3 text-[11px] font-bold text-[#BE3B37] uppercase tracking-[0.2em] bg-[#BE3B37]/10 dark:bg-[#BE3B37]/20 px-6 py-3 rounded-full border border-[#BE3B37]/20">
            <div className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#BE3B37] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#BE3B37]"></span>
            </div>
            Listening for active session
          </div>
        </motion.div>
      </div>
    );
  }

  const openModal = (dashlet?: DashletConfig) => {
    if (dashlet) {
      setEditingDashlet(dashlet);
      setTitle(dashlet.title);
      setQuery(dashlet.query);
      setFieldName(dashlet.fieldName || 'service');
      setTimeRange(dashlet.timeRange);
      setSize(dashlet.size);
      setVisualizationType(dashlet.visualizationType);
      setValueType(dashlet.valueType || 'sessions');
      setSortOrder(dashlet.sortOrder || 'order-descending');
      setMode(dashlet.mode || 'summarized');
      setFrequency(dashlet.frequency || '1m');
      setTopX(dashlet.topX || 50);
      setShowLegend(dashlet.showLegend !== false);
      setShowBrush(dashlet.showBrush || false);
      setVisualSize(dashlet.visualSize || 'medium');
      setRefreshInterval(dashlet.refreshInterval || 0);
      setColorPalette(dashlet.colorPalette || 'default');
    } else {
      setEditingDashlet(null);
      setTitle('New Dashlet');
      setQuery('');
      setFieldName('service');
      setTimeRange('1h');
      setSize(10000);
      setVisualizationType('bar');
      setValueType('sessions');
      setSortOrder('order-descending');
      setMode('summarized');
      setFrequency('1m');
      setTopX(50);
      setShowLegend(true);
      setShowBrush(false);
      setVisualSize('medium');
      setRefreshInterval(0);
      setColorPalette('default');
    }
    setIsModalOpen(true);
  };

  const supportsRealTime = ['line', 'area', 'scatter', 'stackedArea', 'percentArea', 'bar', 'stackedBar'].includes(visualizationType);

  const saveDashlet = (e: React.FormEvent) => {
    e.preventDefault();
    
    const newDashlet: DashletConfig = {
      id: editingDashlet ? editingDashlet.id : `dashlet-${Date.now()}`,
      title,
      query,
      fieldName,
      timeRange,
      size,
      visualizationType,
      valueType,
      sortOrder,
      mode: supportsRealTime ? mode : 'summarized',
      frequency: supportsRealTime ? frequency : undefined,
      topX,
      showLegend,
      showBrush,
      visualSize,
      refreshInterval,
      colorPalette
    };

    if (editingDashlet) {
      setDashlets(dashlets.map(d => d.id === editingDashlet.id ? newDashlet : d));
    } else {
      setDashlets([...dashlets, newDashlet]);
    }
    setIsModalOpen(false);
  };

  const removeDashlet = (id: string) => {
    setDashletToDelete(id);
    setIsDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (dashletToDelete) {
      setDashlets(dashlets.filter(d => d.id !== dashletToDelete));
      setDashletToDelete(null);
      setIsDeleteConfirmOpen(false);
    }
  };

  const exportDashboard = () => {
    const dataStr = JSON.stringify(dashlets, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `dashboard-export-${new Date().toISOString().split('T')[0]}.json`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const importDashboard = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        if (Array.isArray(imported)) {
          setDashlets(imported);
        } else {
          alert("Invalid dashboard file format.");
        }
      } catch (err) {
        alert("Failed to parse dashboard file.");
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-950 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 bg-[#BE3B37]/10 rounded-xl">
                <LayoutDashboard className="w-6 h-6 text-[#BE3B37]" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                Dashboard
              </h2>
            </div>
            <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-widest ml-11">
              Custom Visual Intelligence
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={importDashboard} />
            <div className="flex bg-white dark:bg-gray-900 p-1 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors"
                title="Import Dashboard"
              >
                <Upload size={18} />
              </button>
              <button
                onClick={exportDashboard}
                className="p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors"
                title="Export Dashboard"
              >
                <Download size={18} />
              </button>
            </div>
            <button
              onClick={() => openModal()}
              className="flex items-center gap-2 bg-[#BE3B37] hover:bg-[#9a2f28] text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-red-500/20 hover:shadow-red-500/40 active:scale-95 text-sm"
            >
              <Plus size={18} />
              <span>Add Dashlet</span>
            </button>
          </div>
        </div>

        {dashlets.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-white dark:bg-gray-900 rounded-[40px] border border-gray-200 dark:border-gray-800 shadow-sm relative overflow-hidden min-h-[500px]">
            {/* Decorative background elements */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-10 dark:opacity-5">
              <div className="absolute -top-24 -right-24 w-96 h-96 bg-[#BE3B37] rounded-full blur-[120px]" />
              <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-blue-500 rounded-full blur-[120px]" />
            </div>

            <motion.div 
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
              className="relative z-10"
            >
              <div className="w-32 h-32 bg-gray-50 dark:bg-gray-800/50 rounded-[40px] shadow-[0_20px_50px_rgba(0,0,0,0.05)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.2)] flex items-center justify-center mx-auto mb-10 border border-gray-100 dark:border-gray-700 relative group">
                <div className="absolute inset-0 bg-gradient-to-br from-[#BE3B37]/5 to-transparent rounded-[40px] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <Plus className="w-14 h-14 text-gray-300 dark:text-gray-600 relative z-10 group-hover:text-[#BE3B37] transition-colors duration-500" />
              </div>
              
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6 tracking-tight">
                Empty Dashboard
              </h2>
              <p className="text-gray-500 dark:text-gray-400 max-w-lg leading-relaxed mb-10 text-lg font-medium mx-auto">
                Your dashboard is currently empty. Start building your custom security view by adding your first dashlet.
              </p>
              
              <button
                onClick={() => openModal()}
                className="group relative inline-flex items-center gap-3 bg-[#BE3B37] hover:bg-[#A0322E] text-white px-10 py-5 rounded-2xl font-bold text-sm uppercase tracking-[0.15em] transition-all duration-300 shadow-[0_10px_30px_rgba(190,59,55,0.3)] hover:shadow-[0_15px_40px_rgba(190,59,55,0.4)] hover:-translate-y-1 active:scale-95"
              >
                <Plus size={20} className="group-hover:rotate-90 transition-transform duration-500" />
                Create First Dashlet
              </button>
            </motion.div>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={dashlets.map(d => d.id)}
              strategy={rectSortingStrategy}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <AnimatePresence mode="popLayout">
                  {dashlets.map(dashlet => (
                    <SortableDashlet
                      key={dashlet.id}
                      id={dashlet.id}
                      config={dashlet}
                      latestConfig={latestConfig}
                      onRemove={() => removeDashlet(dashlet.id)}
                      onEdit={() => openModal(dashlet)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </SortableContext>
            <DragOverlay dropAnimation={{
              sideEffects: defaultDropAnimationSideEffects({
                styles: {
                  active: {
                    opacity: '0.5',
                  },
                },
              }),
            }}>
              {activeId ? (
                <div className="w-full h-full">
                  <Dashlet
                    config={dashlets.find(d => d.id === activeId)!}
                    latestConfig={latestConfig}
                    onRemove={() => {}}
                    onEdit={() => {}}
                    isOverlay
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden p-6 space-y-6">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Remove Dashlet</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Are you sure you want to remove this dashlet? This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setIsDeleteConfirmOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingDashlet ? 'Edit Dashlet' : 'Add Dashlet'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            <form onSubmit={saveDashlet} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Title</label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-[#BE3B37] focus:outline-none" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Query (Where)</label>
                  <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md text-sm font-mono text-gray-900 dark:text-white focus:ring-2 focus:ring-[#BE3B37] focus:outline-none" placeholder="e.g. service exists" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Metakey (Field Name)</label>
                  <input type="text" value={fieldName} onChange={(e) => setFieldName(e.target.value)} required placeholder="e.g. service" className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md text-sm font-mono text-gray-900 dark:text-white focus:ring-2 focus:ring-[#BE3B37] focus:outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Time Range</label>
                  <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)} className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-[#BE3B37] focus:outline-none">
                    <option value="5m">Last 5 Minutes</option>
                    <option value="15m">Last 15 Minutes</option>
                    <option value="1h">Last 1 Hour</option>
                    <option value="6h">Last 6 Hours</option>
                    <option value="24h">Last 24 Hours</option>
                    <option value="72h">Last 3 Days</option>
                    <option value="168h">Last 7 Days</option>
                    <option value="all">All Data</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Max Results</label>
                  <input type="number" value={size} onChange={(e) => setSize(Number(e.target.value))} min={1} max={100000} required className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-[#BE3B37] focus:outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Value Type</label>
                  <select value={valueType} onChange={(e) => setValueType(e.target.value as any)} className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-[#BE3B37] focus:outline-none">
                    <option value="sessions">Sessions (Count)</option>
                    <option value="size">Size (Bytes)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Sort Order</label>
                  <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as any)} className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-[#BE3B37] focus:outline-none">
                    <option value="order-descending">Descending (Highest First)</option>
                    <option value="order-ascending">Ascending (Lowest First)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Mode</label>
                  <select value={supportsRealTime ? mode : 'summarized'} onChange={(e) => setMode(e.target.value as any)} className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-[#BE3B37] focus:outline-none">
                    <option value="summarized">Summarized</option>
                    <option value="real-time" disabled={!supportsRealTime}>Real-time</option>
                  </select>
                  {!supportsRealTime && <p className="text-xs text-gray-500 mt-1">Real-time mode is not supported for this chart type.</p>}
                </div>
                {supportsRealTime && mode === 'real-time' && (
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Plot Frequency</label>
                    <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-[#BE3B37] focus:outline-none">
                      <option value="1m">1 Minute</option>
                      <option value="5m">5 Minutes</option>
                      <option value="15m">15 Minutes</option>
                      <option value="1h">1 Hour</option>
                      <option value="1d">1 Day</option>
                    </select>
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Dashlet Size</label>
                  <select value={visualSize} onChange={(e) => setVisualSize(e.target.value as any)} className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-[#BE3B37] focus:outline-none">
                    <option value="small">Small (1 Column)</option>
                    <option value="medium">Medium (2 Columns)</option>
                    <option value="large">Large (3 Columns)</option>
                    <option value="full">Full Width</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Auto-Refresh (Minutes)</label>
                  <input type="number" value={refreshInterval} onChange={(e) => setRefreshInterval(Number(e.target.value))} min={0} max={1440} placeholder="0 to disable" className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-[#BE3B37] focus:outline-none" />
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">Set to 0 to disable auto-refresh.</p>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Color Palette</label>
                  <select value={colorPalette} onChange={(e) => setColorPalette(e.target.value)} className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-[#BE3B37] focus:outline-none">
                    <option value="default">Default (Red/Blue/Green)</option>
                    <option value="ocean">Ocean (Blues)</option>
                    <option value="forest">Forest (Greens)</option>
                    <option value="sunset">Sunset (Oranges/Yellows)</option>
                    <option value="purple">Purple (Purples)</option>
                    <option value="monochrome">Monochrome (Grays)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center pt-2 pb-2 gap-6 flex-wrap">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={showLegend} onChange={(e) => setShowLegend(e.target.checked)} className="w-4 h-4 text-[#BE3B37] bg-gray-100 border-gray-300 rounded focus:ring-[#BE3B37] dark:focus:ring-[#BE3B37] dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Show Legend</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={showBrush} onChange={(e) => setShowBrush(e.target.checked)} className="w-4 h-4 text-[#BE3B37] bg-gray-100 border-gray-300 rounded focus:ring-[#BE3B37] dark:focus:ring-[#BE3B37] dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Select to Zoom</span>
                </label>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Limit (Top X)</label>
                <input type="number" min="1" max="1000" value={topX} onChange={(e) => setTopX(parseInt(e.target.value) || 50)} className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-[#BE3B37] focus:outline-none" />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Visualization</label>
                <div className="grid grid-cols-4 sm:grid-cols-7 lg:grid-cols-13 gap-2">
                  <button type="button" onClick={() => setVisualizationType('bar')} className={`flex flex-col items-center justify-center p-2 rounded-md border ${visualizationType === 'bar' ? 'border-[#BE3B37] bg-[#BE3B37]/10 text-[#BE3B37]' : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                    <BarChart3 size={20} className="mb-1" />
                    <span className="text-[10px] font-medium">Bar</span>
                  </button>
                  <button type="button" onClick={() => setVisualizationType('stackedBar')} className={`flex flex-col items-center justify-center p-2 rounded-md border ${visualizationType === 'stackedBar' ? 'border-[#BE3B37] bg-[#BE3B37]/10 text-[#BE3B37]' : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                    <BarChart3 size={20} className="mb-1" />
                    <span className="text-[10px] font-medium text-center">Stacked Bar</span>
                  </button>
                  <button type="button" onClick={() => setVisualizationType('pie')} className={`flex flex-col items-center justify-center p-2 rounded-md border ${visualizationType === 'pie' ? 'border-[#BE3B37] bg-[#BE3B37]/10 text-[#BE3B37]' : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                    <PieChart size={20} className="mb-1" />
                    <span className="text-[10px] font-medium">Pie</span>
                  </button>
                  <button type="button" onClick={() => setVisualizationType('donut')} className={`flex flex-col items-center justify-center p-2 rounded-md border ${visualizationType === 'donut' ? 'border-[#BE3B37] bg-[#BE3B37]/10 text-[#BE3B37]' : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                    <PieChart size={20} className="mb-1" />
                    <span className="text-[10px] font-medium">Donut</span>
                  </button>
                  <button type="button" onClick={() => setVisualizationType('radialBar')} className={`flex flex-col items-center justify-center p-2 rounded-md border ${visualizationType === 'radialBar' ? 'border-[#BE3B37] bg-[#BE3B37]/10 text-[#BE3B37]' : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                    <PieChart size={20} className="mb-1" />
                    <span className="text-[10px] font-medium text-center">Radial Bar</span>
                  </button>
                  <button type="button" onClick={() => setVisualizationType('line')} className={`flex flex-col items-center justify-center p-2 rounded-md border ${visualizationType === 'line' ? 'border-[#BE3B37] bg-[#BE3B37]/10 text-[#BE3B37]' : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                    <LineChart size={20} className="mb-1" />
                    <span className="text-[10px] font-medium">Line</span>
                  </button>
                  <button type="button" onClick={() => setVisualizationType('area')} className={`flex flex-col items-center justify-center p-2 rounded-md border ${visualizationType === 'area' ? 'border-[#BE3B37] bg-[#BE3B37]/10 text-[#BE3B37]' : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                    <Activity size={20} className="mb-1" />
                    <span className="text-[10px] font-medium">Area</span>
                  </button>
                  <button type="button" onClick={() => setVisualizationType('stackedArea')} className={`flex flex-col items-center justify-center p-2 rounded-md border ${visualizationType === 'stackedArea' ? 'border-[#BE3B37] bg-[#BE3B37]/10 text-[#BE3B37]' : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                    <Activity size={20} className="mb-1" />
                    <span className="text-[10px] font-medium text-center">Stacked Area</span>
                  </button>
                  <button type="button" onClick={() => setVisualizationType('percentArea')} className={`flex flex-col items-center justify-center p-2 rounded-md border ${visualizationType === 'percentArea' ? 'border-[#BE3B37] bg-[#BE3B37]/10 text-[#BE3B37]' : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                    <Activity size={20} className="mb-1" />
                    <span className="text-[10px] font-medium text-center">Percent Area</span>
                  </button>
                  <button type="button" onClick={() => setVisualizationType('radar')} className={`flex flex-col items-center justify-center p-2 rounded-md border ${visualizationType === 'radar' ? 'border-[#BE3B37] bg-[#BE3B37]/10 text-[#BE3B37]' : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                    <RadarIcon size={20} className="mb-1" />
                    <span className="text-[10px] font-medium">Radar</span>
                  </button>
                  <button type="button" onClick={() => setVisualizationType('scatter')} className={`flex flex-col items-center justify-center p-2 rounded-md border ${visualizationType === 'scatter' ? 'border-[#BE3B37] bg-[#BE3B37]/10 text-[#BE3B37]' : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                    <ScatterChartIcon size={20} className="mb-1" />
                    <span className="text-[10px] font-medium">Scatter</span>
                  </button>
                  <button type="button" onClick={() => setVisualizationType('treeMap')} className={`flex flex-col items-center justify-center p-2 rounded-md border ${visualizationType === 'treeMap' ? 'border-[#BE3B37] bg-[#BE3B37]/10 text-[#BE3B37]' : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                    <Layers size={20} className="mb-1" />
                    <span className="text-[10px] font-medium text-center">Tree Map</span>
                  </button>
                  <button type="button" onClick={() => setVisualizationType('table')} className={`flex flex-col items-center justify-center p-2 rounded-md border ${visualizationType === 'table' ? 'border-[#BE3B37] bg-[#BE3B37]/10 text-[#BE3B37]' : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                    <TableIcon size={20} className="mb-1" />
                    <span className="text-[10px] font-medium">Table</span>
                  </button>
                </div>
              </div>
            </form>
            <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 flex justify-end gap-2">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                Cancel
              </button>
              <button type="submit" onClick={saveDashlet} className="px-4 py-2 text-sm font-medium text-white bg-[#BE3B37] hover:bg-[#9a2f28] rounded-lg transition-colors shadow-sm">
                Save Dashlet
              </button>
            </div>
          </div>
        </div>
      )}

      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200 dark:border-gray-800">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Delete Dashlet</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Are you sure you want to delete this dashlet? This action cannot be undone.</p>
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 flex justify-end gap-2">
              <button type="button" onClick={() => setIsDeleteConfirmOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                Cancel
              </button>
              <button type="button" onClick={confirmDelete} className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
