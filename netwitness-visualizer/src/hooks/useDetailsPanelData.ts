/**
 * useDetailsPanelData.ts
 * 
 * This file contains custom React hooks that encapsulate the complex data aggregation 
 * and memoization logic for the DetailsPanel component. It processes IP node statistics,
 * attribute node relationships, and threat timelines.
 */

import { useMemo } from "react";
import { GraphData, Node, Link } from "../types";

// --- Types & Interfaces ---

export type ThreatType = 'ioc' | 'boc' | 'eoc';

export interface ThreatIndicator {
  time: number;
  type: ThreatType;
  value: string;
}

export interface ServiceVolume {
  name: string;
  inbound: number;
  outbound: number;
  lateral: number;
  total: number;
}

export interface IpNodeStats {
  totalSize: number;
  connectionCount: number;
  directionStats: Record<'inbound' | 'outbound' | 'lateral', { size: number; count: number }>;
  roleStats: { server: [string, number][]; client: [string, number][] };
  serviceVolumeStats: ServiceVolume[];
  timeSeriesData: any[];
  threatTimeline: ThreatIndicator[];
  minTime: number;
  maxTime: number;
}

// --- Custom Hooks ---

/**
 * Hook: useAttributeNodeData
 * 
 * Purpose:
 * Calculates statistics and related nodes for a given "attribute" node 
 * (e.g., a specific country, organization, or service).
 * 
 * @param node The selected attribute node.
 * @param graphData The complete graph data.
 * @returns An object containing related nodes and total connections, or null if not an attribute node.
 */
export function useAttributeNodeData(node: Node, graphData: GraphData) {
  return useMemo(() => {
    if (node.type !== "attribute" || !node.attrType) return null;
    const relatedNodes = new Set<string>();
    let totalConnections = 0;
    
    // Find all nodes that share this attribute
    graphData.nodes.forEach(n => {
      if (n.attributes) {
        const keysToCheck = node.attrType === 'country' ? ['country', 'country.src', 'country.dst'] 
                          : node.attrType === 'org' ? ['org', 'org.src', 'org.dst'] 
                          : node.attrType ? [node.attrType] : [];
        
        const hasMatch = keysToCheck.some(key => n.attributes![key]?.includes(node.attrValue || ''));
        if (hasMatch) relatedNodes.add(n.id);
      }
    });
    
    // Count total connections involving the related nodes
    graphData.links.forEach(l => {
      if (l.type === 'attribute') return;
      const sourceId = typeof l.source === 'object' ? (l.source as Node).id : String(l.source);
      const targetId = typeof l.target === 'object' ? (l.target as Node).id : String(l.target);
      if (relatedNodes.has(sourceId) || relatedNodes.has(targetId)) totalConnections++;
    });

    return { relatedNodes: Array.from(relatedNodes), totalConnections };
  }, [node, graphData]);
}

/**
 * Hook: useIpNodeStats
 * 
 * Purpose:
 * Calculates comprehensive statistics for a given IP node, including traffic volume,
 * directionality, service usage, time-series data, and threat indicators.
 * 
 * @param node The selected IP node.
 * @param graphData The complete graph data.
 * @returns An IpNodeStats object containing aggregated metrics, or null if not an IP node.
 */
