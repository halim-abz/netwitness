/**
 * globeDataProcessor.ts
 * 
 * This utility file processes raw graph data into a format suitable for the 3D globe.
 * It calculates arc paths, node positions (rings), and generates a live telemetry feed.
 * It handles severity mapping, coordinate resolution, and search filtering.
 */

import { GraphData, Node, Link, Session } from "../types";

// --- Types & Interfaces ---

export interface ExtendedLink extends Link {
  sessions?: Session[];
  size?: number;
}

export interface ArcData {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: [string, string];
  link: ExtendedLink;
  name: string;
}

export interface RingData {
  lat: number;
  lng: number;
  color: string;
  node: Node;
  degree: number;
}

export interface FeedItem {
  id: string;
  source: string;
  target: string;
  sourceNode: Node;
  targetNode: Node;
  srcCoords: { lat: number; lng: number } | null;
  dstCoords: { lat: number; lng: number } | null;
  srcColor: string;
  dstColor: string;
  color: string;
  link: ExtendedLink;
  size: number;
  time: number;
  service: string;
  country: string;
  aliasHost: string;
  ioc: string;
  boc: string;
  eoc: string;
}

export interface GlobeDataResult {
  arcsData: ArcData[];
  ringsData: RingData[];
  stats: {
    flows: number;
    size: number;
    ips: number;
  };
  liveFeed: FeedItem[];
}

// --- Constants & Helpers ---

const SEVERITY_COLORS = {
  3: "#ef4444", // High (IOC)
  2: "#f97316", // Medium (BOC)
  1: "#eab308", // Low (EOC)
  0: "#3b82f6", // None
} as const;

const MAX_ARCS = 500;

function ensureArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function resolveNode(nodeRef: string | Node | undefined, nodesById: Map<string, Node>): Node | undefined {
  if (!nodeRef) return undefined;
  return typeof nodeRef === "string" ? nodesById.get(nodeRef) : nodeRef;
}

function getCoords(node: Node, countryCentroids: Map<string, { lat: number; lng: number }>) {
  if (node.lat !== undefined && node.lng !== undefined && !isNaN(node.lat) && !isNaN(node.lng)) {
    return { lat: node.lat, lng: node.lng };
  }
  if (node.country) {
    const centroid = countryCentroids.get(node.country.toLowerCase());
    if (centroid) return centroid;
  }
  return null;
}

function getSessionSeverity(session: Session): number {
  if (session.ioc && ensureArray(session.ioc).length) return 3;
  if (session.boc && ensureArray(session.boc).length) return 2;
  if (session.eoc && ensureArray(session.eoc).length) return 1;
  return 0;
}

function getLinkSeverity(sessions?: Session[]): number {
  if (!sessions?.length) return 0;
  return Math.max(...sessions.map(getSessionSeverity));
}

function linkMatchesSearch(link: ExtendedLink, sourceNode: Node, targetNode: Node, query: string): boolean {
  if (!query) return true;

  if (sourceNode.id.toLowerCase().includes(query) || targetNode.id.toLowerCase().includes(query)) return true;
  if (sourceNode.country?.toLowerCase().includes(query) || targetNode.country?.toLowerCase().includes(query)) return true;

  if (link.sessions) {
    return link.sessions.some((s) => {
      const fieldsToSearch = [
        ...ensureArray(s.service),
        ...ensureArray(s["country.dst"]),
        ...ensureArray(s["country.src"]),
        ...ensureArray(s["alias.host"]),
      ];
      return fieldsToSearch.some((val) => String(val).toLowerCase().includes(query));
    });
  }
  return false;
}

// --- Main Processor ---

