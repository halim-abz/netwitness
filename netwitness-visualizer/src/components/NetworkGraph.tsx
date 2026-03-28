/**
 * NetworkGraph.tsx
 * * This component renders a 2D force-directed graph of network connections using D3.js.
 * It visualizes relationships between IP addresses and their associated attributes
 * (e.g., services, countries, organizations).
 * Key features include:
 * - D3 force simulation for dynamic layout.
 * - Zoom and pan interactions.
 * - Node and link highlighting on hover/selection.
 * - Legend for attribute filtering and display toggling.
 */

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { renderToString } from "react-dom/server";
import * as d3 from "d3";
import { GraphData, Node, Link } from "../types";
import { 
  ChevronDown, ChevronUp, Filter, Network, Activity,
  Monitor, Server, AppWindow, Router, Globe, Building, User, Mail, MapPin, FileText, Hash,
  Target, Zap, AlertCircle, Lock
} from "lucide-react";
import { formatBytes } from "../lib/utils";
import { useTooltip } from "../hooks/useTooltip";
import { filterAndAugmentGraph } from "../lib/graphFilters";

// ==========================================
// PERSISTENCE CACHE
// Prevents layout, zoom, and filters from resetting 
// across data refreshes or temporary unmounts.
// ==========================================
const persistenceCache = {
  zoom: null as d3.ZoomTransform | null,
  nodePositions: new Map<string, {x?: number, y?: number, fx?: number | null, fy?: number | null}>(),
  attributeFilters: {} as Record<string, string>,
  expandedFilters: {} as Record<string, boolean>
};

// ==========================================
// TYPES & INTERFACES
// ==========================================

export interface NetworkGraphProps {
  data: GraphData;
  onNodeClick: (node: Node) => void;
  onLinkClick: (link: Link) => void;
  displayedAttributes: string[];
  availableAttributes: string[];
  onToggleAttribute: (attr: string) => void;
  isDark: boolean;
  selectedItem: Node | Link | null;
}

interface GraphNode extends Node, d3.SimulationNodeDatum {
  type: string;
  networkType?: "internal" | "public" | "unknown";
  attrType?: string;
  attrValue?: string;
  country?: string;
  org?: string;
  attributes?: Record<string, string[]>;
  role?: "client" | "server" | "mixed"; // Added for tooltip
}

interface GraphLink extends Omit<Link, 'source' | 'target'>, d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  type: string;
  count?: number;
  size?: number;
  services?: string[];
}

// ==========================================
// CONSTANTS & CONFIGURATION
// ==========================================

const CATEGORY_COLORS = [
  "#3cb44b", "#ffe119", "#4363d8", "#f58231", "#911eb4", "#f032e6", "#469990", 
  "#9A6324", "#808000", "#ff7f50", "#f59e0b", "#10b981", "#8b5cf6", "#ec4899", 
  "#BE3B37", "#006400", "#8b008b", "#4682b4", "#ff1493", "#2f4f4f", "#adff2f"
];

const PHYSICS_CONFIG = {
  LINK_DISTANCE_ATTR: 100,
  LINK_DISTANCE_STD: 150,
  CHARGE_STRENGTH_ATTR: -250,
  CHARGE_STRENGTH_STD: -450,
  GRAVITY: 0.03,
  COLLIDE_PADDING: 25,
  INITIAL_ZOOM: 0.8
};

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

const getIconSvg = (type: string, attrType?: string) => {
  let Icon = Hash;
  if (type === 'client') Icon = Monitor;
  else if (type === 'server') Icon = Server;
  else if (type === 'mixed') Icon = Network;
  else if (type === 'attribute') {
    const attr = attrType?.toLowerCase() || '';
    if (attr === 'domain' || attr === 'alias.host' || attr === 'tld') Icon = Globe;
    else if (attr === 'org') Icon = Building;
    else if (attr === 'user.all') Icon = User;
    else if (attr === 'email.all') Icon = Mail;
    else if (attr === 'country') Icon = MapPin;
    else if (attr === 'filename.all' || attr === 'filename.all' || attr === 'filetype' || attr === 'extension') Icon = FileText;
    else if (attr === 'client') Icon = AppWindow;
    else if (attr === 'server') Icon = Router;
    else if (attr === 'ioc' || attr === 'boc' || attr === 'eoc') Icon = Target;
    else if (attr === 'action') Icon = Zap;
    else if (attr === 'error') Icon = AlertCircle;
    else if (attr === 'crypto' || attr === 'ssl.ca' || attr === 'ssl.subject') Icon = Lock;
    else Icon = Hash;
  }
  return renderToString(<Icon size={24} strokeWidth={1.5} />);
};

