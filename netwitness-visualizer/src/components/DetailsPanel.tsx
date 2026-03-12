import React, { useState, useEffect, useRef } from "react";
import { GraphData, Node, Link } from "../types";
import { X, Globe, Shield, Database, Copy, ExternalLink, Network, Activity, ChevronDown, ChevronUp } from "lucide-react";
import { formatBytes, formatDate } from "../lib/utils";

interface DetailsPanelProps {
  selectedItem: Node | Link | null;
  onClose: () => void;
  graphData: GraphData;
  onNodeSelect: (node: Node) => void;
  onAttributeSelect: (attrType: string, attrValue: string) => void;
  navigateUrl?: string;
}

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
        try {
          document.execCommand('copy');
        } catch (error) {
          console.error(error);
        } finally {
          textArea.remove();
        }
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <button onClick={handleCopy} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors" title="Copy to clipboard">
      {copied ? <span className="text-[10px] text-green-500 font-medium">Copied!</span> : <Copy size={12} />}
    </button>
  );
}

function ShodanLink({ ip }: { ip: string }) {
  return (
    <a 
      href={`https://www.shodan.io/host/${ip}`} 
      target="_blank" 
      rel="noopener noreferrer"
      className="p-1 text-gray-400 hover:text-[#BE3B37] transition-colors"
      title="Lookup on Shodan"
      onClick={e => e.stopPropagation()}
    >
      <ExternalLink size={12} />
    </a>
  );
}

function NetWitnessLink({ metakey, value, navigateUrl }: { metakey: string, value: string, navigateUrl?: string }) {
  if (!navigateUrl) return null;
  
  let formattedValue = value;
  const isIPv4 = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(value);
  const isIPv6 = /^[0-9a-fA-F:]+$/.test(value) && value.includes(':');
  const isNumber = !isNaN(Number(value)) && value.trim() !== '';
  
  if (!isIPv4 && !isIPv6 && !isNumber) {
    formattedValue = `'${value}'`;
  }

  const url = `${navigateUrl.replace(/\/$/, '')}/query/${encodeURIComponent(metakey)}=${encodeURIComponent(formattedValue)}`;
  return (
    <a 
      href={url} 
      target="_blank" 
      rel="noopener noreferrer"
      className="p-1 text-gray-400 hover:text-[#BE3B37] transition-colors"
      title="View in Navigate"
      onClick={e => e.stopPropagation()}
    >
      <ExternalLink size={12} />
    </a>
  );
}

function InfoCard({ icon: Icon, label, value, valueClass = "", onClick }: { icon: any, label: string, value: string | React.ReactNode, valueClass?: string, onClick?: () => void }) {
  return (
    <div 
      className={`bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors duration-200 ${onClick ? 'cursor-pointer hover:bg-[#BE3B37]/10 dark:hover:bg-[#BE3B37]/20 hover:border-[#BE3B37]/30 dark:hover:border-[#BE3B37]/50' : ''}`}
      onClick={onClick}
    >
      <div className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1 flex items-center gap-1">
        <Icon size={12} />
        {label}
      </div>
      <div className={`text-sm font-semibold text-gray-700 dark:text-gray-300 ${valueClass}`}>
        {value}
      </div>
    </div>
  );
}

export default function DetailsPanel({
  selectedItem,
  onClose,
  graphData,
  onNodeSelect,
  onAttributeSelect,
  navigateUrl,
}: DetailsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    let mouseDownPos = { x: 0, y: 0 };

    const handleMouseDown = (e: MouseEvent) => {
      mouseDownPos = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = (e: MouseEvent) => {
      const dx = e.clientX - mouseDownPos.x;
      const dy = e.clientY - mouseDownPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < 5 && panelRef.current && !panelRef.current.contains(e.target as globalThis.Node)) {
        onClose();
      }
    };

    // Use a slight delay to prevent immediate closing when clicking a node to open it
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
    <div 
      ref={panelRef}
      className="absolute right-4 top-4 bottom-4 w-80 max-w-[calc(100vw-2rem)] bg-white dark:bg-gray-900 shadow-xl rounded-xl border border-gray-200 dark:border-gray-800 flex flex-col overflow-hidden z-10 transition-colors duration-200 animate-in slide-in-from-right-8 fade-in duration-300"
    >
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
        <h3 className="font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
          {isNode ? <Database size={18} className="text-[#BE3B37]" /> : <Network size={18} className="text-[#BE3B37]" />}
          {isNode ? "Node Details" : "Connection Details"}
        </h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-md text-gray-500 dark:text-gray-400 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isNode ? (
          <NodeDetails node={selectedItem as Node} graphData={graphData} onNodeSelect={onNodeSelect} onAttributeSelect={onAttributeSelect} navigateUrl={navigateUrl} />
        ) : (
          <LinkDetails link={selectedItem as Link} graphData={graphData} onNodeSelect={onNodeSelect} navigateUrl={navigateUrl} />
        )}
      </div>
    </div>
  );
}