export function processGlobeData(
  data: GraphData,
  searchQuery: string,
  showThreatsOnly: boolean,
  feedSort: "time" | "size",
  countryCentroids: Map<string, { lat: number; lng: number }>
): GlobeDataResult {
  const nodesById = new Map<string, Node>(data.nodes.map((n) => [n.id, n]));
  const isExclude = searchQuery.startsWith("!");
  const normalizedQuery = (isExclude ? searchQuery.slice(1) : searchQuery).toLowerCase().trim();

  const nodeSeverities = new Map<string, number>();
  const nodeDegree = new Map<string, number>();
  
  // 1. Filter Links & Build Node Stats
  const filteredLinks = (data.links as ExtendedLink[]).filter((link) => {
    const sourceNode = resolveNode(link.source, nodesById);
    const targetNode = resolveNode(link.target, nodesById);
    if (!sourceNode || !targetNode) return false;

    // Threat Filter
    const linkSeverity = getLinkSeverity(link.sessions);
    if (showThreatsOnly && linkSeverity === 0) return false;

    // Search Filter
    if (normalizedQuery) {
      const match = linkMatchesSearch(link, sourceNode, targetNode, normalizedQuery);
      if (isExclude ? match : !match) return false;
    }

    // Accumulate Stats for valid links
    nodeDegree.set(sourceNode.id, (nodeDegree.get(sourceNode.id) || 0) + 1);
    nodeDegree.set(targetNode.id, (nodeDegree.get(targetNode.id) || 0) + 1);

    nodeSeverities.set(sourceNode.id, Math.max(linkSeverity, nodeSeverities.get(sourceNode.id) || 0));
    nodeSeverities.set(targetNode.id, Math.max(linkSeverity, nodeSeverities.get(targetNode.id) || 0));

    return true;
  });

  // 2. Build Feed Data
  let totalSize = 0;
  const uniqueIPs = new Set<string>();
  const feed: FeedItem[] = [];

  filteredLinks.forEach((link) => {
    const sourceNode = resolveNode(link.source, nodesById)!;
    const targetNode = resolveNode(link.target, nodesById)!;

    uniqueIPs.add(sourceNode.id);
    uniqueIPs.add(targetNode.id);
    totalSize += link.size || 0;

    const srcSeverity = nodeSeverities.get(sourceNode.id) || 0;
    const dstSeverity = nodeSeverities.get(targetNode.id) || 0;
    const linkSeverity = getLinkSeverity(link.sessions);

    const services = new Set<string>();
    const countries = new Set<string>([sourceNode.country, targetNode.country].filter(Boolean) as string[]);
    const aliasHosts = new Set<string>();
    const iocs = new Set<string>();
    const bocs = new Set<string>();
    const eocs = new Set<string>();
    let latestTime = 0;

    link.sessions?.forEach((session) => {
      ensureArray(session.service).forEach((x) => services.add(x));
      ensureArray(session["country.dst"]).forEach((x) => countries.add(x));
      ensureArray(session["country.src"]).forEach((x) => countries.add(x));
      ensureArray(session["alias.host"]).forEach((x) => aliasHosts.add(x));
      ensureArray(session.ioc).forEach((x) => iocs.add(x));
      ensureArray(session.boc).forEach((x) => bocs.add(x));
      ensureArray(session.eoc).forEach((x) => eocs.add(x));

      if (session.time) {
        const timeVal = Array.isArray(session.time) ? session.time[0] : session.time;
        const parsedTime = typeof timeVal === 'string' ? parseInt(timeVal, 10) : timeVal;
        if (!isNaN(parsedTime) && parsedTime > latestTime) {
          latestTime = parsedTime;
        }
      }
    });

    feed.push({
      id: `${sourceNode.id}-${targetNode.id}`,
      source: sourceNode.id,
      target: targetNode.id,
      sourceNode,
      targetNode,
      srcCoords: getCoords(sourceNode, countryCentroids),
      dstCoords: getCoords(targetNode, countryCentroids),
      srcColor: SEVERITY_COLORS[srcSeverity as keyof typeof SEVERITY_COLORS],
      dstColor: SEVERITY_COLORS[dstSeverity as keyof typeof SEVERITY_COLORS],
      color: SEVERITY_COLORS[linkSeverity as keyof typeof SEVERITY_COLORS],
      link,
      size: link.size || 0,
      time: latestTime,
      service: Array.from(services).join(", "),
      country: Array.from(countries).join(", "),
      aliasHost: Array.from(aliasHosts).join(", "),
      ioc: Array.from(iocs).join(", "),
      boc: Array.from(bocs).join(", "),
      eoc: Array.from(eocs).join(", "),
    });
  });

  // 3. Sort Feed and Generate Render Data
  feed.sort((a, b) => feedSort === "time" ? b.time - a.time : b.size - a.size);

  const topFeed = feed.slice(0, MAX_ARCS);
  const arcs: ArcData[] = [];
  const uniqueNodes = new Map<string, RingData>();

  topFeed.forEach((item) => {
    if (item.srcCoords && !uniqueNodes.has(item.source)) {
      uniqueNodes.set(item.source, {
        lat: item.srcCoords.lat,
        lng: item.srcCoords.lng,
        color: item.srcColor,
        node: item.sourceNode,
        degree: nodeDegree.get(item.source) || 0,
      });
    }
    if (item.dstCoords && !uniqueNodes.has(item.target)) {
      uniqueNodes.set(item.target, {
        lat: item.dstCoords.lat,
        lng: item.dstCoords.lng,
        color: item.dstColor,
        node: item.targetNode,
        degree: nodeDegree.get(item.target) || 0,
      });
    }

    if (item.srcCoords && item.dstCoords) {
      arcs.push({
        startLat: item.srcCoords.lat,
        startLng: item.srcCoords.lng,
        endLat: item.dstCoords.lat,
        endLng: item.dstCoords.lng,
        color: [item.srcColor, item.dstColor],
        link: item.link,
        name: `${item.source} -> ${item.target}`,
      });
    }
  });

  return {
    arcsData: arcs,
    ringsData: Array.from(uniqueNodes.values()),
    stats: {
      flows: filteredLinks.length,
      size: totalSize,
      ips: uniqueIPs.size,
    },
    liveFeed: feed,
  };
}