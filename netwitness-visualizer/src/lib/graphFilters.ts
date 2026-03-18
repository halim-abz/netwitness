/**
 * graphFilters.ts
 * 
 * This utility file handles the filtering and augmentation of graph data for the 2D network graph.
 * It implements complex filtering logic for IP addresses and attributes, and generates
 * "attribute nodes" to visualize relationships between IPs and their metadata.
 */

import { GraphData, Node, Link } from "../types";

export interface GraphAugmentationResult {
  augmentedNodes: Node[];
  augmentedLinks: Link[];
  nodeDegree: Map<string, number>;
  adjacencyMap: Map<string, Set<string>>;
}

interface ParsedFilter {
  textToMatch: string;
  isExclude: boolean;
}

const GRAPH_CONSTANTS = {
  NETWORK_INTERNAL: "internal",
  NETWORK_PUBLIC: "public",
  ATTR_INTERNAL_IP: "Internal IP",
  ATTR_PUBLIC_IP: "Public IP",
  ATTR_SERVICE: "service",
  LINK_TYPE_TRAFFIC: "traffic",
  LINK_TYPE_ATTRIBUTE: "attribute",
  NODE_TYPE_ATTRIBUTE: "attribute",
} as const;

/**
 * Safely extracts a node ID from a link source or target, handling both
 * string IDs and hydrated node objects.
 */
function getNodeId(sourceOrTarget: string | number | { id: string }): string {
  if (typeof sourceOrTarget === "object" && sourceOrTarget !== null && "id" in sourceOrTarget) {
    return String(sourceOrTarget.id);
  }
  return String(sourceOrTarget);
}

/**
 * Maps standard attributes to their respective multi-field data keys.
 */
function getAttributeKeys(attr: string): string[] {
  switch (attr) {
    case "country":
      return ["country", "country.src", "country.dst"];
    case "org":
      return ["org", "org.src", "org.dst"];
    default:
      return [attr];
  }
}

/**
 * Pre-processes filters to avoid repetitive string manipulation in loops.
 */
function parseFilters(attributeFilters: Record<string, string>): Map<string, ParsedFilter> {
  const parsed = new Map<string, ParsedFilter>();
  for (const [key, value] of Object.entries(attributeFilters)) {
    if (!value?.trim()) continue;
    
    const isExclude = value.startsWith("!");
    const textToMatch = isExclude ? value.slice(1).toLowerCase() : value.toLowerCase();
    
    if (textToMatch) {
      parsed.set(key, { textToMatch, isExclude });
    }
  }
  return parsed;
}

/**
 * Checks if a specific value matches the parsed filter rule.
 */
function matchesFilterRule(value: string, rule: ParsedFilter): boolean {
  const includes = value.toLowerCase().includes(rule.textToMatch);
  return rule.isExclude ? !includes : includes;
}

/**
 * Filters nodes based on IP and standard attribute filters.
 */
function filterNodes(
  nodes: Node[],
  parsedFilters: Map<string, ParsedFilter>,
  displayedAttributes: string[]
): Node[] {
  if (parsedFilters.size === 0) return nodes;

  const internalIpFilter = parsedFilters.get(GRAPH_CONSTANTS.ATTR_INTERNAL_IP);
  const publicIpFilter = parsedFilters.get(GRAPH_CONSTANTS.ATTR_PUBLIC_IP);

  return nodes.filter((node) => {
    // Check Network Type Filters
    if (internalIpFilter && node.networkType === GRAPH_CONSTANTS.NETWORK_INTERNAL) {
      if (!matchesFilterRule(String(node.id), internalIpFilter)) return false;
    }
    
    if (publicIpFilter && node.networkType === GRAPH_CONSTANTS.NETWORK_PUBLIC) {
      if (!matchesFilterRule(String(node.id), publicIpFilter)) return false;
    }

    // Check Displayed Attribute Filters
    for (const [attr, rule] of parsedFilters.entries()) {
      if (attr === GRAPH_CONSTANTS.ATTR_INTERNAL_IP || attr === GRAPH_CONSTANTS.ATTR_PUBLIC_IP) {
        continue; // Already handled above
      }
      if (!displayedAttributes.includes(attr)) continue;

      const keysToCheck = getAttributeKeys(attr);
      let hasMatch = false;

      for (const key of keysToCheck) {
        const attributeValues = node.attributes?.[key];
        if (Array.isArray(attributeValues)) {
          if (attributeValues.some((val) => String(val).toLowerCase().includes(rule.textToMatch))) {
            hasMatch = true;
            break;
          }
        }
      }

      if (rule.isExclude ? hasMatch : !hasMatch) return false;
    }

    return true;
  });
}

