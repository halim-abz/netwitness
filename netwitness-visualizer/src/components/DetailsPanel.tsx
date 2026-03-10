import React from "react";
import { GraphData, Node, Link } from "../types";
import { X, Globe, Shield } from "lucide-react";
import { formatBytes } from "../lib/utils";

interface DetailsPanelProps {
  selectedItem: Node | Link | null;
  onClose: () => void;
  graphData: GraphData;
  onNodeSelect: (node: Node) => void;
  onAttributeSelect: (attrType: string, attrValue: string) => void;
}

export default function DetailsPanel({
  selectedItem,
  onClose,
  graphData,
  onNodeSelect,
  onAttributeSelect,
}: DetailsPanelProps) {
  if (!selectedItem) return null;

  const isNode = "id" in selectedItem;

  return (
    <div className="absolute right-4 top-4 bottom-4 w-80 max-w-[calc(100vw-2rem)] bg-white dark:bg-slate-900 shadow-xl rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden z-10 transition-colors duration-200">
      <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 transition-colors duration-200">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100">
          {isNode ? "Node Details" : "Connection Details"}
        </h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md text-slate-500 dark:text-slate-400 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isNode ? (
          <NodeDetails node={selectedItem as Node} graphData={graphData} onNodeSelect={onNodeSelect} onAttributeSelect={onAttributeSelect} />
        ) : (
          <LinkDetails link={selectedItem as Link} graphData={graphData} onNodeSelect={onNodeSelect} />
        )}
      </div>
    </div>
  );
}

