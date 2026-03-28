/**
 * DetailsPanel.tsx
 * 
 * This component renders a slide-out side panel displaying deep context and analytics
 * for a selected Graph Node (e.g., an IP address or attribute) or Link (network connections).
 * It provides detailed behavioral profiles, traffic volume statistics, service usage,
 * and threat indicators.
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import { GraphData, Node, Link } from "../types";
import { 
  X, Globe, Shield, Database, Copy, ExternalLink, Network, Activity, 
  ChevronDown, ChevronUp, UserPlus, Grid, TrendingUp, History, Search
} from "lucide-react";
import { formatBytes, formatDate } from "../lib/utils";
import ReactECharts from 'echarts-for-react';
import { useAttributeNodeData, useIpNodeStats, ThreatType } from "../hooks/useDetailsPanelData";

// ==========================================
// THEME CONFIGURATION
// ==========================================
const THEME = {
  brand: {
    primary: '#BE3B37',
    textHover: 'hover:text-[#BE3B37] transition-colors',
    rowHover: 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 transition-all duration-200',
  },
  traffic: {
    outbound: { hex: '#ef4444', bg: 'bg-[#d94a4a]', text: 'text-[#d94a4a]' },
    inbound:  { hex: '#38bdf8', bg: 'bg-[#4a90e2]', text: 'text-[#4a90e2]' },
    lateral:  { hex: '#f59e0b', bg: 'bg-[#f5a623]', text: 'text-[#f5a623]' }
  },
  threat: {
    ioc: { hex: '#d94a4a', bg: 'bg-[#d94a4a]', badge: 'bg-[#d94a4a]/10 dark:bg-[#d94a4a]/20 text-[#d94a4a] border-[#d94a4a]/30' },
    boc: { hex: '#ea580c', bg: 'bg-orange-500', badge: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800' },
    eoc: { hex: '#d97706', bg: 'bg-amber-500', badge: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800' },
  },
  tags: {
    service: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/50',
    org: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/50',
    domain: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800/50',
    client: 'bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  },
  neutralBadge: 'bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700',
  chartPalette: ['#3b82f6', '#6366f1', '#475569', '#64748b', '#94a3b8', '#cbd5e1'],
  dashletCard: 'bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm',
  innerCard: 'bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700',
};

// ==========================================
// INTERFACES
// ==========================================
interface DetailsPanelProps {
  selectedItem: Node | Link | null;
  onClose: () => void;
  graphData: GraphData;
  onNodeSelect: (node: Node) => void;
  onAttributeSelect: (attrType: string, attrValue: string) => void;
  navigateUrl?: string;
  viewMode?: 'graph' | 'globe' | 'news';
}

// ==========================================
// UTILITY COMPONENTS
// ==========================================

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "absolute";
        textArea.style.left = "-999999px";
        document.body.prepend(textArea);
        textArea.select();
        try { document.execCommand('copy'); } catch (error) { console.error('Fallback copy failed', error); } 
        finally { textArea.remove(); }
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) { 
      console.error('Failed to copy text: ', err); 
    }
  };

  return (
    <button onClick={handleCopy} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors" title="Copy to clipboard">
      {copied ? <span className="text-[10px] text-emerald-500 font-medium">Copied!</span> : <Copy size={12} />}
    </button>
  );
}

function ShodanLink({ ip }: { ip: string }) {
  return (
    <a href={`https://www.shodan.io/host/${ip}`} target="_blank" rel="noopener noreferrer" className={`p-1 text-slate-400 ${THEME.brand.textHover}`} title="Lookup on Shodan" onClick={e => e.stopPropagation()}>
      <ExternalLink size={12} />
    </a>
  );
}

function NetWitnessLink({ metakey, value, navigateUrl }: { metakey: string, value: string, navigateUrl?: string }) {
  if (!navigateUrl) return null;
  
  const isIPv4 = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(value);
  const isIPv6 = /^[0-9a-fA-F:]+$/.test(value) && value.includes(':');
  const isNumber = !isNaN(Number(value)) && value.trim() !== '';
  
  const formattedValue = (isIPv4 || isIPv6 || isNumber) ? value : `'${value}'`;
  const url = `${navigateUrl.replace(/\/$/, '')}/query/${encodeURIComponent(metakey)}=${encodeURIComponent(formattedValue)}`;
  
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={`p-1 text-slate-400 ${THEME.brand.textHover}`} title="View in Navigate" onClick={e => e.stopPropagation()}>
      <Search size={12} />
    </a>
  );
}

function InfoCard({ icon: Icon, label, value, valueClass = "", onClick }: { icon: React.ElementType, label: string, value: string | React.ReactNode, valueClass?: string, onClick?: () => void }) {
  return (
    <div className={`${THEME.innerCard} p-3 ${onClick ? THEME.brand.rowHover : ''}`} onClick={onClick}>
      <div className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1 flex items-center gap-1"><Icon size={12} />{label}</div>
      <div className={`text-sm font-semibold text-slate-700 dark:text-slate-200 ${valueClass}`}>{value}</div>
    </div>
  );
}

// ==========================================
// MAIN COMPONENT
// ==========================================

export default function DetailsPanel({
  selectedItem, onClose, graphData, onNodeSelect, onAttributeSelect, navigateUrl,
}: DetailsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    let mouseDownPos = { x: 0, y: 0 };
    const handleMouseDown = (e: MouseEvent) => { mouseDownPos = { x: e.clientX, y: e.clientY }; };
    const handleMouseUp = (e: MouseEvent) => {
      const dx = e.clientX - mouseDownPos.x;
      const dy = e.clientY - mouseDownPos.y;
      if (Math.sqrt(dx * dx + dy * dy) < 5 && panelRef.current && !panelRef.current.contains(e.target as globalThis.Node)) {
        onClose();
      }
    };
    
    const timeoutId = setTimeout(() => {
      window.addEventListener('mousedown', handleMouseDown);
      window.addEventListener('mouseup', handleMouseUp);
    }, 10);
    
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [onClose]);

  if (!selectedItem) return null;
  const isNode = "id" in selectedItem;

  return (
    <div ref={panelRef} className="w-80 shrink-0 max-w-[calc(100vw-2rem)] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden z-10 transition-all duration-300 ease-in-out animate-in slide-in-from-right-8 fade-in shadow-xl">
      <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          {isNode ? <Database size={18} color={THEME.brand.primary} /> : <Network size={18} color={THEME.brand.primary} />}
          {isNode ? "Node Details" : "Connection Details"}
        </h3>
        <button onClick={onClose} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md text-slate-500 dark:text-slate-400 transition-colors"><X size={18} /></button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
        {isNode ? (
          <NodeDetails node={selectedItem as Node} graphData={graphData} onNodeSelect={onNodeSelect} onAttributeSelect={onAttributeSelect} navigateUrl={navigateUrl} />
        ) : (
          <LinkDetails link={selectedItem as Link} graphData={graphData} onNodeSelect={onNodeSelect} navigateUrl={navigateUrl} />
        )}
      </div>
    </div>
  );
}

// ==========================================
// SUB-COMPONENTS
// ==========================================

function NodeDetails({ node, graphData, onNodeSelect, onAttributeSelect, navigateUrl }: { node: Node; graphData: GraphData; onNodeSelect: (node: Node) => void; onAttributeSelect: (attrType: string, attrValue: string) => void; navigateUrl?: string }) {
  const attrNodeData = useAttributeNodeData(node, graphData);
  const ipNodeStats = useIpNodeStats(node, graphData);

  // --- RENDER: Attribute Node ---
  if (node.type === "attribute" && attrNodeData) {
    const { relatedNodes, totalConnections } = attrNodeData;
    return (
      <div className="space-y-6">
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{node.attrType} Node</label>
          <div className="mt-1 flex items-center justify-between font-mono text-sm text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-2 rounded-md">
            <span className="truncate">{node.attrValue}</span>
            <div className="flex items-center gap-1">
              <NetWitnessLink metakey={node.attrType || ''} value={node.attrValue || ''} navigateUrl={navigateUrl} />
              <CopyButton text={node.attrValue || ''} />
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <InfoCard icon={Network} label="Related IPs" value={relatedNodes.length} />
          <InfoCard icon={Activity} label="Connections" value={totalConnections} />
        </div>
        
        {relatedNodes.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">Related IP Addresses</h4>
            <div className="space-y-2">
              {relatedNodes.map(id => (
                <div 
                  key={id} 
                  className={`flex items-center justify-between font-mono text-xs text-slate-700 dark:text-slate-300 ${THEME.innerCard} p-2 ${THEME.brand.rowHover}`}
                  onClick={() => { const ipNode = graphData.nodes.find(n => n.id === id); if (ipNode) onNodeSelect(ipNode); }}
                >
                  <span className="truncate">{id}</span>
                  <div className="flex items-center gap-1">
                    {graphData.nodes.find(n => n.id === id)?.networkType === 'public' && <ShodanLink ip={id} />}
                    <NetWitnessLink metakey="ip.all" value={id} navigateUrl={navigateUrl} />
                    <CopyButton text={id} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- RENDER: Standard Node ---
  const hasAttributes = node.attributes && Object.keys(node.attributes).length > 0;
  const stats = ipNodeStats || { 
    totalSize: 0, connectionCount: 0, directionStats: { inbound: { size: 0, count: 0 }, outbound: { size: 0, count: 0 }, lateral: { size: 0, count: 0 } },
    roleStats: { server: [], client: [] }, serviceVolumeStats: [], timeSeriesData: [], threatTimeline: [], minTime: 0, maxTime: 0
  };

  const totalServerSessions = stats.roleStats.server.reduce((sum, [_, c]) => sum + c, 0);
  const totalClientSessions = stats.roleStats.client.reduce((sum, [_, c]) => sum + c, 0);
  const maxDirectionVolume = Math.max(stats.directionStats.outbound.size, stats.directionStats.inbound.size, stats.directionStats.lateral.size) || 1;

  return (
    <div className="space-y-8">
      {/* Node Identity */}
      <div>
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">IP Address</label>
        <div className="mt-1 flex items-center justify-between font-mono text-sm text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-2 rounded-md">
          <span className="truncate">{node.id}</span>
          <div className="flex items-center gap-1">
            {node.networkType === 'public' && <ShodanLink ip={node.id} />}
            <NetWitnessLink metakey="ip.all" value={node.id} navigateUrl={navigateUrl} />
            <CopyButton text={node.id} />
          </div>
        </div>
      </div>

      {/* Basic Stats */}
      <div className="grid grid-cols-2 gap-4">
        <InfoCard icon={Database} label="Total Size" value={formatBytes(stats.totalSize)} />
        <InfoCard icon={Activity} label="Connections" value={stats.connectionCount} />
        {node.networkType && <InfoCard icon={Shield} label="Network" value={node.networkType} valueClass={`capitalize ${node.networkType === 'public' ? THEME.brand.textHover : 'text-slate-700 dark:text-slate-300'}`} />}
        {node.networkType === 'internal' && node.netname && <InfoCard icon={Shield} label="Netname" value={<span className="truncate block" title={node.netname}>{node.netname}</span>} />}
        {node.networkType !== 'internal' && node.country && <InfoCard icon={Globe} label="Country" value={node.country} onClick={() => onAttributeSelect('country', node.country!)} />}
        {node.org && <InfoCard icon={Globe} label="Organization" value={<span className="truncate block" title={node.org}>{node.org}</span>} onClick={() => onAttributeSelect('org', node.org!)} />}
      </div>

      {/* Behavioral Profile */}
      <div>
        <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest border-b border-slate-200 dark:border-slate-800 pb-2 mb-4 flex items-center gap-2">
          <UserPlus size={14} className="text-slate-500" /> Behavioral Profile
        </h4>
        <div className="grid grid-cols-2 gap-4">
          <div className={`${THEME.dashletCard} p-3`}>
            <div className="flex justify-between items-start mb-4">
              <div className={`text-[10px] font-bold ${THEME.traffic.outbound.text} uppercase tracking-wider leading-tight max-w-[60%]`}>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-current mr-1.5 align-middle" /> Acting As Server
              </div>
              <div className="text-[9px] text-slate-500 uppercase tracking-widest text-right">· {totalServerSessions.toLocaleString()}<br/>Sessions</div>
            </div>
            <div className="space-y-2 max-h-32 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">
              {stats.roleStats.server.length > 0 ? stats.roleStats.server.map(([serviceName, count]) => (
                <div key={serviceName} className="flex justify-between items-center group">
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 truncate max-w-[60px]">{serviceName}</span>
                  <span className="text-[11px] font-bold text-slate-800 dark:text-white">{count.toLocaleString()}</span>
                </div>
              )) : <div className="text-[10px] text-slate-500 italic text-center py-2">No server activity</div>}
            </div>
          </div>

          <div className={`${THEME.dashletCard} p-3`}>
            <div className="flex justify-between items-start mb-4">
              <div className={`text-[10px] font-bold ${THEME.traffic.inbound.text} uppercase tracking-wider leading-tight max-w-[60%]`}>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-current mr-1.5 align-middle" /> Acting As Client
              </div>
              <div className="text-[9px] text-slate-500 uppercase tracking-widest text-right">· {totalClientSessions.toLocaleString()}<br/>Sessions</div>
            </div>
            <div className="space-y-2 max-h-32 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">
              {stats.roleStats.client.length > 0 ? stats.roleStats.client.map(([serviceName, count]) => (
                <div key={serviceName} className="flex justify-between items-center group">
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 truncate max-w-[60px]">{serviceName}</span>
                  <span className="text-[11px] font-bold text-slate-800 dark:text-white">{count.toLocaleString()}</span>
                </div>
              )) : <div className="text-[10px] text-slate-500 italic text-center py-2">No client activity</div>}
            </div>
          </div>
        </div>
      </div>

      {/* Traffic Volume By Direction */}
      <div>
        <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest border-b border-slate-200 dark:border-slate-800 pb-2 mb-4 flex items-center gap-2">
          <Activity size={14} className="text-slate-500" /> Traffic Volume By Direction
        </h4>
        <div className="flex flex-col gap-3">
          {[
            { label: 'Outbound', value: stats.directionStats.outbound.size, color: THEME.traffic.outbound.bg },
            { label: 'Inbound', value: stats.directionStats.inbound.size, color: THEME.traffic.inbound.bg },
            { label: 'Lateral', value: stats.directionStats.lateral.size, color: THEME.traffic.lateral.bg }
          ].map((dir) => (
            <div key={dir.label} className="flex items-center gap-3">
              <div className="w-16 text-[11px] font-medium text-slate-500 text-right">{dir.label}</div>
              <div className="flex-1">
                <div 
                  className={`${dir.color} h-6 rounded-r-md rounded-l-sm flex items-center px-2 transition-all duration-500 ease-out`}
                  style={{ width: `${Math.max((dir.value / maxDirectionVolume) * 100, 2)}%` }}
                >
                  {dir.value > 0 && <span className="text-[10px] font-bold text-white whitespace-nowrap ml-1 drop-shadow-md">{formatBytes(dir.value)}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Volume Per Service */}
      <div>
        <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest border-b border-slate-200 dark:border-slate-800 pb-2 mb-4 flex items-center gap-2">
          <Grid size={14} className="text-slate-500" /> Volume Per Service
        </h4>
        <div className="grid grid-cols-2 gap-3">
          {stats.serviceVolumeStats.slice(0, 4).map((serviceData) => (
            <div key={serviceData.name} className={`${THEME.dashletCard} p-3`}>
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider truncate mr-2">{serviceData.name}</span>
                <span className="text-[10px] text-slate-500 whitespace-nowrap">{formatBytes(serviceData.total)} total</span>
              </div>
              
              <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800/80 rounded-full flex overflow-hidden mb-3">
                <div className={THEME.traffic.outbound.bg} style={{ width: `${(serviceData.outbound / serviceData.total) * 100}%` }} title="Outbound" />
                <div className={THEME.traffic.inbound.bg} style={{ width: `${(serviceData.inbound / serviceData.total) * 100}%` }} title="Inbound" />
                <div className={THEME.traffic.lateral.bg} style={{ width: `${(serviceData.lateral / serviceData.total) * 100}%` }} title="Lateral" />
              </div>
              
              <div className="flex justify-between items-start text-[9px] uppercase tracking-widest text-slate-500">
                <div><span className={`inline-block w-1.5 h-1.5 rounded-full ${THEME.traffic.outbound.bg} mr-1 align-middle`} />Out <br/><span className="text-slate-600 dark:text-slate-400 font-semibold">{formatBytes(serviceData.outbound)}</span></div>
                <div><span className={`inline-block w-1.5 h-1.5 rounded-full ${THEME.traffic.inbound.bg} mr-1 align-middle`} />In <br/><span className="text-slate-600 dark:text-slate-400 font-semibold">{formatBytes(serviceData.inbound)}</span></div>
                <div><span className={`inline-block w-1.5 h-1.5 rounded-full ${THEME.traffic.lateral.bg} mr-1 align-middle`} />Lat <br/><span className="text-slate-600 dark:text-slate-400 font-semibold">{formatBytes(serviceData.lateral)}</span></div>
              </div>
            </div>
          ))}
          {stats.serviceVolumeStats.length === 0 && (
             <div className="col-span-2 text-[10px] text-slate-500 italic text-center py-4">No service volume data available</div>
          )}
        </div>
      </div>

      {/* Indicators Over Time */}
      <div>
        <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest border-b border-slate-200 dark:border-slate-800 pb-2 mb-4 flex items-center gap-2">
          <History size={14} className="text-slate-500" /> Indicators Over Time
        </h4>
        
        <div className={`${THEME.dashletCard} p-4`}>
          {stats.threatTimeline.length === 0 ? (
            <div className="text-[10px] text-slate-500 italic text-center">No threats detected</div>
          ) : (
            <div className="space-y-3">
              {(['ioc', 'boc', 'eoc'] as ThreatType[]).map(threatType => {
                const hits = stats.threatTimeline.filter(t => t.type === threatType);
                const themeNode = THEME.threat[threatType];
                
                return (
                  <div key={threatType} className="flex items-center gap-3">
                    <div className="w-8 text-[11px] font-bold text-slate-500 text-right uppercase tracking-wider">{threatType}</div>
                    <div className="flex-1 h-5 bg-slate-100 dark:bg-slate-800/80 rounded relative">
                      {hits.map((hit, i) => {
                        const positionPct = stats.maxTime > stats.minTime 
                          ? ((hit.time - stats.minTime) / (stats.maxTime - stats.minTime)) * 100 
                          : 50; 
                        
                        return (
                          <div key={i} className="absolute top-0 bottom-0 w-1 group cursor-pointer hover:w-2 hover:-ml-0.5 transition-all duration-200 z-10" style={{ left: `${positionPct}%` }}>
                            <div className={`w-full h-full ${themeNode.bg} rounded-sm opacity-90`} />
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-20 scale-95 group-hover:scale-100">
                              <div className="bg-slate-900/95 backdrop-blur-md text-white text-[10px] p-2.5 rounded-md shadow-xl border border-slate-700 whitespace-nowrap">
                                <div className="flex items-center gap-2 mb-1">
                                  <div className={`w-1.5 h-1.5 rounded-full ${themeNode.bg}`} />
                                  <div className="font-bold uppercase tracking-wider">{hit.type}</div>
                                </div>
                                <div className="font-medium text-slate-300 mb-1">{hit.value}</div>
                                <div className="text-[9px] text-slate-500 font-mono">{formatDate(hit.time / 1000)}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Associated Attributes */}
      {hasAttributes && (
        <div>
          <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest border-b border-slate-200 dark:border-slate-800 pb-2 mb-4">Associated Attributes</h4>
          <div className="space-y-4">
            {Object.entries(node.attributes!).map(([key, values]) => (
              <div key={key}>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{key}</label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {values.map((val, idx) => (
                    <div key={idx} className={`flex items-center gap-1 font-mono text-xs p-1 px-2 rounded ${THEME.neutralBadge}`}>
                      <span className="truncate max-w-[200px]">{val}</span>
                      <NetWitnessLink metakey={key} value={val} navigateUrl={navigateUrl} />
                      <CopyButton text={val} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LinkDetails({ link, graphData, onNodeSelect, navigateUrl }: { link: Link; graphData: GraphData; onNodeSelect: (node: Node) => void; navigateUrl?: string }) {
  const [showAllSessions, setShowAllSessions] = useState(false);
  
  if (link.type === "attribute") {
    return (
      <div className="space-y-6">
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Attribute Link</label>
          <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">Connects an IP node to its attribute.</div>
        </div>
      </div>
    );
  }

  const sourceId = typeof link.source === "object" ? (link.source as Node).id : String(link.source);
  const targetId = typeof link.target === "object" ? (link.target as Node).id : String(link.target);
  const sourceNode = graphData.nodes.find(n => n.id === sourceId);
  const targetNode = graphData.nodes.find(n => n.id === targetId);

  const reverseLink = useMemo(() => graphData.links.find(l => {
    const revSourceId = typeof l.source === "object" ? (l.source as Node).id : String(l.source);
    const revTargetId = typeof l.target === "object" ? (l.target as Node).id : String(l.target);
    return revSourceId === targetId && revTargetId === sourceId;
  }), [graphData.links, sourceId, targetId]);

  const allSessions = useMemo(() => [...(link.sessions || []), ...(reverseLink?.sessions || [])], [link.sessions, reverseLink?.sessions]);

  const { serviceData, timeSeriesData, uniqueServices, maxServiceVolume } = useMemo(() => {
    const serviceVolumes: Record<string, number> = {};
    const timeBuckets: Record<number, Record<string, number>> = {};
    const servicesSet = new Set<string>();

    const times = allSessions.map(s => Number(s.time) * 1000).filter(t => !isNaN(t));
    const minTime = times.length > 0 ? Math.min(...times) : 0;
    const maxTime = times.length > 0 ? Math.max(...times) : 0;
    const bucketSize = (maxTime - minTime) > 24 * 60 * 60 * 1000 ? 60 * 60 * 1000 : 60 * 1000;

    allSessions.forEach(session => {
      const size = parseInt(String(Array.isArray(session.size) ? session.size[0] : session.size || 0), 10);
      const serviceName = String(Array.isArray(session.service) ? session.service[0] : session.service || 'unknown');
      
      serviceVolumes[serviceName] = (serviceVolumes[serviceName] || 0) + size;
      servicesSet.add(serviceName);

      const timestamp = Number(session.time) * 1000;
      if (!isNaN(timestamp)) {
        const bucket = Math.floor(timestamp / bucketSize) * bucketSize;
        if (!timeBuckets[bucket]) timeBuckets[bucket] = {};
        timeBuckets[bucket][serviceName] = (timeBuckets[bucket][serviceName] || 0) + size;
      }
    });

    const svcData = Object.entries(serviceVolumes).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
    const maxSvcVol = svcData.length > 0 ? Math.max(...svcData.map(s => s.total)) : 1;

    const tsData = Object.entries(timeBuckets).map(([time, volumes]) => ({ 
      time: Number(time), formattedTime: new Date(Number(time)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), ...volumes 
    })).sort((a, b) => a.time - b.time);

    return { serviceData: svcData, timeSeriesData: tsData, uniqueServices: Array.from(servicesSet), maxServiceVolume: maxSvcVol };
  }, [allSessions]);

  const { tags, hasTags } = useMemo(() => {
    const summary = { ioc: new Set<string>(), boc: new Set<string>(), eoc: new Set<string>(), service: new Set<string>(), org: new Set<string>(), domain: new Set<string>(), client: new Set<string>() };
    allSessions.forEach((session) => {
      (['ioc', 'boc', 'eoc', 'service', 'org', 'domain', 'client'] as const).forEach(key => {
        if (session[key]) {
          const vals = Array.isArray(session[key]) ? session[key] : [session[key]];
          vals.forEach((v: string) => summary[key].add(v));
        }
      });
    });
    return { tags: summary, hasTags: Object.values(summary).some(set => set.size > 0) };
  }, [allSessions]);

  return (
    <div className="space-y-8">
      {/* Network Endpoints */}
      <div className="space-y-3">
        {[{ label: 'Source Node', id: sourceId, node: sourceNode }, { label: 'Target Node', id: targetId, node: targetNode }].map(side => (
          <div key={side.label}>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{side.label}</label>
            <div className={`mt-1 flex items-center justify-between font-mono text-sm p-2 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 ${THEME.brand.rowHover}`} onClick={() => { if (side.node) onNodeSelect(side.node); }}>
              <span className="truncate">{side.id}</span>
              <div className="flex items-center gap-1">
                {side.node?.networkType === 'public' && <ShodanLink ip={side.id} />}
                <NetWitnessLink metakey="ip.all" value={side.id} navigateUrl={navigateUrl} />
                <CopyButton text={side.id} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Link Stats */}
      <div className="grid grid-cols-2 gap-4">
        <InfoCard icon={Activity} label="Total Sessions" value={allSessions.length} />
        <InfoCard icon={Database} label="Total Size" value={formatBytes(link.size || 0)} />
      </div>

      {/* Volume Per Service */}
      {serviceData.length > 0 && (
        <div>
          <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest border-b border-slate-200 dark:border-slate-800 pb-2 mb-4 flex items-center gap-2">
            <Grid size={14} className="text-slate-500" /> Volume Per Service
          </h4>
          <div className="grid grid-cols-2 gap-3">
            {serviceData.slice(0, 4).map((svc, idx) => (
              <div key={svc.name} className={`${THEME.dashletCard} p-3`}>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider truncate mr-2">{svc.name}</span>
                  <span className="text-[10px] text-slate-500 whitespace-nowrap">{formatBytes(svc.total)} total</span>
                </div>
                <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800/80 rounded-full flex overflow-hidden">
                  <div className="transition-all duration-500 ease-out" style={{ width: `${Math.max((svc.total / maxServiceVolume) * 100, 2)}%`, backgroundColor: THEME.chartPalette[idx % THEME.chartPalette.length] }} title="Total Service Volume" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Time Series Histogram */}
      {timeSeriesData.length > 0 && (
        <div>
           <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest border-b border-slate-200 dark:border-slate-800 pb-2 mb-4 flex items-center gap-2">
             <TrendingUp size={14} className="text-slate-500" /> Traffic Trends Over Time
           </h4>
          <div className={`${THEME.dashletCard} p-4 h-40`}>
            <ReactECharts
              option={{
                tooltip: {
                  trigger: 'axis',
                  axisPointer: { type: 'shadow' },
                  backgroundColor: '#0f172a',
                  borderColor: '#0f172a',
                  textStyle: { color: '#fff', fontSize: 10 },
                  formatter: (params: any) => {
                    let res = `<div style="margin-bottom: 4px;">${params[0].name}</div>`;
                    params.forEach((p: any) => {
                      if (p.value > 0) {
                        res += `<div style="display: flex; justify-content: space-between; gap: 8px;">
                                  <span>${p.marker} ${p.seriesName}</span>
                                  <span style="font-family: monospace;">${formatBytes(Number(p.value))}</span>
                                </div>`;
                      }
                    });
                    return res;
                  }
                },
                grid: { top: 10, right: 10, bottom: 20, left: 40 },
                xAxis: {
                  type: 'category',
                  data: timeSeriesData.map(d => d.formattedTime),
                  axisLabel: { color: '#64748b', fontSize: 9 },
                  axisLine: { show: false },
                  axisTick: { show: false }
                },
                yAxis: {
                  type: 'value',
                  axisLabel: { color: '#64748b', fontSize: 9, formatter: (value: number) => formatBytes(value) },
                  splitLine: { lineStyle: { color: '#334155', type: 'dashed', opacity: 0.5 } }
                },
                series: uniqueServices.map((svc, idx) => ({
                  name: svc,
                  type: 'bar',
                  stack: 'total',
                  data: timeSeriesData.map(d => (d as any)[svc] || 0),
                  itemStyle: { color: THEME.chartPalette[idx % THEME.chartPalette.length] }
                }))
              }}
              style={{ height: '100%', width: '100%' }}
              opts={{ renderer: 'canvas' }}
            />
          </div>
        </div>
      )}

      {/* Tags Summary */}
      {hasTags && (
        <div>
          <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest border-b border-slate-200 dark:border-slate-800 pb-2 mb-4">Tags Summary</h4>
          <div className="flex flex-wrap gap-2">
            {Array.from(tags.ioc).map(t => <span key={`ioc-${t}`} title={t} className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border max-w-full truncate ${THEME.threat.ioc.badge}`}>IOC: {t}</span>)}
            {Array.from(tags.boc).map(t => <span key={`boc-${t}`} title={t} className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border max-w-full truncate ${THEME.threat.boc.badge}`}>BOC: {t}</span>)}
            {Array.from(tags.eoc).map(t => <span key={`eoc-${t}`} title={t} className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border max-w-full truncate ${THEME.threat.eoc.badge}`}>EOC: {t}</span>)}
            {Array.from(tags.service).map(t => <span key={`svc-${t}`} title={t} className={`px-2 py-0.5 rounded-md text-[10px] font-medium border max-w-full truncate ${THEME.tags.service}`}>Service: {t}</span>)}
            {Array.from(tags.org).map(t => <span key={`org-${t}`} title={t} className={`px-2 py-0.5 rounded-md text-[10px] font-medium border max-w-full truncate ${THEME.tags.org}`}>Org: {t}</span>)}
            {Array.from(tags.domain).map(t => <span key={`dom-${t}`} title={t} className={`px-2 py-0.5 rounded-md text-[10px] font-medium border max-w-full truncate ${THEME.tags.domain}`}>Domain: {t}</span>)}
            {Array.from(tags.client).map(t => <span key={`cli-${t}`} title={t} className={`px-2 py-0.5 rounded-md text-[10px] font-medium border max-w-full truncate ${THEME.tags.client}`}>Client: {t}</span>)}
          </div>
        </div>
      )}

      {/* Raw Sessions Log */}
      {allSessions.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">
            <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Sessions ({allSessions.length})</h4>
          </div>
          <div className="space-y-3">
            {(showAllSessions ? allSessions : allSessions.slice(0, 5)).map((session, idx) => (
              <div key={idx} className={`${THEME.dashletCard} p-3 text-sm`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] text-slate-500 uppercase tracking-widest">Group ID: {session.group}</div>
                  <CopyButton text={JSON.stringify(session, null, 2)} />
                </div>
                {session.service && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {(Array.isArray(session.service) ? session.service : [session.service]).map((s: string) => (
                      <span key={s} className={`px-2 py-0.5 rounded-md text-[9px] uppercase tracking-widest font-bold ${THEME.neutralBadge}`}>{s}</span>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-1 gap-y-1">
                  {Object.entries(session).filter(([key]) => !['group', 'ip.src', 'ip.dst', 'service'].includes(key)).map(([key, value]) => (
                    <div key={key} className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-4 py-1.5 border-b border-slate-100 dark:border-slate-800/50 last:border-0">
                      <span className="text-slate-500 text-[11px] uppercase tracking-wider truncate" title={key}>{key}</span>
                      <div className="flex items-center justify-between sm:justify-end gap-2 overflow-hidden">
                        <span className="font-mono text-slate-700 dark:text-slate-300 text-xs truncate" title={key === 'time' ? formatDate(Number(value)) : String(value)}>
                          {key === 'time' ? formatDate(Number(value)) : String(value)}
                        </span>
                        <div className="flex items-center gap-1">
                          <NetWitnessLink metakey={key} value={String(value)} navigateUrl={navigateUrl} />
                          <CopyButton text={key === 'time' ? formatDate(Number(value)) : String(value)} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            
            {allSessions.length > 5 && (
              <button
                onClick={() => setShowAllSessions(!showAllSessions)}
                className={`w-full py-2 flex items-center justify-center gap-2 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 ${THEME.dashletCard} hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors`}
              >
                {showAllSessions ? <>Show Less <ChevronUp size={14} /></> : <>Show {allSessions.length - 5} More <ChevronDown size={14} /></>}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}