import { GraphData, Node, Link, NetWitnessResponse, Session } from "../types";

/**
 * Helper to ensure a value is treated as an array.
 * @param val - The value to wrap in an array if it isn't one already.
 * @returns An array containing the value(s).
 */
export const asArray = <T,>(val: T | T[] | undefined): T[] => {
  if (val === undefined) return [];
  return Array.isArray(val) ? val : [val];
};

/**
 * Helper to get the first element of a value that might be an array.
 * @param val - The value to extract the first element from.
 * @returns The first element, or the value itself if not an array.
 */
export const firstOf = <T,>(val: T | T[] | undefined): T | undefined => {
  if (val === undefined) return undefined;
  return Array.isArray(val) ? val[0] : val;
};

/**
 * Processes raw NetWitness data into a graph-friendly format.
 * Optimized for CPU and memory by minimizing array allocations and using Map for O(1) lookups.
 * 
 * @param data - The raw response from the NetWitness API.
 * @param homeLoc - Optional home location to use for internal network nodes.
 * @returns A structured GraphData object containing nodes and links.
 */
export const processData = (data: NetWitnessResponse, homeLoc?: {lat: number, lng: number} | null): GraphData => {
  if (!data?.results?.fields) return { nodes: [], links: [] };

  // Use Map for faster lookups and insertions compared to plain objects
  const sessionsMap = new Map<number, Session>();
  const fields = data.results.fields;
  
  // Group fields by session (group ID) in a single pass
  for (let i = 0, len = fields.length; i < len; i++) {
    const field = fields[i];
    const g = field.group;
    let session = sessionsMap.get(g);
    
    if (!session) {
      session = { group: g };
      sessionsMap.set(g, session);
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
  }

  const nodesMap = new Map<string, Node>();
  const linksMap = new Map<string, Link>();

  // Process each session to build nodes and links
  for (const session of sessionsMap.values()) {
    const srcs = asArray(session["ip.src"]);
    const dsts = asArray(session["ip.dst"]);

    if (srcs.length === 0 && dsts.length === 0) continue;

    const dirStr = String(firstOf(session["direction"]) || '').toLowerCase();
    const cSrc = firstOf(session["country.src"]);
    const cDst = firstOf(session["country.dst"]);
    const oSrc = firstOf(session["org.src"]);
    const oDst = firstOf(session["org.dst"]);
    
    const nnRaw = session["netname"];
    const nn = Array.isArray(nnRaw) ? nnRaw.join(", ") : nnRaw;

    const sessionKeys = Object.keys(session);

    // Helper to add/update node attributes
    const updateNode = (id: string, isSrc: boolean) => {
      let node = nodesMap.get(id);
      if (!node) {
        node = { id, type: "ip", attributes: {}, networkType: "unknown" };
        nodesMap.set(id, node);
      }
      
      let networkType: 'public' | 'internal' | 'unknown' = node.networkType || 'unknown';
      if (dirStr) {
        if (dirStr === 'inbound') {
          networkType = isSrc ? 'public' : 'internal';
        } else if (dirStr === 'outbound') {
          networkType = isSrc ? 'internal' : 'public';
        } else if (dirStr === 'lateral') {
          networkType = 'internal';
        }
        node.networkType = networkType;
      }

      const country = isSrc ? cSrc : cDst;
      if (country) node.country = String(country);
      
      const org = isSrc ? oSrc : oDst;
      if (org) node.org = String(org);
      
      if (nn) {
        const nnStr = String(nn);
        if (!node.netname) node.netname = nnStr;
        else if (!node.netname.includes(nnStr)) node.netname += `, ${nnStr}`;
      }
      
      const lat = firstOf(isSrc ? session["latdec.src"] : session["latdec.dst"]);
      const lng = firstOf(isSrc ? session["longdec.src"] : session["longdec.dst"]);
      
      if (lat) node.lat = parseFloat(String(lat));
      if (lng) node.lng = parseFloat(String(lng));

      if (homeLoc && networkType === 'internal' && dirStr !== 'lateral') {
        if (node.lat === undefined) node.lat = homeLoc.lat;
        if (node.lng === undefined) node.lng = homeLoc.lng;
      }

      // Batch add attributes
      for (let k = 0; k < sessionKeys.length; k++) {
        const key = sessionKeys[k];
        // Skip keys that are handled explicitly or are irrelevant
        if (
          key === "group" || key === "ip.src" || key === "ip.dst" || 
          key === "size" || key === "direction" || 
          key === "latdec.src" || key === "latdec.dst" || 
          key === "longdec.src" || key === "longdec.dst" || 
          key === "time"
        ) continue;
        
        if ((key.endsWith('.src') || key.endsWith('.srcport')) && !isSrc) continue;
        if ((key.endsWith('.dst') || key.endsWith('.dstport')) && isSrc) continue;
        if ((key === "ssl.ca" || key === "ssl.subject" || key === "server") && isSrc) continue;
        if (key === "client" && !isSrc) continue;
        
        if (!node.attributes![key]) node.attributes![key] = [];
        
        const valuesToAdd = asArray(session[key]);
        for (let vIdx = 0; vIdx < valuesToAdd.length; vIdx++) {
          const strVal = String(valuesToAdd[vIdx]);
          if (key === 'netname') {
            if (strVal.endsWith(' src') && !isSrc) continue;
            if (strVal.endsWith(' dst') && isSrc) continue;
          }
          if (!node.attributes![key].includes(strVal)) {
            node.attributes![key].push(strVal);
          }
        }
      }
    };

    // Update all source and destination nodes
    for (let i = 0; i < srcs.length; i++) updateNode(String(srcs[i]), true);
    for (let i = 0; i < dsts.length; i++) updateNode(String(dsts[i]), false);

    // Create/update links
    const sizeVal = firstOf(session["size"]);
    const size = sizeVal ? (parseInt(String(sizeVal), 10) || 0) : 0;
    const services = asArray(session["service"]);

    for (let i = 0; i < srcs.length; i++) {
      const src = String(srcs[i]);
      for (let j = 0; j < dsts.length; j++) {
        const dst = String(dsts[j]);
        const linkId = `${src}-${dst}`;
        let link = linksMap.get(linkId);
        
        if (!link) {
          link = {
            source: src,
            target: dst,
            sessions: [],
            size: 0,
            count: 0,
            services: new Set<string>(),
          } as any;
          linksMap.set(linkId, link);
        }

        link!.sessions!.push(session);
        link!.count = (link!.count || 0) + 1;
        link!.size = (link!.size || 0) + size;
        
        for (let s = 0; s < services.length; s++) {
          (link as any).services.add(String(services[s]));
        }
      }
    }
  }

  // Convert Maps to arrays and format services for links
  const linksArray = Array.from(linksMap.values());
  for (let i = 0; i < linksArray.length; i++) {
    const link = linksArray[i] as any;
    link.services = Array.from(link.services);
  }

  return {
    nodes: Array.from(nodesMap.values()),
    links: linksArray,
  };
};