const getColor = (attr: string, availableAttributes: string[]): string => {
  const index = availableAttributes.indexOf(attr);
  return CATEGORY_COLORS[Math.max(0, index) % CATEGORY_COLORS.length];
};

const resolveId = (entity: string | GraphNode): string => {
  return typeof entity === "object" ? entity.id : entity;
};

// ==========================================
// MAIN COMPONENT
// ==========================================

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
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);
  const currentZoomRef = useRef<d3.ZoomTransform | null>(null);
  
  const [isLegendOpen, setIsLegendOpen] = useState(true);
  
  // Initialize state from cache
  const [attributeFilters, setAttributeFilters] = useState<Record<string, string>>(persistenceCache.attributeFilters);
  const [expandedFilters, setExpandedFilters] = useState<Record<string, boolean>>(persistenceCache.expandedFilters);

  // Sync state to cache
  useEffect(() => { persistenceCache.attributeFilters = attributeFilters; }, [attributeFilters]);
  useEffect(() => { persistenceCache.expandedFilters = expandedFilters; }, [expandedFilters]);
  
  const {
    hoveredItem,
    setHoveredItem,
    lastHoveredItem,
    tooltipRef,
    updateTooltipPosition
  } = useTooltip<GraphNode | GraphLink>();

  // --- DATA PIPELINE ---
  
  const { augmentedNodes, augmentedLinks, nodeDegree, adjacencyMap } = useMemo(() => {
    const result = filterAndAugmentGraph(data, displayedAttributes, attributeFilters) as {
      augmentedNodes: GraphNode[];
      augmentedLinks: GraphLink[];
      nodeDegree: Map<string, number>;
      adjacencyMap: Map<string, Set<string>>;
    };

    // Restore node positions from cache to prevent layout scrambling on new queries
    result.augmentedNodes.forEach(node => {
      const cachedPos = persistenceCache.nodePositions.get(node.id);
      if (cachedPos) {
        node.x = cachedPos.x;
        node.y = cachedPos.y;
        node.fx = cachedPos.fx;
        node.fy = cachedPos.fy;
      }
    });

    return result;
  }, [data, displayedAttributes, attributeFilters]);

  const getNodeSize = useCallback((d: GraphNode) => {
    const degree = nodeDegree.get(d.id) || 0;
    if (d.type === "attribute") {
      return Math.max(10, Math.min(30, 10 + degree * 1));
    }
    return Math.max(15, Math.min(40, 15 + degree * 2));
  }, [nodeDegree]);

  // --- STRUCTURAL RENDERING & PHYSICS ---
  
  useEffect(() => {
    if (!svgRef.current || !containerRef.current || !augmentedNodes.length) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    const svg = d3.select(svgRef.current);
    
    svg.selectAll("*").remove();
    const g = svg.append("g");

    // 1. Zoom Behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        g.attr("transform", event.transform.toString());
        currentZoomRef.current = event.transform; 
        persistenceCache.zoom = event.transform; // Save to cache
      });

    svg.call(zoom);

    // Apply cached zoom or initialize
    if (persistenceCache.zoom) {
      svg.call(zoom.transform, persistenceCache.zoom);
      currentZoomRef.current = persistenceCache.zoom;
    } else {
      const initialTransform = d3.zoomIdentity
        .translate(width / 2 * (1 - PHYSICS_CONFIG.INITIAL_ZOOM), height / 2 * (1 - PHYSICS_CONFIG.INITIAL_ZOOM))
        .scale(PHYSICS_CONFIG.INITIAL_ZOOM);
      svg.call(zoom.transform, initialTransform);
      currentZoomRef.current = initialTransform;
    }

    // 2. Definitions (Markers)
    svg.append("defs").append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 25) 
      .attr("refY", 0)
      .attr("orient", "auto")
      .attr("markerWidth", 12)
      .attr("markerHeight", 12)
      .attr("markerUnits", "userSpaceOnUse")
      .append("path")
      .attr("d", "M 0,-5 L 10,0 L 0,5");

    // 3. Force Simulation setup
    const simulation = d3.forceSimulation<GraphNode, GraphLink>(augmentedNodes)
      .force("link", d3.forceLink<GraphNode, GraphLink>(augmentedLinks)
        .id(d => d.id)
        .distance(d => d.type === "attribute" ? PHYSICS_CONFIG.LINK_DISTANCE_ATTR : PHYSICS_CONFIG.LINK_DISTANCE_STD)
      )
      .force("charge", d3.forceManyBody<GraphNode>()
        .strength(d => d.type === "attribute" ? PHYSICS_CONFIG.CHARGE_STRENGTH_ATTR : PHYSICS_CONFIG.CHARGE_STRENGTH_STD)
      )
      .force("x", d3.forceX(width / 2).strength(PHYSICS_CONFIG.GRAVITY))
      .force("y", d3.forceY(height / 2).strength(PHYSICS_CONFIG.GRAVITY))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide<GraphNode>().radius(d => getNodeSize(d) + PHYSICS_CONFIG.COLLIDE_PADDING).iterations(3));

    simulationRef.current = simulation;

    // Fast-forward initial layout computations
    if (augmentedNodes.length > 50) {
      simulation.stop();
      const ticks = Math.min(300, Math.ceil(Math.log(simulation.alphaMin()) / Math.log(1 - simulation.alphaDecay())));
      for (let i = 0; i < ticks; ++i) simulation.tick();
    }

    // 4. Draw Edges (Links)
    const link = g.append("g").attr("class", "links-layer")
      .selectAll("line")
      .data(augmentedLinks)
      .join("line")
      .attr("class", "graph-link")
      .attr("stroke-dasharray", d => d.type === "attribute" ? "4,4" : "none")
      .attr("stroke-opacity", d => d.type === "attribute" ? 0.6 : 0.8)
      .attr("stroke-width", d => d.type === "attribute" ? 1 : Math.max(1.5, Math.min(10, Math.sqrt(d.size || 0) / 10 || (d.count || 1))))
      .attr("marker-end", d => d.type === "attribute" ? null : "url(#arrowhead)")
      .style("cursor", "pointer")
      .on("click", (event: MouseEvent, d) => {
        event.stopPropagation();
        onLinkClick(d as unknown as Link);
      })
      .on("mouseenter", (_, d) => {
        setHoveredItem(d);
        updateTooltipPosition();
      })
      .on("mouseleave", () => setHoveredItem(null));

    // 5. Draw Edge Labels
    const showServiceLabels = displayedAttributes.includes('service');
    const linkLabel = g.append("g").attr("class", "link-labels-layer")
      .selectAll("text")
      .data(showServiceLabels ? augmentedLinks.filter(d => d.type !== "attribute" && d.services && d.services.length > 0) : [])
      .join("text")
      .attr("class", "link-label")
      .attr("font-size", "10px")
      .attr("font-family", "monospace")
      .attr("text-anchor", "middle")
      .attr("dy", -5)
      .text(d => d.services ? d.services.join(", ") : "");

    // 6. Draw Vertices (Nodes) & Map Roles
    const nodeRoles = new Map<string, 'client' | 'server' | 'mixed'>();
    augmentedLinks.forEach(l => {
      if (l.type !== "attribute") {
        const sId = resolveId(l.source);
        const tId = resolveId(l.target);
        
        const sRole = nodeRoles.get(sId);
        if (sRole === 'server') nodeRoles.set(sId, 'mixed');
        else if (!sRole) nodeRoles.set(sId, 'client');

        const tRole = nodeRoles.get(tId);
        if (tRole === 'client') nodeRoles.set(tId, 'mixed');
        else if (!tRole) nodeRoles.set(tId, 'server');
      }
    });

    // Save roles to nodes for the tooltip
    augmentedNodes.forEach(n => {
      if (n.type !== "attribute") {
        n.role = nodeRoles.get(n.id) || "mixed";
      }
    });

    const drag = d3.drag<SVGGElement, GraphNode>()
      .on("start", (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event) => {
        if (!event.active) simulation.alphaTarget(0);
        // Node remains sticky
      });

    const node = g.append("g").attr("class", "nodes-layer")
      .selectAll("g")
      .data(augmentedNodes)
      .join("g")
      .attr("class", "graph-node")
      .style("cursor", "pointer")
      .call(drag as any)
      .on("dblclick", (event: MouseEvent, d) => {
        event.stopPropagation();
        d.fx = null;
        d.fy = null;
        simulation.alpha(0.3).restart();
      })
      .on("click", (event: MouseEvent, d) => {
        event.stopPropagation();
        onNodeClick(d as unknown as Node);
      })
      .on("mouseenter", (_, d) => {
        setHoveredItem(d);
        updateTooltipPosition();
      })
      .on("mouseleave", () => setHoveredItem(null));

    node.each(function(d) {
      const el = d3.select(this);
      const size = getNodeSize(d);
      
      const role = d.type === "attribute" ? "attribute" : (nodeRoles.get(d.id) || "mixed");
      const iconSvg = getIconSvg(role, d.attrType);
      
      if (d.type === "attribute") {
        el.append("rect")
          .attr("class", "node-bg")
          .attr("width", size * 2)
          .attr("height", size * 2)
          .attr("x", -size)
          .attr("y", -size)
          .attr("rx", size * 0.35);
          
        el.append("rect")
          .attr("class", "inner-highlight")
          .attr("width", (size - 2) * 2)
          .attr("height", (size - 2) * 2)
          .attr("x", -(size - 2))
          .attr("y", -(size - 2))
          .attr("rx", (size - 2) * 0.35)
          .attr("fill", "none")
          .attr("stroke", "rgba(255,255,255,0.2)")
          .attr("stroke-width", 1);
      } else {
        el.append("circle")
          .attr("class", "node-bg")
          .attr("r", size);
          
        el.append("circle")
          .attr("class", "inner-highlight")
          .attr("r", size - 2)
          .attr("fill", "none")
          .attr("stroke", "rgba(255,255,255,0.2)")
          .attr("stroke-width", 1);
      }

      const iconSize = size * 1.2;
      el.append("g")
        .attr("class", "node-icon")
        .attr("transform", `translate(${-iconSize/2}, ${-iconSize/2}) scale(${iconSize/24})`)
        .html(iconSvg);
    });

    node.append("text")
      .text(d => d.type === "attribute" ? (d.attrValue || "") : d.id)
      .attr("x", d => getNodeSize(d) + (d.type === "attribute" ? 6 : 7))
      .attr("y", d => d.type === "attribute" ? 4 : 5)
      .attr("font-size", d => d.type === "attribute" ? "10px" : "12px")
      .attr("font-weight", d => d.type === "attribute" ? "normal" : "600")
      .attr("font-family", "monospace")
      .attr("paint-order", "stroke")
      .attr("stroke-width", 3)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round");

    // 7. Tick Engine
    const updatePositions = () => {
      link
        .attr("x1", d => (d.source as GraphNode).x || 0)
        .attr("y1", d => (d.source as GraphNode).y || 0)
        .attr("x2", d => (d.target as GraphNode).x || 0)
        .attr("y2", d => (d.target as GraphNode).y || 0);

      linkLabel
        .attr("x", d => (((d.source as GraphNode).x || 0) + ((d.target as GraphNode).x || 0)) / 2)
        .attr("y", d => (((d.source as GraphNode).y || 0) + ((d.target as GraphNode).y || 0)) / 2);

      node.attr("transform", d => `translate(${d.x || 0},${d.y || 0})`);
    };

    if (augmentedNodes.length > 50) updatePositions();
    simulation.on("tick", updatePositions);

    // 8. Resize Handling
    let resizeTimer: ReturnType<typeof setTimeout>;
    const resizeObserver = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (!containerRef.current) return;
        const newWidth = containerRef.current.clientWidth;
        const newHeight = containerRef.current.clientHeight;
        svg.attr("width", newWidth).attr("height", newHeight);
        simulation.force("center", d3.forceCenter(newWidth / 2, newHeight / 2));
        simulation.alpha(0.3).restart();
      }, 150); 
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      simulation.stop();
      // Save exact positions to cache on unmount/re-render
      augmentedNodes.forEach(n => {
        persistenceCache.nodePositions.set(n.id, { x: n.x, y: n.y, fx: n.fx, fy: n.fy });
      });
      resizeObserver.disconnect();
      clearTimeout(resizeTimer);
    };
  }, [augmentedNodes, augmentedLinks, onNodeClick, onLinkClick, displayedAttributes, getNodeSize]);

  // --- VISUAL STYLING & SELECTION ENGINE ---
  
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    
    svg.select("#arrowhead path").attr("fill", isDark ? "#94a3b8" : "#475569");

    const nodes = svg.selectAll<SVGGElement, GraphNode>(".graph-node");
    const links = svg.selectAll<SVGLineElement, GraphLink>(".graph-link");
    const linkLabels = svg.selectAll<SVGTextElement, GraphLink>(".link-label");

    // Base coloring
    nodes.each(function(d) {
      const el = d3.select(this);
      if (d.type === "attribute") {
        const color = getColor(d.attrType || "default", availableAttributes);
        el.select(".node-bg")
          .attr("fill", color) 
          .attr("stroke", isDark ? "#0f172a" : "#ffffff") 
          .attr("stroke-width", 2)
          .attr("stroke-dasharray", "none")
          .style("filter", `drop-shadow(0 0 8px ${color}80)`);
          
        el.select(".node-icon")
          .style("color", "#ffffff"); 
      } else {
        const color = d.networkType === "public" ? "#BE3B37" : (d.networkType === "internal" ? (isDark ? "#0ea5e9" : "#3b82f6") : "#64748b");
        el.select(".node-bg")
          .attr("fill", color)
          .attr("stroke", isDark ? "#0f172a" : "#ffffff")
          .attr("stroke-width", 2)
          .attr("stroke-dasharray", "none")
          .style("filter", `drop-shadow(0 0 8px ${color}80)`);
          
        el.select(".node-icon")
          .style("color", "#ffffff");
      }
      
      el.select("text")
        .attr("fill", isDark ? "#e2e8f0" : "#334155")
        .attr("stroke", isDark ? "#0f172a" : "#ffffff");
    });

    links.attr("stroke", d => {
      if (d.type === "attribute") {
         const attrType = (d.target as GraphNode).attrType || (typeof d.target === 'string' ? d.target.split('-')[1] : "default");
         return getColor(attrType, availableAttributes);
      }
      return isDark ? "#475569" : "#94a3b8";
    });

    linkLabels.attr("fill", isDark ? "#94a3b8" : "#64748b");

    // Selection Fading Logic with Hop 2 Expansion
    if (!selectedItem) {
      nodes.style("opacity", 1).style("transition", "opacity 0.3s");
      // Prevent resetting the attribute node colors when nothing is selected
      nodes.selectAll(".node-bg")
        .attr("stroke", isDark ? "#0f172a" : "#ffffff")
        .attr("stroke-width", 2);
      links.style("opacity", d => d.type === "attribute" ? 0.6 : 0.8).style("transition", "opacity 0.3s");
      linkLabels.style("opacity", 1).style("transition", "opacity 0.3s");
    } else {
      const visibleNodeIds = new Set<string>();
      const focusedNodeIds = new Set<string>(); // Tracks strictly the clicked item(s)
      
      const isLinkSelection = "source" in selectedItem;
      
      if (isLinkSelection) {
        const sourceId = resolveId(selectedItem.source as string | GraphNode);
        const targetId = resolveId(selectedItem.target as string | GraphNode);
        visibleNodeIds.add(sourceId).add(targetId);
        focusedNodeIds.add(sourceId).add(targetId);
      } else {
        const selectedId = selectedItem.id;
        visibleNodeIds.add(selectedId);
        focusedNodeIds.add(selectedId);
        
        // Hop 1: Add all immediate neighbors (IPs or Attributes connected directly to the selected node)
        const connectedIds = adjacencyMap.get(selectedId) || new Set<string>();
        connectedIds.forEach(id => visibleNodeIds.add(id));
      }

      // Hop 2: Expand visibility to any Attribute Node connected to our current visible set
      const expandedAttributeNodeIds = new Set<string>();
      
      augmentedLinks.forEach(l => {
        if (l.type === "attribute") {
          const sourceNode = l.source as GraphNode;
          const targetNode = l.target as GraphNode;
          const sId = resolveId(sourceNode);
          const tId = resolveId(targetNode);
          
          // Strict check: Only add the target if it is genuinely an attribute node.
          // This prevents pulling in secondary IP_Nodes by accident.
          if (visibleNodeIds.has(sId) && targetNode.type === "attribute") {
            expandedAttributeNodeIds.add(tId);
          }
          if (visibleNodeIds.has(tId) && sourceNode.type === "attribute") {
            expandedAttributeNodeIds.add(sId);
          }
        }
      });
      
      // Merge the expanded attributes into the main visibility set
      expandedAttributeNodeIds.forEach(id => visibleNodeIds.add(id));

      // Apply Node Opacity
      nodes.style("opacity", d => visibleNodeIds.has(d.id) ? 1 : 0.1).style("transition", "opacity 0.3s");
      
      // Apply Node Highlighting (Only directly clicked nodes get the amber border)
      nodes.selectAll(".node-bg")
        .attr("stroke", (d: any) => {
          if (focusedNodeIds.has(d.id)) return "#f59e0b";
          return isDark ? "#0f172a" : "#ffffff";
        })
        .attr("stroke-width", (d: any) => focusedNodeIds.has(d.id) ? 3 : 2);
      
      // Apply Link Opacity
      links.style("opacity", d => {
        const sId = resolveId(d.source);
        const tId = resolveId(d.target);
        
        // Keep primary IP connections or strictly selected links solid
        if (isLinkSelection) {
           if (sId === resolveId((selectedItem as any).source) && tId === resolveId((selectedItem as any).target)) return 0.8;
        } else {
           if (sId === selectedItem.id || tId === selectedItem.id) return 0.8;
        }
        
        // Show attribute links if BOTH ends of the link are now in our visible set
        if (d.type === "attribute" && visibleNodeIds.has(sId) && visibleNodeIds.has(tId)) {
           return 0.6;
        }
        
        return 0.05;
      }).style("transition", "opacity 0.3s");
      
      // Apply Label Opacity
      linkLabels.style("opacity", d => {
        const sId = resolveId(d.source);
        const tId = resolveId(d.target);
        if (isLinkSelection) {
          return (sId === resolveId((selectedItem as any).source) && tId === resolveId((selectedItem as any).target)) ? 1 : 0.05;
        }
        return (sId === selectedItem.id || tId === selectedItem.id) ? 1 : 0.05;
      }).style("transition", "opacity 0.3s");
    }
  }, [isDark, selectedItem, availableAttributes, adjacencyMap, augmentedLinks]);

  useEffect(() => {
    if (tooltipRef.current) {
      tooltipRef.current.style.opacity = hoveredItem ? '1' : '0';
    }
  }, [hoveredItem, tooltipRef]);

  // --- JSX TEMPLATE ---
  
  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-gray-50 dark:bg-gray-950 rounded-xl overflow-hidden shadow-inner relative border border-gray-200 dark:border-gray-800 transition-colors duration-200 bg-grid-pattern animate-grid"
    >
      <svg ref={svgRef} className="w-full h-full" />
      
      <StatsOverlay nodeCount={data.nodes.length} linkCount={data.links.length} />

      <LegendPanel 
        isLegendOpen={isLegendOpen}
        setIsLegendOpen={setIsLegendOpen}
        availableAttributes={availableAttributes}
        displayedAttributes={displayedAttributes}
        onToggleAttribute={onToggleAttribute}
        attributeFilters={attributeFilters}
        setAttributeFilters={setAttributeFilters}
        expandedFilters={expandedFilters}
        setExpandedFilters={setExpandedFilters}
      />

      {data.nodes.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 pointer-events-none animate-in fade-in duration-700">
          <Network size={48} className="mb-4 opacity-50" />
          <h3 className="text-lg font-semibold mb-1 text-gray-600 dark:text-gray-300">No Network Data</h3>
          <p className="text-sm">Run a query to visualize network connections.</p>
        </div>
      )}

      <GraphTooltip 
        tooltipRef={tooltipRef} 
        lastHoveredItem={lastHoveredItem} 
        isDark={isDark} 
        availableAttributes={availableAttributes} 
      />
    </div>
  );
}

