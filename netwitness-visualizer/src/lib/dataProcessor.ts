import { GraphData, Node, Link, NetWitnessResponse, Session } from "../types";

/**
 * Ensures a value is treated as an array.
 */
export const asArray = <T,>(val: T | T[] | undefined): T[] => {
  if (val === undefined) return [];
  return Array.isArray(val) ? val : [val];
};

/**
 * Gets the first element of a value that might be an array.
 */
export const firstOf = <T,>(val: T | T[] | undefined): T | undefined => {
  if (val === undefined) return undefined;
  return Array.isArray(val) ? val[0] : val;
};

// --- CONSTANTS & HELPERS ---

const IGNORED_ATTRIBUTE_KEYS = new Set([
  "group", "ip.src", "ip.dst", "size", "direction",
  "latdec.src", "latdec.dst", "longdec.src", "longdec.dst", "time"
]);

/**
 * Determines whether a session key should be included as a node attribute.
 */
const shouldIncludeAttribute = (key: string, isSrc: boolean): boolean => {
  if (IGNORED_ATTRIBUTE_KEYS.has(key)) return false;
  if ((key.endsWith('.src') || key.endsWith('.srcport')) && !isSrc) return false;
  if ((key.endsWith('.dst') || key.endsWith('.dstport')) && isSrc) return false;
  if ((key === "ssl.ca" || key === "ssl.subject" || key === "server") && isSrc) return false;
  if (key === "client" && !isSrc) return false;
  return true;
};

/**
 * Determines the network type based on traffic direction.
 */
const determineNetworkType = (dirStr: string, isSrc: boolean): 'public' | 'internal' | 'unknown' => {
  if (dirStr === 'inbound') return isSrc ? 'public' : 'internal';
  if (dirStr === 'outbound') return isSrc ? 'internal' : 'public';
  if (dirStr === 'lateral') return 'internal';
  return 'unknown';
};

// Internal builder type to safely accumulate Set data before final mapping
type LinkBuilder = Omit<Link, 'services'> & {
  servicesSet: Set<string>;
};

/**
 * Processes raw NetWitness data into a structured GraphData format.
 */
export const processData = (
  data: NetWitnessResponse, 
  homeLoc?: { lat: number; lng: number } | null
): GraphData => {
  if (!data?.results?.fields || data.results.fields.length === 0) {
    return { nodes: [], links: [] };
  }

  const sessionsMap = new Map<number, Session>();
  const nodesMap = new Map<string, Node>();
  const linksMap = new Map<string, LinkBuilder>();

  // 1. Group fields by session (group ID)
  for (const field of data.results.fields) {
    const groupId = field.group;
    let session = sessionsMap.get(groupId);
    
    if (!session) {
      session = { group: groupId };
      sessionsMap.set(groupId, session);
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

  // Helper function moved outside the loop to prevent reallocation
  const processNode = (ip: string, isSrc: boolean, session: Session, sessionKeys: string[]) => {
    let node = nodesMap.get(ip);
    if (!node) {
      node = { id: ip, type: "ip", attributes: {}, networkType: "unknown" };
      nodesMap.set(ip, node);
    }
    
    const dirStr = String(firstOf(session["direction"]) || '').toLowerCase();
    const networkType = determineNetworkType(dirStr, isSrc);
    
    if (networkType !== 'unknown') {
      node.networkType = networkType;
    }

    const country = firstOf(isSrc ? session["country.src"] : session["country.dst"]);
    if (country) node.country = String(country);
    
    const org = firstOf(isSrc ? session["org.src"] : session["org.dst"]);
    if (org) node.org = String(org);
    
    const rawNetname = session["netname"];
    const netname = Array.isArray(rawNetname) ? rawNetname.join(", ") : rawNetname;
    if (netname) {
      const nnStr = String(netname);
      if (!node.netname) {
        node.netname = nnStr;
      } else if (!node.netname.includes(nnStr)) {
        node.netname += `, ${nnStr}`;
      }
    }
    
    const latRaw = firstOf(isSrc ? session["latdec.src"] : session["latdec.dst"]);
    const lngRaw = firstOf(isSrc ? session["longdec.src"] : session["longdec.dst"]);
    
    if (latRaw !== undefined) {
      const lat = parseFloat(String(latRaw));
      if (!Number.isNaN(lat)) node.lat = lat;
    }
    if (lngRaw !== undefined) {
      const lng = parseFloat(String(lngRaw));
      if (!Number.isNaN(lng)) node.lng = lng;
    }

    // Apply home location fallback for internal non-lateral nodes
    if (homeLoc && node.networkType === 'internal' && dirStr !== 'lateral') {
      node.lat ??= homeLoc.lat;
      node.lng ??= homeLoc.lng;
    }

    // Batch add dynamic attributes
    if (!node.attributes) node.attributes = {};
    
    for (const key of sessionKeys) {
      if (!shouldIncludeAttribute(key, isSrc)) continue;
      
      node.attributes[key] ??= [];
      const valuesToAdd = asArray(session[key]);
      
      for (const val of valuesToAdd) {
        const strVal = String(val);
        // Specific netname suffix filtering
        if (key === 'netname') {
          if (strVal.endsWith(' src') && !isSrc) continue;
          if (strVal.endsWith(' dst') && isSrc) continue;
        }
        
        if (!node.attributes[key].includes(strVal)) {
          node.attributes[key].push(strVal);
        }
      }
    }
  };

  // 2. Process sessions to build nodes and links
  for (const session of sessionsMap.values()) {
    const srcs = asArray(session["ip.src"]).map(String);
    const dsts = asArray(session["ip.dst"]).map(String);

    if (srcs.length === 0 && dsts.length === 0) continue;

    const sessionKeys = Object.keys(session);

    // Build Nodes
    for (const src of srcs) processNode(src, true, session, sessionKeys);
    for (const dst of dsts) processNode(dst, false, session, sessionKeys);

    // Build Links
    const sizeVal = firstOf(session["size"]);
    const size = sizeVal ? (parseInt(String(sizeVal), 10) || 0) : 0;
    const services = asArray(session["service"]).map(String);

    for (const src of srcs) {
      for (const dst of dsts) {
        const linkId = `${src}-${dst}`;
        let link = linksMap.get(linkId);
        
        if (!link) {
          link = {
            source: src,
            target: dst,
            sessions: [],
            size: 0,
            count: 0,
            servicesSet: new Set<string>(),
          };
          linksMap.set(linkId, link);
        }

        link.sessions!.push(session);
        link.count = (link.count || 0) + 1;
        link.size = (link.size || 0) + size;
        
        for (const service of services) {
          link.servicesSet.add(service);
        }
      }
    }
  }

  // 3. Finalize Output Map
  const finalizedLinks: Link[] = Array.from(linksMap.values()).map(builder => {
    const { servicesSet, ...rest } = builder;
    return {
      ...rest,
      services: Array.from(servicesSet)
    } as Link; 
  });

  return {
    nodes: Array.from(nodesMap.values()),
    links: finalizedLinks,
  };
};