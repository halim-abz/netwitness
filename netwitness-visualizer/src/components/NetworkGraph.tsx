import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { GraphData, Node, Link } from "../types";
import { ChevronDown, ChevronUp, Filter, Network, Activity } from "lucide-react";
import { formatBytes } from "../lib/utils";

interface NetworkGraphProps {
  data: GraphData;
  onNodeClick: (node: Node) => void;
  onLinkClick: (link: Link) => void;
  displayedAttributes: string[];
  availableAttributes: string[];
  onToggleAttribute: (attr: string) => void;
  isDark: boolean;
  selectedItem: Node | Link | null;
}

export default function NetworkGraph({
  data,
  onNodeClick,
  onLinkClick,
  displayedAttributes,
  availableAttributes,
  onToggleAttribute,
  isDark,
  selectedItem,
}: NetworkGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLegendOpen, setIsLegendOpen] = useState(true);
  const [attributeFilters, setAttributeFilters] = useState<Record<string, string>>({});
  const [expandedFilters, setExpandedFilters] = useState<Record<string, boolean>>({});
  const [hoveredItem, setHoveredItem] = useState<Node | Link | null>(null);
  const [lastHoveredItem, setLastHoveredItem] = useState<Node | Link | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const mousePosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseMove = (e: MouseEvent) => {
      mousePosRef.current = { x: e.clientX, y: e.clientY };
    };

    container.addEventListener('mousemove', handleMouseMove);
    return () => container.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
    if (hoveredItem) {
      setLastHoveredItem(hoveredItem);
      if (tooltipRef.current) {
        tooltipRef.current.style.transform = `translate(${mousePosRef.current.x + 15}px, ${mousePosRef.current.y + 15}px)`;
      }
    }
  }, [hoveredItem]);