/**
 * Generates attribute nodes and connects them to the relevant data nodes.
 */
function augmentGraphData(
  nodes: Node[],
  links: Link[],
  displayedAttributes: string[]
): { augmentedNodes: Node[]; augmentedLinks: Link[] } {
  const finalNodes = nodes.map((n) => ({ ...n }));
  const finalLinks: Link[] = links.map((l) => ({ ...l, type: GRAPH_CONSTANTS.LINK_TYPE_TRAFFIC }));
  const attributeNodesMap = new Set<string>();

  nodes.forEach((node) => {
    displayedAttributes.forEach((attr) => {
      if (attr === GRAPH_CONSTANTS.ATTR_SERVICE) return;

      const keysToCheck = getAttributeKeys(attr);
      keysToCheck.forEach((key) => {
        const attributeValues = node.attributes?.[key];
        if (!Array.isArray(attributeValues)) return;

        attributeValues.forEach((val) => {
          const subNodeId = `attr-${attr}-${val}`;
          
          if (!attributeNodesMap.has(subNodeId)) {
            attributeNodesMap.add(subNodeId);
            finalNodes.push({
              id: subNodeId,
              type: GRAPH_CONSTANTS.NODE_TYPE_ATTRIBUTE,
              attrType: attr,
              attrValue: val,
            } as Node);
          }

          finalLinks.push({
            source: node.id,
            target: subNodeId,
            type: GRAPH_CONSTANTS.LINK_TYPE_ATTRIBUTE,
          } as Link);
        });
      });
    });
  });

  return { augmentedNodes: finalNodes, augmentedLinks: finalLinks };
}

/**
 * Calculates degrees and builds the adjacency matrix for the graph.
 */
function buildGraphMetrics(links: Link[]): { degreeMap: Map<string, number>; adjMap: Map<string, Set<string>> } {
  const degreeMap = new Map<string, number>();
  const adjMap = new Map<string, Set<string>>();

  links.forEach((l) => {
    const sId = getNodeId(l.source);
    const tId = getNodeId(l.target);

    degreeMap.set(sId, (degreeMap.get(sId) || 0) + 1);
    degreeMap.set(tId, (degreeMap.get(tId) || 0) + 1);

    if (!adjMap.has(sId)) adjMap.set(sId, new Set());
    if (!adjMap.has(tId)) adjMap.set(tId, new Set());
    
    adjMap.get(sId)!.add(tId);
    adjMap.get(tId)!.add(sId);
  });

  return { degreeMap, adjMap };
}

/**
 * Filters and augments graph data based on selected attributes and filters.
 * @param data The raw graph data (nodes and links).
 * @param displayedAttributes The attributes currently selected for display.
 * @param attributeFilters The text filters applied to specific attributes.
 * @returns Augmented nodes, links, node degrees, and an adjacency map.
 */
export function filterAndAugmentGraph(
  data: GraphData,
  displayedAttributes: string[],
  attributeFilters: Record<string, string>
): GraphAugmentationResult {
  const emptyResult: GraphAugmentationResult = {
    augmentedNodes: [],
    augmentedLinks: [],
    nodeDegree: new Map(),
    adjacencyMap: new Map(),
  };

  if (!data?.nodes?.length) return emptyResult;

  const parsedFilters = parseFilters(attributeFilters);
  const hasIpFilters = parsedFilters.has(GRAPH_CONSTANTS.ATTR_INTERNAL_IP) || parsedFilters.has(GRAPH_CONSTANTS.ATTR_PUBLIC_IP);

  // 1. Filter Nodes
  let filteredNodes = filterNodes(data.nodes, parsedFilters, displayedAttributes);
  const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));

  // 2. Filter Links
  const filteredLinks = data.links.filter((l) => {
    return filteredNodeIds.has(getNodeId(l.source)) && filteredNodeIds.has(getNodeId(l.target));
  });

  // 3. Enforce IP Connectivity (Orphans removal)
  if (hasIpFilters) {
    const connectedNodeIds = new Set<string>();
    filteredLinks.forEach((l) => {
      connectedNodeIds.add(getNodeId(l.source));
      connectedNodeIds.add(getNodeId(l.target));
    });
    filteredNodes = filteredNodes.filter((n) => connectedNodeIds.has(String(n.id)));
  }

  // 4. Augment Graph Data
  const { augmentedNodes, augmentedLinks } = augmentGraphData(filteredNodes, filteredLinks, displayedAttributes);

  // 5. Calculate Metrics
  const { degreeMap, adjMap } = buildGraphMetrics(augmentedLinks);

  return {
    augmentedNodes,
    augmentedLinks,
    nodeDegree: degreeMap,
    adjacencyMap: adjMap,
  };
}