// ==========================================
// SUB-COMPONENTS (Pure Presentation)
// ==========================================

const StatsOverlay = ({ nodeCount, linkCount }: { nodeCount: number; linkCount: number }) => (
  <div className="absolute top-4 right-4 z-10 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md px-4 py-2 rounded-lg shadow-md border border-gray-200 dark:border-gray-800 flex items-center gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
    <div className="flex items-center gap-2">
      <Network size={16} className="text-gray-500 dark:text-gray-400" />
      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{nodeCount} Nodes</span>
    </div>
    <div className="w-px h-4 bg-gray-300 dark:bg-gray-700"></div>
    <div className="flex items-center gap-2">
      <Activity size={16} className="text-gray-500 dark:text-gray-400" />
      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{linkCount} Links</span>
    </div>
  </div>
);

const LegendPanel = ({ 
  isLegendOpen, setIsLegendOpen, availableAttributes, displayedAttributes, 
  onToggleAttribute, attributeFilters, setAttributeFilters, expandedFilters, setExpandedFilters 
}: any) => (
  <div className="absolute bottom-4 left-4 z-10 bg-white/95 dark:bg-gray-900/90 backdrop-blur p-3 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 max-w-[800px] animate-in fade-in slide-in-from-bottom-4 duration-500">
    <div className="flex items-center justify-between cursor-pointer" onClick={() => setIsLegendOpen(!isLegendOpen)}>
      <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-400 uppercase tracking-wider pr-4 flex items-center gap-2">
        <Activity size={14} className="text-[#BE3B37]" /> Legend & Display
      </h4>
      {isLegendOpen ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronUp size={14} className="text-gray-500" />}
    </div>
    
    {isLegendOpen && (
      <div className="space-y-3 mt-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {['Internal IP', 'Public IP'].map(type => (
            <div key={type} className="flex flex-col gap-1">
              <div className="flex items-center justify-between group">
                <div className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded-full border-2 border-white dark:border-gray-950 shadow-sm shrink-0 ${type === 'Internal IP' ? 'bg-blue-500 dark:bg-sky-500' : 'bg-[#BE3B37]'}`}></div>
                  <span className="text-xs text-gray-700 dark:text-gray-300 font-medium">{type}</span>
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); setExpandedFilters((prev: any) => ({...prev, [type]: !prev[type]})) }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
                ><Filter size={10} /></button>
              </div>
              {expandedFilters[type] && (
                <input
                  type="text" placeholder={`Filter ${type}...`} value={attributeFilters[type] || ''}
                  onChange={(e) => setAttributeFilters((prev: any) => ({ ...prev, [type]: e.target.value }))}
                  className="px-2 py-1 text-[10px] bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-gray-700 dark:text-gray-300 focus:outline-none focus:border-[#BE3B37] w-full"
                  onClick={(e) => e.stopPropagation()}
                />
              )}
            </div>
          ))}
        </div>
        
        {availableAttributes.length > 0 && (
          <div className="pt-2 mt-2 border-t border-gray-200 dark:border-gray-700">
            <div className="text-[10px] text-gray-500 dark:text-gray-400 mb-2">Click to toggle attributes, click filter icon to search</div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2 max-h-60 overflow-y-auto pr-1">
              {availableAttributes.map((attr: string) => {
                const isActive = displayedAttributes.includes(attr);
                return (
                  <div key={attr} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between group">
                      <div className={`flex items-center gap-2 cursor-pointer transition-opacity hover:opacity-80 ${isActive ? 'opacity-100' : 'opacity-40'}`} onClick={() => onToggleAttribute(attr)}>
                        <div className="w-3 h-3 rounded-sm border border-white dark:border-gray-950 shadow-sm shrink-0" style={{ backgroundColor: isActive ? getColor(attr, availableAttributes) : '#94a3b8' }}></div>
                        <span className={`text-xs font-medium truncate ${isActive ? 'text-gray-800 dark:text-gray-300' : 'text-gray-500 dark:text-gray-400'}`}>{attr}</span>
                      </div>
                      {isActive && (
                        <button onClick={(e) => { e.stopPropagation(); setExpandedFilters((prev: any) => ({...prev, [attr]: !prev[attr]})) }} className="text-gray-400 opacity-0 group-hover:opacity-100"><Filter size={10} /></button>
                      )}
                    </div>
                    {isActive && expandedFilters[attr] && (
                      <input type="text" placeholder={`Filter ${attr}...`} value={attributeFilters[attr] || ''} onChange={(e) => setAttributeFilters((prev: any) => ({ ...prev, [attr]: e.target.value }))} className="px-2 py-1 text-[10px] bg-gray-100 dark:bg-gray-800 rounded w-full" onClick={(e) => e.stopPropagation()} />
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
);

const GraphTooltip = ({ tooltipRef, lastHoveredItem, isDark, availableAttributes }: any) => {
  if (!lastHoveredItem) return <div ref={tooltipRef} className="fixed opacity-0 pointer-events-none" />;

  const isLink = 'source' in lastHoveredItem;

  return (
    <div ref={tooltipRef} className="fixed left-0 top-0 z-50 pointer-events-none bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-xl rounded-lg p-3 text-sm transition-opacity duration-200 opacity-0" style={{ maxWidth: '300px', willChange: 'transform, opacity' }}>
      {isLink ? (
        <div className="space-y-2">
          <div className="font-semibold text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-700 pb-1 mb-1">Connection Details</div>
          <div className="flex justify-between gap-4"><span className="text-gray-500">Source:</span><span className="font-mono text-right truncate">{resolveId(lastHoveredItem.source)}</span></div>
          <div className="flex justify-between gap-4"><span className="text-gray-500">Target:</span><span className="font-mono text-right truncate">{resolveId(lastHoveredItem.target)}</span></div>
          {lastHoveredItem.type !== 'attribute' && (
            <>
              <div className="flex justify-between gap-4"><span className="text-gray-500">Sessions:</span><span className="font-semibold">{lastHoveredItem.count}</span></div>
              <div className="flex justify-between gap-4"><span className="text-gray-500">Size:</span><span className="font-semibold">{formatBytes(lastHoveredItem.size || 0)}</span></div>
              {lastHoveredItem.services?.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                  <span className="text-gray-500 block mb-1">Services:</span>
                  <div className="flex flex-wrap gap-1">
                    {lastHoveredItem.services.map((s: string) => (
                      <span key={s} className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded text-[10px] uppercase">{s}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="font-semibold text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-700 pb-1 mb-1 flex items-center gap-2">
            {lastHoveredItem.type === 'attribute' ? (
              <div className="w-2 h-2 rounded-sm transform rotate-45" style={{ backgroundColor: getColor(lastHoveredItem.attrType || '', availableAttributes) }}></div>
            ) : (
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: lastHoveredItem.networkType === 'public' ? '#BE3B37' : (lastHoveredItem.networkType === 'internal' ? (isDark ? '#0ea5e9' : '#3b82f6') : '#64748b') }}></div>
            )}
            <span className="font-mono truncate">{lastHoveredItem.type === 'attribute' ? lastHoveredItem.attrValue : lastHoveredItem.id}</span>
          </div>
          
          {lastHoveredItem.type === 'attribute' ? (
            <div className="flex justify-between gap-4"><span className="text-gray-500">Type:</span><span className="font-semibold capitalize">{lastHoveredItem.attrType}</span></div>
          ) : (
            <>
              <div className="flex justify-between gap-4"><span className="text-gray-500">Role:</span><span className="font-semibold capitalize">{lastHoveredItem.role || 'mixed'}</span></div>
              <div className="flex justify-between gap-4"><span className="text-gray-500">Network:</span><span className="font-semibold capitalize">{lastHoveredItem.networkType}</span></div>
              {lastHoveredItem.country && <div className="flex justify-between gap-4"><span className="text-gray-500">Country:</span><span className="font-semibold">{lastHoveredItem.country}</span></div>}
              {lastHoveredItem.org && <div className="flex justify-between gap-4"><span className="text-gray-500">Org:</span><span className="font-semibold truncate max-w-[150px]">{lastHoveredItem.org}</span></div>}
              {lastHoveredItem.attributes && Object.keys(lastHoveredItem.attributes).length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                  <span className="text-gray-500 block mb-1">Attributes:</span>
                  <div className="space-y-1">
                    {Object.entries(lastHoveredItem.attributes).slice(0, 5).map(([k, v]: any) => (
                      <div key={k} className="flex justify-between gap-2 text-[10px]"><span className="text-gray-500">{k}:</span><span className="truncate max-w-[150px]">{v.join(', ')}</span></div>
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
      )}
    </div>
  );
};