const CATEGORY_COLORS = [
  "#3cb44b", // Green
  "#ffe119", // Yellow
  "#4363d8", // Blue
  "#f58231", // Orange
  "#911eb4", // Purple
  "#f032e6", // Magenta
  "#469990", // Teal
  "#9A6324", // Brown
  "#808000", // Olive
  "#ff7f50", // Coral
  "#f59e0b", // amber
  "#10b981", // emerald
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#BE3B37", // NetWitness Red
  "#006400", // Dark Green
  "#8b008b", // Dark Magenta
  "#4682b4", // Steel Blue
  "#ff1493", // Deep Pink
  "#2f4f4f", // Dark Slate Gray
  "#adff2f" // Green Yellow
];

  const getColor = (attr: string) => {
    const index = availableAttributes.indexOf(attr);
    return CATEGORY_COLORS[Math.max(0, index) % CATEGORY_COLORS.length];
  };

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || !data.nodes.length) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Setup zoom
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom);

    // Add defs for arrow marker
    const defs = svg.append("defs");
    defs.append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 25) // adjust based on node radius
      .attr("refY", 0)
      .attr("orient", "auto")
      .attr("markerWidth", 12)
      .attr("markerHeight", 12)
      .attr("markerUnits", "userSpaceOnUse")
      .append("path")
      .attr("d", "M 0,-5 L 10,0 L 0,5")
      .attr("fill", isDark ? "#94a3b8" : "#475569");

    const g = svg.append("g");

    // Filter nodes based on attributeFilters
    const filteredNodes = data.nodes.filter(node => {
      const checkFilter = (value: string, filterText: string) => {
        if (!filterText) return true;
        const isExclude = filterText.startsWith('!');
        const textToMatch = isExclude ? filterText.slice(1).toLowerCase() : filterText.toLowerCase();
        if (!textToMatch) return true;
        const includes = value.toLowerCase().includes(textToMatch);
        return isExclude ? !includes : includes;
      };

      if (attributeFilters['Internal IP']) {
        if (node.networkType === 'internal' && !checkFilter(node.id, attributeFilters['Internal IP'])) {
          return false;
        }
      }
      if (attributeFilters['Public IP']) {
        if (node.networkType === 'public' && !checkFilter(node.id, attributeFilters['Public IP'])) {
          return false;
        }
      }

      for (const [attr, filterText] of Object.entries(attributeFilters)) {
        if (attr === 'Internal IP' || attr === 'Public IP') continue;
        if (!filterText || !displayedAttributes.includes(attr)) continue;
        
        const isExclude = filterText.startsWith('!');
        const textToMatch = isExclude ? filterText.slice(1).toLowerCase() : filterText.toLowerCase();
        if (!textToMatch) continue;

        const keysToCheck = attr === 'country' ? ['country', 'country.src', 'country.dst'] : attr === 'org' ? ['org', 'org.src', 'org.dst'] : [attr];
        let matches = false;
        keysToCheck.forEach(key => {
          if (node.attributes && node.attributes[key]) {
            if (node.attributes[key].some(val => String(val).toLowerCase().includes(textToMatch))) {
              matches = true;
            }
          }
        });
        
        if (isExclude) {
          if (matches) return false;
        } else {
          if (!matches) return false;
        }
      }
      return true;
    });

    const filteredNodeIds = new Set(filteredNodes.map(n => n.id));
    const filteredLinks = data.links.filter(l => {
      const sId = typeof l.source === 'object' ? l.source.id : l.source;
      const tId = typeof l.target === 'object' ? l.target.id : l.target;
      return filteredNodeIds.has(sId) && filteredNodeIds.has(tId);
    });

    const hasIpFilters = (attributeFilters['Internal IP']?.trim() || attributeFilters['Public IP']?.trim());
    const connectedNodeIds = new Set<string>();
    if (hasIpFilters) {
      filteredLinks.forEach(l => {
        const sId = typeof l.source === 'object' ? l.source.id : l.source;
        const tId = typeof l.target === 'object' ? l.target.id : l.target;
        connectedNodeIds.add(sId);
        connectedNodeIds.add(tId);
      });
    }

    const finalFilteredNodes = hasIpFilters 
      ? filteredNodes.filter(n => connectedNodeIds.has(n.id))
      : filteredNodes;

    // Create a copy of the data for d3 to mutate, and augment with attribute nodes
    const augmentedNodes: Node[] = finalFilteredNodes.map((d) => ({ ...d }));
    const augmentedLinks: Link[] = filteredLinks.map((d) => ({ ...d, type: "traffic" }));

    // Map to keep track of created attribute nodes to avoid duplicates
    const attributeNodesMap = new Map<string, Node>();

    finalFilteredNodes.forEach((node) => {
      displayedAttributes.forEach((attr) => {
        if (attr === 'service') return; // Don't create attribute nodes for service
        const keysToCheck = attr === 'country' ? ['country', 'country.src', 'country.dst'] : attr === 'org' ? ['org', 'org.src', 'org.dst'] : [attr];
        
        keysToCheck.forEach(key => {
          if (node.attributes && node.attributes[key]) {
            node.attributes[key].forEach((val) => {
              // Use a global ID for the attribute so it's shared across IPs
              const subNodeId = `attr-${attr}-${val}`;
              
              if (!attributeNodesMap.has(subNodeId)) {
                const newAttrNode = {
                  id: subNodeId,
                  type: "attribute",
                  attrType: attr,
                  attrValue: val,
                };
                attributeNodesMap.set(subNodeId, newAttrNode);
                augmentedNodes.push(newAttrNode);
              }

              augmentedLinks.push({
                source: node.id,
                target: subNodeId,
                type: "attribute",
              });
            });
          }
        });
      });
    });

    // Setup force simulation
    const simulation = d3
      .forceSimulation(augmentedNodes as any)
      .force(
        "link",
        d3
          .forceLink(augmentedLinks)
          .id((d: any) => d.id)
          .distance((d: any) => (d.type === "attribute" ? 100 : 200)),
      )
      .force("charge", d3.forceManyBody().strength((d: any) => (d.type === "attribute" ? -300 : -800)))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius((d: any) => (d.type === "attribute" ? 40 : 60)));

    // Fast-forward simulation for large graphs to prevent janky animations
    if (augmentedNodes.length > 50) {
      simulation.stop();
      const ticks = Math.min(300, Math.ceil(Math.log(simulation.alphaMin()) / Math.log(1 - simulation.alphaDecay())));
      for (let i = 0; i < ticks; ++i) {
        simulation.tick();
      }
    }

    // Draw links
    const link = g
      .append("g")
      .selectAll("line")
      .data(augmentedLinks)
      .join("line")
      .attr("class", "graph-link")
      .attr("stroke", (d: any) => {
        if (d.type === "attribute") {
           const attrType = d.target.attrType || (typeof d.target === 'string' ? d.target.split('-')[1] : "default");
           return getColor(attrType);
        }
        return isDark ? "#475569" : "#94a3b8";
      })
      .attr("stroke-dasharray", (d) => (d.type === "attribute" ? "4,4" : "none"))
      .attr("stroke-opacity", (d) => d.type === "attribute" ? 0.6 : 0.8)
      .attr("stroke-width", (d) =>
        d.type === "attribute"
          ? 1
          : Math.max(1.5, Math.min(10, Math.sqrt(d.size || 0) / 10 || (d.count || 1))),
      )
      .attr("marker-end", (d) => (d.type === "attribute" ? null : "url(#arrowhead)"))
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        event.stopPropagation();
        onLinkClick(d as unknown as Link);
      });

    // Draw link labels for services
    const showServiceLabels = displayedAttributes.includes('service');
    const linkLabel = g
      .append("g")
      .selectAll("text")
      .data(showServiceLabels ? augmentedLinks.filter((d: any) => d.type !== "attribute" && d.services && d.services.length > 0) : [])
      .join("text")
      .attr("class", "link-label")
      .attr("font-size", "10px")
      .attr("font-family", "monospace")
      .attr("fill", isDark ? "#94a3b8" : "#64748b")
      .attr("text-anchor", "middle")
      .attr("dy", -5)
      .text((d: any) => d.services.join(", "));

    // Draw nodes
    const node = g
      .append("g")
      .selectAll("g")
      .data(augmentedNodes)
      .join("g")
      .attr("class", "graph-node")
      .style("cursor", "pointer")
      .call(
        d3
          .drag<any, any>()
          .on("start", dragstarted)
          .on("drag", dragged)
          .on("end", dragended),
      )
      .on("click", (event, d) => {
        event.stopPropagation();
        onNodeClick(d as unknown as Node);
      });

    node.each(function(d: any) {
      const el = d3.select(this);
      if (d.type === "attribute") {
        el.append("rect")
          .attr("width", 20)
          .attr("height", 20)
          .attr("x", -10)
          .attr("y", -10)
          .attr("rx", 4)
          .attr("transform", "rotate(45)")
          .attr("fill", getColor(d.attrType || "default"))
          .attr("stroke", isDark ? "#0f172a" : "#ffffff")
          .attr("stroke-width", 2)
          .style("filter", `drop-shadow(0 0 6px ${getColor(d.attrType || "default")}80)`);
      } else {
        const color = d.networkType === "public" ? "#BE3B37" : (d.networkType === "internal" ? (isDark ? "#0ea5e9" : "#3b82f6") : "#64748b");
        el.append("circle")
          .attr("r", 15)
          .attr("fill", color)
          .attr("stroke", isDark ? "#0f172a" : "#ffffff")
          .attr("stroke-width", 2)
          .style("filter", `drop-shadow(0 0 8px ${color}80)`);
          
        // Inner highlight
        el.append("circle")
          .attr("r", 13)
          .attr("fill", "none")
          .attr("stroke", "rgba(255,255,255,0.2)")
          .attr("stroke-width", 1);
      }
    });

    node
      .append("text")
      .text((d) => (d.type === "attribute" ? d.attrValue || "" : d.id))
      .attr("x", (d) => (d.type === "attribute" ? 16 : 22))
      .attr("y", (d) => (d.type === "attribute" ? 4 : 5))
      .attr("font-size", (d) => (d.type === "attribute" ? "10px" : "12px"))
      .attr("font-weight", (d) => (d.type === "attribute" ? "normal" : "600"))
      .attr("font-family", "monospace")
      .attr("fill", (d) => (d.type === "attribute" ? (isDark ? "#94a3b8" : "#64748b") : (isDark ? "#e2e8f0" : "#334155")))
      .attr("paint-order", "stroke")
      .attr("stroke", isDark ? "#0f172a" : "#ffffff")
      .attr("stroke-width", 3)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round");

    // Add hover handlers
    node.on("mouseenter", (event, d) => {
      setHoveredItem(d as unknown as Node);
    })
    .on("mouseleave", () => {
      setHoveredItem(null);
    });

    link.on("mouseenter", (event, d) => {
      setHoveredItem(d as unknown as Link);
    })
    .on("mouseleave", () => {
      setHoveredItem(null);
    });

    const updatePositions = () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      linkLabel
        .attr("x", (d: any) => (d.source.x + d.target.x) / 2)
        .attr("y", (d: any) => (d.source.y + d.target.y) / 2);

      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    };

    if (augmentedNodes.length > 50) {
      updatePositions();
    }

    simulation.on("tick", updatePositions);

    function dragstarted(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: any) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0);
      // Do not clear fx/fy so nodes stay where dropped
    }

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      if (!containerRef.current) return;
      const newWidth = containerRef.current.clientWidth;
      const newHeight = containerRef.current.clientHeight;
      svg.attr("width", newWidth).attr("height", newHeight);
      simulation.force("center", d3.forceCenter(newWidth / 2, newHeight / 2));
      simulation.alpha(0.3).restart();
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      simulation.stop();
      resizeObserver.disconnect();
    };
  }, [data, onNodeClick, onLinkClick, displayedAttributes, isDark, attributeFilters]);

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const nodes = svg.selectAll(".graph-node");
    const links = svg.selectAll(".graph-link");
    const linkLabels = svg.selectAll(".link-label");

    if (!selectedItem) {
      nodes.style("opacity", 1).style("transition", "opacity 0.3s");
      nodes.selectAll("circle:first-child, rect").attr("stroke", isDark ? "#0f172a" : "#ffffff").attr("stroke-width", 2);
      links.style("opacity", (d: any) => d.type === "attribute" ? 0.6 : 0.8).style("transition", "opacity 0.3s");
      linkLabels.style("opacity", 1).style("transition", "opacity 0.3s");
      return;
    }

    if ("source" in selectedItem) {
      // Link selected
      const sourceId = typeof selectedItem.source === "object" ? (selectedItem.source as any).id : selectedItem.source;
      const targetId = typeof selectedItem.target === "object" ? (selectedItem.target as any).id : selectedItem.target;
      
      nodes.style("opacity", (d: any) => (d.id === sourceId || d.id === targetId ? 1 : 0.1)).style("transition", "opacity 0.3s");
      nodes.selectAll("circle:first-child, rect").attr("stroke", (d: any) => {
        if (d.id === sourceId || d.id === targetId) return "#f59e0b"; // amber
        return isDark ? "#0f172a" : "#ffffff";
      }).attr("stroke-width", (d: any) => {
        if (d.id === sourceId || d.id === targetId) return 3;
        return 2;
      });
      links.style("opacity", (d: any) => {
        const sId = typeof d.source === "object" ? d.source.id : d.source;
        const tId = typeof d.target === "object" ? d.target.id : d.target;
        return (sId === sourceId && tId === targetId) ? 0.8 : 0.05;
      }).style("transition", "opacity 0.3s");
      linkLabels.style("opacity", (d: any) => {
        const sId = typeof d.source === "object" ? d.source.id : d.source;
        const tId = typeof d.target === "object" ? d.target.id : d.target;
        return (sId === sourceId && tId === targetId) ? 1 : 0.05;
      }).style("transition", "opacity 0.3s");
    } else {
      // Node selected
      const connectedIds = new Set<string>([selectedItem.id]);
      
      // Find all links connected to this node
      links.each((d: any) => {
        const sId = typeof d.source === "object" ? d.source.id : d.source;
        const tId = typeof d.target === "object" ? d.target.id : d.target;
        if (sId === selectedItem.id) connectedIds.add(tId);
        if (tId === selectedItem.id) connectedIds.add(sId);
      });

      nodes.style("opacity", (d: any) => (connectedIds.has(d.id) ? 1 : 0.1)).style("transition", "opacity 0.3s");
      nodes.selectAll("circle:first-child, rect").attr("stroke", (d: any) => {
        if (d.id === selectedItem.id) return "#f59e0b"; // amber
        return isDark ? "#0f172a" : "#ffffff";
      }).attr("stroke-width", (d: any) => {
        if (d.id === selectedItem.id) return 3;
        return 2;
      });
      links.style("opacity", (d: any) => {
        const sId = typeof d.source === "object" ? d.source.id : d.source;
        const tId = typeof d.target === "object" ? d.target.id : d.target;
        return (connectedIds.has(sId) && connectedIds.has(tId)) ? 0.8 : 0.05;
      }).style("transition", "opacity 0.3s");
      linkLabels.style("opacity", (d: any) => {
        const sId = typeof d.source === "object" ? d.source.id : d.source;
        const tId = typeof d.target === "object" ? d.target.id : d.target;
        return (connectedIds.has(sId) && connectedIds.has(tId)) ? 1 : 0.05;
      }).style("transition", "opacity 0.3s");
    }
  }, [selectedItem, data, displayedAttributes]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-gray-50 dark:bg-gray-950 rounded-xl overflow-hidden shadow-inner relative border border-gray-200 dark:border-gray-800 transition-colors duration-200 bg-grid-pattern animate-grid"
    >
      <svg ref={svgRef} className="w-full h-full" />
      
      {/* Top Right Stats Bar */}
      <div className="absolute top-4 right-4 z-10 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md px-4 py-2 rounded-lg shadow-md border border-gray-200 dark:border-gray-800 flex items-center gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
        <div className="flex items-center gap-2">
          <Network size={16} className="text-gray-500 dark:text-gray-400" />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{data.nodes.length} Nodes</span>
        </div>
        <div className="w-px h-4 bg-gray-300 dark:bg-gray-700"></div>
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-gray-500 dark:text-gray-400" />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{data.links.length} Links</span>
        </div>
      </div>

      <div className="absolute bottom-4 left-4 z-10 bg-white/95 dark:bg-gray-900/90 backdrop-blur p-3 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 max-w-[800px] animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div 
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setIsLegendOpen(!isLegendOpen)}
        >
          <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-400 uppercase tracking-wider pr-4 flex items-center gap-2">
            <Activity size={14} className="text-[#BE3B37]" />
            Legend & Display
          </h4>
          {isLegendOpen ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronUp size={14} className="text-gray-500" />}
        </div>
        
        {isLegendOpen && (
          <div className="space-y-3 mt-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between group">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-blue-500 dark:bg-sky-500 border-2 border-white dark:border-gray-950 shadow-sm shrink-0"></div>
                    <span className="text-xs text-gray-700 dark:text-gray-300 font-medium">Internal IP</span>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setExpandedFilters(prev => ({...prev, 'Internal IP': !prev['Internal IP']})) }}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Filter size={10} />
                  </button>
                </div>
                {expandedFilters['Internal IP'] && (
                  <input
                    type="text"
                    placeholder={`Filter Internal IP...`}
                    value={attributeFilters['Internal IP'] || ''}
                    onChange={(e) => setAttributeFilters(prev => ({ ...prev, 'Internal IP': e.target.value }))}
                    className="px-2 py-1 text-[10px] bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-gray-700 dark:text-gray-300 focus:outline-none focus:border-[#BE3B37] w-full"
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between group">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-[#BE3B37] border-2 border-white dark:border-gray-950 shadow-sm shrink-0"></div>
                    <span className="text-xs text-gray-700 dark:text-gray-300 font-medium">Public IP</span>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setExpandedFilters(prev => ({...prev, 'Public IP': !prev['Public IP']})) }}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Filter size={10} />
                  </button>
                </div>
                {expandedFilters['Public IP'] && (
                  <input
                    type="text"
                    placeholder={`Filter Public IP...`}
                    value={attributeFilters['Public IP'] || ''}
                    onChange={(e) => setAttributeFilters(prev => ({ ...prev, 'Public IP': e.target.value }))}
                    className="px-2 py-1 text-[10px] bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-gray-700 dark:text-gray-300 focus:outline-none focus:border-[#BE3B37] w-full"
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
              </div>
            </div>
            
            {availableAttributes.length > 0 && (
              <div className="pt-2 mt-2 border-t border-gray-200 dark:border-gray-700">
                <div className="text-[10px] text-gray-500 dark:text-gray-400 mb-2">Click to toggle attributes, click filter icon to search</div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2 max-h-60 overflow-y-auto pr-1">
                  {availableAttributes.map(attr => {
                    const isActive = displayedAttributes.includes(attr);
                    return (
                      <div key={attr} className="flex flex-col gap-1">
                        <div className="flex items-center justify-between group">
                          <div 
                            className={`flex items-center gap-2 cursor-pointer transition-opacity hover:opacity-80 ${isActive ? 'opacity-100' : 'opacity-40'}`}
                            onClick={() => onToggleAttribute(attr)}
                          >
                            <div className="w-3 h-3 rounded-sm border border-white dark:border-gray-950 shadow-sm shrink-0" style={{ backgroundColor: isActive ? getColor(attr) : '#94a3b8' }}></div>
                            <span className={`text-xs font-medium truncate ${isActive ? 'text-gray-800 dark:text-gray-300' : 'text-gray-500 dark:text-gray-500'}`}>{attr}</span>
                          </div>
                          {isActive && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); setExpandedFilters(prev => ({...prev, [attr]: !prev[attr]})) }}
                              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Filter size={10} />
                            </button>
                          )}
                        </div>
                        {isActive && expandedFilters[attr] && (
                          <input
                            type="text"
                            placeholder={`Filter ${attr}...`}
                            value={attributeFilters[attr] || ''}
                            onChange={(e) => setAttributeFilters(prev => ({ ...prev, [attr]: e.target.value }))}
                            className="px-2 py-1 text-[10px] bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-gray-700 dark:text-gray-300 focus:outline-none focus:border-[#BE3B37] w-full"
                            onClick={(e) => e.stopPropagation()}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {data.nodes.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 pointer-events-none animate-in fade-in duration-700">
          <Network size={48} className="mb-4 opacity-50" />
          <h3 className="text-lg font-semibold mb-1 text-gray-600 dark:text-gray-300">No Network Data</h3>
          <p className="text-sm">Run a query to visualize network connections.</p>
        </div>
      )}

      {/* Hover Tooltip */}
      <div 
        ref={tooltipRef}
        className={`fixed left-0 top-0 z-50 pointer-events-none bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-xl rounded-lg p-3 text-sm transition-opacity duration-200 ${hoveredItem ? 'opacity-100' : 'opacity-0'}`}
        style={{ 
          maxWidth: '300px',
          willChange: 'transform, opacity'
        }}
      >
        {lastHoveredItem && (
          ('source' in lastHoveredItem) ? (
            // Link Tooltip
            <div className="space-y-2">
              <div className="font-semibold text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-700 pb-1 mb-1">
                Connection Details
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500 dark:text-gray-400">Source:</span>
                <span className="font-mono text-right truncate">{(lastHoveredItem.source as any).id || lastHoveredItem.source}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500 dark:text-gray-400">Target:</span>
                <span className="font-mono text-right truncate">{(lastHoveredItem.target as any).id || lastHoveredItem.target}</span>
              </div>
              {lastHoveredItem.type !== 'attribute' && (
                <>
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-500 dark:text-gray-400">Sessions:</span>
                    <span className="font-semibold">{lastHoveredItem.count}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-500 dark:text-gray-400">Size:</span>
                    <span className="font-semibold">{formatBytes(lastHoveredItem.size || 0)}</span>
                  </div>
                  {(lastHoveredItem as Link).services && (lastHoveredItem as Link).services!.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                      <span className="text-gray-500 dark:text-gray-400 block mb-1">Services:</span>
                      <div className="flex flex-wrap gap-1">
                        {(lastHoveredItem as Link).services!.map((s: string) => (
                          <span key={s} className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded text-[10px] uppercase tracking-wider">{s}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            // Node Tooltip
            <div className="space-y-2">
              <div className="font-semibold text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-700 pb-1 mb-1 flex items-center gap-2">
                {lastHoveredItem.type === 'attribute' ? (
                  <div className="w-2 h-2 rounded-sm transform rotate-45" style={{ backgroundColor: getColor(lastHoveredItem.attrType || '') }}></div>
                ) : (
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: lastHoveredItem.networkType === 'public' ? '#BE3B37' : (lastHoveredItem.networkType === 'internal' ? (isDark ? '#0ea5e9' : '#3b82f6') : '#64748b') }}></div>
                )}
                <span className="font-mono truncate">{lastHoveredItem.type === 'attribute' ? lastHoveredItem.attrValue : lastHoveredItem.id}</span>
              </div>
              
              {lastHoveredItem.type === 'attribute' ? (
                <div className="flex justify-between gap-4">
                  <span className="text-gray-500 dark:text-gray-400">Type:</span>
                  <span className="font-semibold capitalize">{lastHoveredItem.attrType}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-500 dark:text-gray-400">Network:</span>
                    <span className="font-semibold capitalize">{lastHoveredItem.networkType}</span>
                  </div>
                  {lastHoveredItem.country && (
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-500 dark:text-gray-400">Country:</span>
                      <span className="font-semibold">{lastHoveredItem.country}</span>
                    </div>
                  )}
                  {lastHoveredItem.org && (
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-500 dark:text-gray-400">Org:</span>
                      <span className="font-semibold truncate max-w-[150px]">{lastHoveredItem.org}</span>
                    </div>
                  )}
                  {lastHoveredItem.attributes && Object.keys(lastHoveredItem.attributes).length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                      <span className="text-gray-500 dark:text-gray-400 block mb-1">Attributes:</span>
                      <div className="space-y-1">
                        {Object.entries(lastHoveredItem.attributes).slice(0, 5).map(([k, v]) => (
                          <div key={k} className="flex justify-between gap-2 text-[10px]">
                            <span className="text-gray-500">{k}:</span>
                            <span className="truncate max-w-[150px]">{v.join(', ')}</span>
                          </div>
                        ))}
                        {Object.keys(lastHoveredItem.attributes).length > 5 && (
                          <div className="text-[10px] text-gray-400 italic">+{Object.keys(lastHoveredItem.attributes).length - 5} more</div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}