function NodeDetails({ node, graphData, onNodeSelect, onAttributeSelect }: { node: Node; graphData: GraphData; onNodeSelect: (node: Node) => void; onAttributeSelect: (attrType: string, attrValue: string) => void }) {
  if (node.type === "attribute") {
    // Find related IP nodes
    const relatedNodes = new Set<string>();
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

    return (
      <div className="space-y-6">
        <div>
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
            {node.attrType} Node
          </label>
          <div className="mt-1 font-mono text-sm text-indigo-600 dark:text-cyan-400 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-2 rounded-md transition-colors duration-200">
            {node.attrValue}
          </div>
        </div>
        
        {relatedNodes.size > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 border-b border-slate-200 dark:border-slate-800 pb-2 transition-colors duration-200">
              Related IP Addresses ({relatedNodes.size})
            </h4>
            <div className="space-y-2">
              {Array.from(relatedNodes).map(id => (
                <div 
                  key={id} 
                  className="font-mono text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-2 rounded transition-colors duration-200 cursor-pointer hover:bg-indigo-50 dark:hover:bg-cyan-900/30 hover:border-indigo-300 dark:hover:border-cyan-500"
                  onClick={() => {
                    const ipNode = graphData.nodes.find(n => n.id === id);
                    if (ipNode) onNodeSelect(ipNode);
                  }}
                >
                  {id}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const hasAttributes = node.attributes && Object.keys(node.attributes).length > 0;

  return (
    <div className="space-y-6">
      <div>
        <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
          IP Address
        </label>
        <div className="mt-1 font-mono text-sm text-indigo-600 dark:text-cyan-400 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-2 rounded-md transition-colors duration-200">
          {node.id}
        </div>
      </div>

      {(node.networkType || node.country || node.netname || node.org) && (
        <div className="grid grid-cols-2 gap-4">
          {node.networkType && (
            <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors duration-200">
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1 flex items-center gap-1">
                <Shield size={12} />
                Network
              </div>
              <div className={`text-sm font-semibold capitalize ${
                node.networkType === 'public' ? 'text-red-600 dark:text-red-400' : 
                node.networkType === 'internal' ? 'text-indigo-600 dark:text-sky-400' : 'text-slate-700 dark:text-slate-300'
              }`}>
                {node.networkType}
              </div>
            </div>
          )}
          {node.networkType === 'internal' && node.netname && (
            <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors duration-200">
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1 flex items-center gap-1">
                <Shield size={12} />
                Netname
              </div>
              <div className="text-sm font-semibold text-slate-700 dark:text-slate-300 truncate" title={node.netname}>
                {node.netname}
              </div>
            </div>
          )}
          {node.networkType !== 'internal' && node.country && (
            <div 
              className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors duration-200 cursor-pointer hover:bg-indigo-50 dark:hover:bg-cyan-900/30 hover:border-indigo-300 dark:hover:border-cyan-500"
              onClick={() => onAttributeSelect('country', node.country!)}
            >
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1 flex items-center gap-1">
                <Globe size={12} />
                Country
              </div>
              <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                {node.country}
              </div>
            </div>
          )}
          {node.org && (
            <div 
              className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors duration-200 cursor-pointer hover:bg-indigo-50 dark:hover:bg-cyan-900/30 hover:border-indigo-300 dark:hover:border-cyan-500"
              onClick={() => onAttributeSelect('org', node.org!)}
            >
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1 flex items-center gap-1">
                <Globe size={12} />
                Organization
              </div>
              <div className="text-sm font-semibold text-slate-700 dark:text-slate-300 truncate" title={node.org}>
                {node.org}
              </div>
            </div>
          )}
        </div>
      )}

      {hasAttributes && (
        <div>
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 border-b border-slate-200 dark:border-slate-800 pb-2 transition-colors duration-200">
            Associated Attributes
          </h4>
          <div className="space-y-4">
            {Object.entries(node.attributes!).map(([key, values]) => (
              <div key={key}>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  {key}
                </label>
                <div className="mt-1 space-y-1">
                  {values.map((val, idx) => (
                    <div
                      key={idx}
                      className="font-mono text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-1.5 rounded break-all cursor-pointer hover:bg-indigo-50 dark:hover:bg-cyan-900/30 hover:border-indigo-300 dark:hover:border-cyan-500 transition-colors"
                      onClick={() => {
                        onAttributeSelect(key, val);
                      }}
                    >
                      {val}
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

function LinkDetails({ link, graphData, onNodeSelect }: { link: Link; graphData: GraphData; onNodeSelect: (node: Node) => void }) {
  if (link.type === "attribute") {
    return (
      <div className="space-y-6">
        <div>
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
            Attribute Link
          </label>
          <div className="mt-1 text-sm text-slate-600 dark:text-slate-400 transition-colors duration-200">
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

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div>
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
            Source
          </label>
          <div 
            className="mt-1 font-mono text-sm text-indigo-600 dark:text-cyan-400 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-2 rounded-md transition-colors duration-200 cursor-pointer hover:bg-indigo-50 dark:hover:bg-cyan-900/30 hover:border-indigo-300 dark:hover:border-cyan-500"
            onClick={() => {
              const srcNode = graphData.nodes.find(n => n.id === sourceId);
              if (srcNode) onNodeSelect(srcNode);
            }}
          >
            {sourceId}
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
            Target
          </label>
          <div 
            className="mt-1 font-mono text-sm text-indigo-600 dark:text-cyan-400 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-2 rounded-md transition-colors duration-200 cursor-pointer hover:bg-indigo-50 dark:hover:bg-cyan-900/30 hover:border-indigo-300 dark:hover:border-cyan-500"
            onClick={() => {
              const tgtNode = graphData.nodes.find(n => n.id === targetId);
              if (tgtNode) onNodeSelect(tgtNode);
            }}
          >
            {targetId}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors duration-200">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">
            Total Sessions
          </div>
          <div className="text-xl font-semibold text-slate-800 dark:text-slate-200">
            {link.count || 0}
          </div>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors duration-200">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">
            Total Size
          </div>
          <div className="text-xl font-semibold text-slate-800 dark:text-slate-200">
            {formatBytes(link.size || 0)}
          </div>
        </div>
      </div>

      {link.sessions && link.sessions.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 border-b border-slate-200 dark:border-slate-800 pb-2 transition-colors duration-200">
            Sessions ({link.sessions.length})
          </h4>
          <div className="space-y-3">
            {link.sessions.map((session, idx) => (
              <div
                key={idx}
                className="bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700 rounded-md p-3 text-sm transition-colors duration-200"
              >
                <div className="text-xs text-slate-500 mb-2">
                  Group ID: {session.group}
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                  {Object.entries(session)
                    .filter(
                      ([key]) =>
                        key !== "group" && key !== "ip.src" && key !== "ip.dst",
                    )
                    .map(([key, value]) => (
                      <React.Fragment key={key}>
                        <div className="text-slate-500 truncate" title={key}>
                          {key}:
                        </div>
                        <div
                          className="font-mono text-slate-700 dark:text-slate-300 truncate"
                          title={String(value)}
                        >
                          {String(value)}
                        </div>
                      </React.Fragment>
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
