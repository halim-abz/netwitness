import { GraphData, Node, Link } from "../types";

interface GlobeDataResult {
  arcsData: any[];
  ringsData: any[];
  stats: {
    flows: number;
    size: number;
    ips: number;
  };
  liveFeed: any[];
}

export function processGlobeData(
  data: GraphData,
  searchQuery: string,
  showThreatsOnly: boolean,
  feedSort: 'time' | 'size',
  countryCentroids: Map<string, { lat: number; lng: number }>
): GlobeDataResult {
  const arcs: any[] = [];
  let totalSize = 0;
  const uniqueIPs = new Set<string>();
  const feed: any[] = [];
  const nodesById = new Map(data.nodes.map(n => [n.id, n]));

  // Pre-calculate search query terms for efficiency
  const isExclude = searchQuery.startsWith('!');
  const q = (isExclude ? searchQuery.slice(1) : searchQuery).toLowerCase().trim();

  // Single pass to filter links and calculate node stats
  const nodeSeverities = new Map<string, number>();
  const nodeDegree = new Map<string, number>();
  
  const filteredLinks = data.links.filter((link: any) => {
    // Threat filter
    if (showThreatsOnly) {
      const hasThreat = link.sessions?.some((s: any) => s.ioc || s.eoc || s.boc);
      if (!hasThreat) return false;
    }

    // Search query filter
    if (q) {
      const sourceNode = typeof link.source === 'string' ? nodesById.get(link.source) : link.source;
      const targetNode = typeof link.target === 'string' ? nodesById.get(link.target) : link.target;
      
      let match = false;
      if (sourceNode?.id.toLowerCase().includes(q) || targetNode?.id.toLowerCase().includes(q)) match = true;
      
      if (!match && link.sessions) {
        match = link.sessions.some((s: any) => 
          (s.service && String(s.service).toLowerCase().includes(q)) ||
          (s['country.dst'] && String(s['country.dst']).toLowerCase().includes(q)) ||
          (s['country.src'] && String(s['country.src']).toLowerCase().includes(q)) ||
          (s['alias.host'] && String(s['alias.host']).toLowerCase().includes(q))
        );
      }
      
      if (!match && (sourceNode?.country?.toLowerCase().includes(q) || targetNode?.country?.toLowerCase().includes(q))) match = true;
      
      if (isExclude ? match : !match) return false;
    }

    // While filtering, we can also start collecting node stats for the links that pass
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
    const targetId = typeof link.target === 'string' ? link.target : link.target.id;
    
    nodeDegree.set(sourceId, (nodeDegree.get(sourceId) || 0) + 1);
    nodeDegree.set(targetId, (nodeDegree.get(targetId) || 0) + 1);

    let severity = 0;
    link.sessions?.forEach((s: any) => {
      if (s.ioc) severity = Math.max(severity, 3);
      else if (s.boc) severity = Math.max(severity, 2);
      else if (s.eoc) severity = Math.max(severity, 1);
    });
    
    nodeSeverities.set(sourceId, Math.max(severity, nodeSeverities.get(sourceId) || 0));
    nodeSeverities.set(targetId, Math.max(severity, nodeSeverities.get(targetId) || 0));

    return true;
  });

  const getColorFromSeverity = (sev: number) => sev === 3 ? '#ef4444' : sev === 2 ? '#f97316' : sev === 1 ? '#eab308' : '#3b82f6';
  const uniqueNodes = new Map<string, any>();

  // Process filtered links to generate arcs, rings, and live feed data
  filteredLinks.forEach((link: any) => {
    const sourceNode = typeof link.source === 'string' ? nodesById.get(link.source) : link.source;
    const targetNode = typeof link.target === 'string' ? nodesById.get(link.target) : link.target;

    if (!sourceNode || !targetNode) return;

    uniqueIPs.add(sourceNode.id);
    uniqueIPs.add(targetNode.id);
    totalSize += link.size || 0;

    const srcColor = getColorFromSeverity(nodeSeverities.get(sourceNode.id) || 0);
    const dstColor = getColorFromSeverity(nodeSeverities.get(targetNode.id) || 0);

    // Resolve coordinates from node data or country centroids
    const getCoords = (node: any) => {
      if (node.lat !== undefined && node.lng !== undefined && !isNaN(node.lat) && !isNaN(node.lng)) {
        return { lat: node.lat, lng: node.lng };
      }
      if (node.country) {
        const centroid = countryCentroids.get(node.country.toLowerCase());
        if (centroid) return centroid;
      }
      return null;
    };

    const srcCoords = getCoords(sourceNode);
    const dstCoords = getCoords(targetNode);

    const services = new Set<string>();
    const countries = new Set<string>();
    const aliasHosts = new Set<string>();
    const iocs = new Set<string>();
    const bocs = new Set<string>();
    const eocs = new Set<string>();
    let latestTime = 0;

    link.sessions?.forEach((s: any) => {
      if (s.service) (Array.isArray(s.service) ? s.service : [s.service]).forEach((x: string) => services.add(x));
      if (s['country.dst']) (Array.isArray(s['country.dst']) ? s['country.dst'] : [s['country.dst']]).forEach((x: string) => countries.add(x));
      if (s['country.src']) (Array.isArray(s['country.src']) ? s['country.src'] : [s['country.src']]).forEach((x: string) => countries.add(x));
      if (s['alias.host']) (Array.isArray(s['alias.host']) ? s['alias.host'] : [s['alias.host']]).forEach((x: string) => aliasHosts.add(x));
      if (s.ioc) (Array.isArray(s.ioc) ? s.ioc : [s.ioc]).forEach((x: string) => iocs.add(x));
      if (s.boc) (Array.isArray(s.boc) ? s.boc : [s.boc]).forEach((x: string) => bocs.add(x));
      if (s.eoc) (Array.isArray(s.eoc) ? s.eoc : [s.eoc]).forEach((x: string) => eocs.add(x));
      if (s.time) {
        const t = Array.isArray(s.time) ? parseInt(s.time[0]) : parseInt(s.time);
        if (t > latestTime) latestTime = t;
      }
    });

    if (sourceNode.country) countries.add(sourceNode.country);
    if (targetNode.country) countries.add(targetNode.country);

    let linkSeverity = 0;
    link.sessions?.forEach((s: any) => {
      if (s.ioc) linkSeverity = Math.max(linkSeverity, 3);
      else if (s.boc) linkSeverity = Math.max(linkSeverity, 2);
      else if (s.eoc) linkSeverity = Math.max(linkSeverity, 1);
    });
    const linkColor = getColorFromSeverity(linkSeverity);

    feed.push({
      id: `${sourceNode.id}-${targetNode.id}`,
      source: sourceNode.id,
      target: targetNode.id,
      sourceNode,
      targetNode,
      srcCoords,
      dstCoords,
      srcColor,
      dstColor,
      color: linkColor,
      link,
      size: link.size || 0,
      time: latestTime,
      service: Array.from(services).join(', '),
      country: Array.from(countries).join(', '),
      aliasHost: Array.from(aliasHosts).join(', '),
      ioc: Array.from(iocs).join(', '),
      boc: Array.from(bocs).join(', '),
      eoc: Array.from(eocs).join(', '),
    });
  });

  feed.sort((a, b) => {
    if (feedSort === 'time') return b.time - a.time;
    return b.size - a.size;
  });

  // Limit arcs to top 500 to maintain smooth WebGL performance
  const topFeed = feed.slice(0, 500);
  topFeed.forEach((item) => {
    if (item.srcCoords && !uniqueNodes.has(item.source)) {
      uniqueNodes.set(item.source, { lat: item.srcCoords.lat, lng: item.srcCoords.lng, color: item.srcColor, node: item.sourceNode, degree: nodeDegree.get(item.source) || 0 });
    }
    if (item.dstCoords && !uniqueNodes.has(item.target)) {
      uniqueNodes.set(item.target, { lat: item.dstCoords.lat, lng: item.dstCoords.lng, color: item.dstColor, node: item.targetNode, degree: nodeDegree.get(item.target) || 0 });
    }

    if (item.srcCoords && item.dstCoords) {
      const arcBase = {
        startLat: item.srcCoords.lat,
        startLng: item.srcCoords.lng,
        endLat: item.dstCoords.lat,
        endLng: item.dstCoords.lng,
        color: [item.srcColor, item.dstColor],
        link: item.link,
        name: `${item.source} -> ${item.target}`
      };
      // Single arc with dash animation for better performance
      arcs.push(arcBase);
    }
  });

  return {
    arcsData: arcs,
    ringsData: Array.from(uniqueNodes.values()),
    stats: {
      flows: filteredLinks.length,
      size: totalSize,
      ips: uniqueIPs.size
    },
    liveFeed: feed
  };
}