function NodeDetails({ node, graphData, onNodeSelect, onAttributeSelect, navigateUrl }: { node: Node; graphData: GraphData; onNodeSelect: (node: Node) => void; onAttributeSelect: (attrType: string, attrValue: string) => void; navigateUrl?: string }) {
  if (node.type === "attribute") {
    // Find related IP nodes
    const relatedNodes = new Set<string>();
    let totalConnections = 0;
    
    graphData.nodes.forEach(n => {
      if (n.attributes && node.attrType) {
        const keysToCheck = node.attrType === 'country' ? ['country', 'country.src', 'country.dst'] : node.attrType === 'org' ? ['org', 'org.src', 'org.dst'] : [node.attrType];
        
        let hasMatch = false;
        for (const key of keysToCheck) {
          if (n.attributes[key]?.includes(node.attrValue || '')) {
            hasMatch = true;
            break;
          }
        }
        
        if (hasMatch) {
          relatedNodes.add(n.id);
        }
      }
    });
    
    graphData.links.forEach(l => {
      if (l.type === 'attribute') return;
      const sId = typeof l.source === 'object' ? (l.source as any).id : l.source;
      const tId = typeof l.target === 'object' ? (l.target as any).id : l.target;
      if (relatedNodes.has(sId) || relatedNodes.has(tId)) {
        totalConnections++;
      }
    });

    return (
      <div className="space-y-6">
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            {node.attrType} Node
          </label>
          <div className="mt-1 flex items-center justify-between font-mono text-sm text-[#BE3B37] dark:text-[#BE3B37] bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 p-2 rounded-md transition-colors duration-200">
            <span className="truncate">{node.attrValue}</span>
            <div className="flex items-center gap-1">
              <NetWitnessLink metakey={node.attrType || ''} value={node.attrValue || ''} navigateUrl={navigateUrl} />
              <CopyButton text={node.attrValue || ''} />
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <InfoCard icon={Network} label="Related IPs" value={relatedNodes.size} />
          <InfoCard icon={Activity} label="Connections" value={totalConnections} />
        </div>
        
        {relatedNodes.size > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 border-b border-gray-200 dark:border-gray-800 pb-2 transition-colors duration-200">
              Related IP Addresses
            </h4>
            <div className="space-y-2">
              {Array.from(relatedNodes).map(id => (
                <div 
                  key={id} 
                  className="flex items-center justify-between font-mono text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 p-2 rounded transition-colors duration-200 cursor-pointer hover:bg-[#BE3B37]/10 dark:hover:bg-[#BE3B37]/20 hover:border-[#BE3B37]/30 dark:hover:border-[#BE3B37]/50"
                  onClick={() => {
                    const ipNode = graphData.nodes.find(n => n.id === id);
                    if (ipNode) onNodeSelect(ipNode);
                  }}
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

  const hasAttributes = node.attributes && Object.keys(node.attributes).length > 0;

  let connectionCount = 0;
  const totalSize = graphData.links.reduce((acc, link) => {
    if (link.type === "attribute") return acc;
    const sourceId = typeof link.source === "object" ? (link.source as any).id : link.source;
    const targetId = typeof link.target === "object" ? (link.target as any).id : link.target;
    if (sourceId === node.id || targetId === node.id) {
      connectionCount++;
      return acc + (link.size || 0);
    }
    return acc;
  }, 0);

  return (
    <div className="space-y-6">
      <div>
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          IP Address
        </label>
        <div className="mt-1 flex items-center justify-between font-mono text-sm text-[#BE3B37] dark:text-[#BE3B37] bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 p-2 rounded-md transition-colors duration-200">
          <span className="truncate">{node.id}</span>
          <div className="flex items-center gap-1">
            {node.networkType === 'public' && <ShodanLink ip={node.id} />}
            <NetWitnessLink metakey="ip.all" value={node.id} navigateUrl={navigateUrl} />
            <CopyButton text={node.id} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <InfoCard icon={Database} label="Total Size" value={formatBytes(totalSize)} />
        <InfoCard icon={Activity} label="Connections" value={connectionCount} />
        
        {node.networkType && (
          <InfoCard 
            icon={Shield} 
            label="Network" 
            value={node.networkType} 
            valueClass={`capitalize ${
              node.networkType === 'public' ? 'text-[#BE3B37] dark:text-red-400' : 
              node.networkType === 'internal' ? 'text-[#BE3B37] dark:text-sky-400' : 'text-gray-700 dark:text-gray-300'
            }`} 
          />
        )}
        {node.networkType === 'internal' && node.netname && (
          <InfoCard icon={Shield} label="Netname" value={<span className="truncate block" title={node.netname}>{node.netname}</span>} />
        )}
        {node.networkType !== 'internal' && node.country && (
          <InfoCard icon={Globe} label="Country" value={node.country} onClick={() => onAttributeSelect('country', node.country!)} />
        )}
        {node.org && (
          <InfoCard icon={Globe} label="Organization" value={<span className="truncate block" title={node.org}>{node.org}</span>} onClick={() => onAttributeSelect('org', node.org!)} />
        )}
      </div>

      {hasAttributes && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 border-b border-gray-200 dark:border-gray-800 pb-2 transition-colors duration-200">
            Associated Attributes
          </h4>
          <div className="space-y-4">
            {Object.entries(node.attributes!).map(([key, values]) => (
              <div key={key}>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {key}
                </label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {values.map((val, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-1 font-mono text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 pl-2 pr-1 py-1 rounded cursor-pointer hover:bg-[#BE3B37]/10 dark:hover:bg-[#BE3B37]/20 hover:border-[#BE3B37]/30 dark:hover:border-[#BE3B37]/50 transition-colors"
                      onClick={() => onAttributeSelect(key, val)}
                    >
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
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            Attribute Link
          </label>
          <div className="mt-1 text-sm text-gray-600 dark:text-gray-400 transition-colors duration-200">
            Connects an IP node to its attribute.
          </div>
        </div>
      </div>
    );
  }

  const sourceId =
    typeof link.source === "object" ? (link.source as any).id : link.source;
  const targetId =
    typeof link.target === "object" ? (link.target as any).id : link.target;
    
  const sourceNode = graphData.nodes.find(n => n.id === sourceId);
  const targetNode = graphData.nodes.find(n => n.id === targetId);

  const tags = {
    ioc: new Set<string>(),
    boc: new Set<string>(),
    eoc: new Set<string>(),
    service: new Set<string>(),
    org: new Set<string>(),
    domain: new Set<string>(),
    client: new Set<string>()
  };

  link.sessions?.forEach((session: any) => {
    ['ioc', 'boc', 'eoc', 'service', 'org', 'domain', 'client'].forEach(key => {
      if (session[key]) {
        const vals = Array.isArray(session[key]) ? session[key] : [session[key]];
        vals.forEach((v: string) => tags[key as keyof typeof tags].add(v));
      }
    });
  });

  const hasTags = Object.values(tags).some(set => set.size > 0);

  const displaySessions = showAllSessions ? link.sessions : link.sessions?.slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            Source
          </label>
          <div 
            className="mt-1 flex items-center justify-between font-mono text-sm text-[#BE3B37] dark:text-[#BE3B37] bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 p-2 rounded-md transition-colors duration-200 cursor-pointer hover:bg-[#BE3B37]/10 dark:hover:bg-[#BE3B37]/20 hover:border-[#BE3B37]/30 dark:hover:border-[#BE3B37]/50"
            onClick={() => {
              if (sourceNode) onNodeSelect(sourceNode);
            }}
          >
            <span className="truncate">{sourceId}</span>
            <div className="flex items-center gap-1">
              {sourceNode?.networkType === 'public' && <ShodanLink ip={sourceId} />}
              <NetWitnessLink metakey="ip.all" value={sourceId} navigateUrl={navigateUrl} />
              <CopyButton text={sourceId} />
            </div>
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            Target
          </label>
          <div 
            className="mt-1 flex items-center justify-between font-mono text-sm text-[#BE3B37] dark:text-[#BE3B37] bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 p-2 rounded-md transition-colors duration-200 cursor-pointer hover:bg-[#BE3B37]/10 dark:hover:bg-[#BE3B37]/20 hover:border-[#BE3B37]/30 dark:hover:border-[#BE3B37]/50"
            onClick={() => {
              if (targetNode) onNodeSelect(targetNode);
            }}
          >
            <span className="truncate">{targetId}</span>
            <div className="flex items-center gap-1">
              {targetNode?.networkType === 'public' && <ShodanLink ip={targetId} />}
              <NetWitnessLink metakey="ip.all" value={targetId} navigateUrl={navigateUrl} />
              <CopyButton text={targetId} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <InfoCard icon={Activity} label="Total Sessions" value={link.count || 0} />
        <InfoCard icon={Database} label="Total Size" value={formatBytes(link.size || 0)} />
      </div>

      {hasTags && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 border-b border-gray-200 dark:border-gray-800 pb-2 transition-colors duration-200">
            Tags Summary
          </h4>
          <div className="flex flex-wrap gap-2">
            {Array.from(tags.ioc).map(t => <span key={`ioc-${t}`} className="px-2 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded-full text-xs font-medium border border-red-200 dark:border-red-800">IOC: {t}</span>)}
            {Array.from(tags.boc).map(t => <span key={`boc-${t}`} className="px-2 py-0.5 bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 rounded-full text-xs font-medium border border-orange-200 dark:border-orange-800">BOC: {t}</span>)}
            {Array.from(tags.eoc).map(t => <span key={`eoc-${t}`} className="px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 rounded-full text-xs font-medium border border-yellow-200 dark:border-yellow-800">EOC: {t}</span>)}
            {Array.from(tags.service).map(t => <span key={`svc-${t}`} className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full text-xs font-medium border border-blue-200 dark:border-blue-800">Service: {t}</span>)}
            {Array.from(tags.org).map(t => <span key={`org-${t}`} className="px-2 py-0.5 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded-full text-xs font-medium border border-green-200 dark:border-green-800">Org: {t}</span>)}
            {Array.from(tags.domain).map(t => <span key={`dom-${t}`} className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded-full text-xs font-medium border border-purple-200 dark:border-purple-800">Domain: {t}</span>)}
            {Array.from(tags.client).map(t => <span key={`cli-${t}`} className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full text-xs font-medium border border-gray-200 dark:border-gray-700">Client: {t}</span>)}
          </div>
        </div>
      )}

      {link.sessions && link.sessions.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3 border-b border-gray-200 dark:border-gray-800 pb-2 transition-colors duration-200">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Sessions ({link.sessions.length})
            </h4>
          </div>
          <div className="space-y-3">
            {displaySessions?.map((session, idx) => (
              <div
                key={idx}
                className="bg-gray-50 dark:bg-gray-800/30 border border-gray-200 dark:border-gray-700 rounded-md p-3 text-sm transition-colors duration-200"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs text-gray-500">
                    Group ID: {session.group}
                  </div>
                  <CopyButton text={JSON.stringify(session, null, 2)} />
                </div>
                
                {/* Render services as badges if present */}
                {session.service && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {(Array.isArray(session.service) ? session.service : [session.service]).map((s: string) => (
                      <span key={s} className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full text-[10px] uppercase tracking-wider font-semibold">
                        {s}
                      </span>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-y-1">
                  {Object.entries(session)
                    .filter(
                      ([key]) =>
                        key !== "group" && key !== "ip.src" && key !== "ip.dst" && key !== "service",
                    )
                    .map(([key, value]) => (
                      <div key={key} className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-4 py-1 border-b border-gray-100 dark:border-gray-800/50 last:border-0">
                        <span className="text-gray-500 text-xs truncate" title={key}>
                          {key}
                        </span>
                        <div className="flex items-center justify-between sm:justify-end gap-2 overflow-hidden">
                          <span
                            className="font-mono text-gray-700 dark:text-gray-300 text-xs truncate"
                            title={key === 'time' ? formatDate(Number(value)) : String(value)}
                          >
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
            
            {link.sessions.length > 5 && (
              <button
                onClick={() => setShowAllSessions(!showAllSessions)}
                className="w-full py-2 flex items-center justify-center gap-2 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors border border-gray-200 dark:border-gray-700"
              >
                {showAllSessions ? (
                  <>Show Less <ChevronUp size={14} /></>
                ) : (
                  <>Show {link.sessions.length - 5} More <ChevronDown size={14} /></>
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