export function useIpNodeStats(node: Node, graphData: GraphData): IpNodeStats | null {
  return useMemo(() => {
    if (node.type === "attribute") return null;

    const stats: IpNodeStats = {
      totalSize: 0,
      connectionCount: 0,
      directionStats: {
        inbound: { size: 0, count: 0 },
        outbound: { size: 0, count: 0 },
        lateral: { size: 0, count: 0 }
      },
      roleStats: { server: [], client: [] },
      serviceVolumeStats: [],
      timeSeriesData: [],
      threatTimeline: [],
      minTime: Infinity,
      maxTime: -Infinity,
    };

    const serverMap = new Map<string, number>();
    const clientMap = new Map<string, number>();
    const serviceMap = new Map<string, ServiceVolume>();
    
    // Cache relevant sessions to avoid iterating over ALL links twice
    const relevantSessions: any[] = [];

    // --- Pass 1: Aggregate totals, map behaviors, and extract relevant sessions ---
    graphData.links.forEach(link => {
      if (link.type === "attribute" || !link.sessions) return;
      
      const sourceId = typeof link.source === "object" ? (link.source as Node).id : String(link.source);
      const targetId = typeof link.target === "object" ? (link.target as Node).id : String(link.target);
      
      // Only process links connected to the selected node
      if (sourceId === node.id || targetId === node.id) {
        link.sessions.forEach(session => {
          relevantSessions.push(session); // Cache for Pass 2

          const size = parseInt(String(Array.isArray(session.size) ? session.size[0] : session.size || 0), 10);
          const time = Number(session.time) * 1000;
          const direction = String(Array.isArray(session.direction) ? session.direction[0] : session.direction || "").toLowerCase() as 'inbound' | 'outbound' | 'lateral';
          const serviceName = String(Array.isArray(session.service) ? session.service[0] : session.service || "unknown");
          const ipSrc = Array.isArray(session['ip.src']) ? session['ip.src'][0] : session['ip.src'];
          const ipDst = Array.isArray(session['ip.dst']) ? session['ip.dst'][0] : session['ip.dst'];

          // Track min/max time for time-series bucketing
          if (!isNaN(time) && time > 0) {
            stats.minTime = Math.min(stats.minTime, time);
            stats.maxTime = Math.max(stats.maxTime, time);
          }

          stats.totalSize += size;
          stats.connectionCount++;

          // Aggregate by direction
          if (stats.directionStats[direction]) {
            stats.directionStats[direction].size += size;
            stats.directionStats[direction].count++;
          }

          // Aggregate by role (client vs server)
          if (ipDst === node.id) serverMap.set(serviceName, (serverMap.get(serviceName) || 0) + 1);
          if (ipSrc === node.id) clientMap.set(serviceName, (clientMap.get(serviceName) || 0) + 1);

          // Aggregate service volume
          if (!serviceMap.has(serviceName)) {
            serviceMap.set(serviceName, { name: serviceName, inbound: 0, outbound: 0, lateral: 0, total: 0 });
          }
          const serviceVol = serviceMap.get(serviceName)!;
          serviceVol.total += size;
          if (direction === 'inbound') serviceVol.inbound += size;
          else if (direction === 'outbound') serviceVol.outbound += size;
          else if (direction === 'lateral') serviceVol.lateral += size;

          // Extract threat indicators
          const threatTypes: ThreatType[] = ['ioc', 'boc', 'eoc'];
          threatTypes.forEach(type => {
            if (session[type]) {
              const vals = Array.isArray(session[type]) ? session[type] : [session[type]];
              vals.forEach((v: string) => stats.threatTimeline.push({ time, type, value: v }));
            }
          });
        });
      }
    });

    // --- Pass 2: Time Series Aggregation ---
    // Only process if we have valid time data
    if (stats.minTime !== Infinity && stats.maxTime !== -Infinity && stats.minTime !== stats.maxTime) {
      const timeSpan = stats.maxTime - stats.minTime;
      const numBuckets = 20;
      const bucketSize = Math.max(1000, timeSpan / numBuckets);
      
      const buckets = new Map<number, { time: number; inbound: number; outbound: number; lateral: number }>();
      
      // Initialize buckets
      for (let i = 0; i <= numBuckets; i++) {
        const bucketTime = stats.minTime + (i * bucketSize);
        buckets.set(bucketTime, { time: bucketTime, inbound: 0, outbound: 0, lateral: 0 });
      }

      // Distribute sessions into time buckets
      relevantSessions.forEach(session => {
        const time = Number(session.time) * 1000;
        if (isNaN(time) || time <= 0) return;
        
        const size = parseInt(String(Array.isArray(session.size) ? session.size[0] : session.size || 0), 10);
        const direction = String(Array.isArray(session.direction) ? session.direction[0] : session.direction || "").toLowerCase() as 'inbound' | 'outbound' | 'lateral';
        
        const bucketIndex = Math.floor((time - stats.minTime) / bucketSize);
        const bucketTime = stats.minTime + (bucketIndex * bucketSize);
        
        const bucket = buckets.get(bucketTime);
        if (bucket && (direction === 'inbound' || direction === 'outbound' || direction === 'lateral')) {
          bucket[direction] += size;
        }
      });

      stats.timeSeriesData = Array.from(buckets.values()).sort((a, b) => a.time - b.time);
    }

    // Sort and limit results for the UI
    stats.roleStats.server = Array.from(serverMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
    stats.roleStats.client = Array.from(clientMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
    stats.serviceVolumeStats = Array.from(serviceMap.values()).sort((a, b) => b.total - a.total).slice(0, 5);
    stats.threatTimeline.sort((a, b) => b.time - a.time);

    return stats;
  }, [node, graphData]);
}
