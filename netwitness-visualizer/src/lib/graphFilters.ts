import { GraphData, Node, Link } from "../types";

export interface GraphAugmentationResult {
  augmentedNodes: Node[];
  augmentedLinks: Link[];
  nodeDegree: Map<string, number>;
  adjacencyMap: Map<string, Set<string>>;
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
  if (!data.nodes.length) {
    return {
      augmentedNodes: [],
      augmentedLinks: [],
      nodeDegree: new Map<string, number>(),
      adjacencyMap: new Map<string, Set<string>>(),
    };
  }

  // 1. Filter nodes based on attributeFilters
  const filteredNodes = data.nodes.filter((node) => {
    const checkFilter = (value: string, filterText: string) => {
      if (!filterText) return true;
      const isExclude = filterText.startsWith("!");
      const textToMatch = isExclude ? filterText.slice(1).toLowerCase() : filterText.toLowerCase();
      if (!textToMatch) return true;
      const includes = value.toLowerCase().includes(textToMatch);
      return isExclude ? !includes : includes;
    };

    if (attributeFilters["Internal IP"]) {
      if (node.networkType === "internal" && !checkFilter(node.id, attributeFilters["Internal IP"])) {
        return false;
      }
    }
    if (attributeFilters["Public IP"]) {
      if (node.networkType === "public" && !checkFilter(node.id, attributeFilters["Public IP"])) {
        return false;
      }
    }

    for (const [attr, filterText] of Object.entries(attributeFilters)) {
      if (attr === "Internal IP" || attr === "Public IP") continue;
      if (!filterText || !displayedAttributes.includes(attr)) continue;

      const isExclude = filterText.startsWith("!");
      const textToMatch = isExclude ? filterText.slice(1).toLowerCase() : filterText.toLowerCase();
      if (!textToMatch) continue;

      const keysToCheck = attr === "country" ? ["country", "country.src", "country.dst"] : attr === "org" ? ["org", "org.src", "org.dst"] : [attr];
      let matches = false;
      for (const key of keysToCheck) {
        if (node.attributes && node.attributes[key]) {
          if (node.attributes[key].some((val) => String(val).toLowerCase().includes(textToMatch))) {
            matches = true;
            break;
          }
        }
      }

      if (isExclude) {
        if (matches) return false;
      } else {
        if (!matches) return false;
      }
    }
    return true;
  });

  // 2. Filter links
  const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));
  const filteredLinks = data.links.filter((l) => {
    const sId = typeof l.source === "object" ? (l.source as any).id : l.source;
    const tId = typeof l.target === "object" ? (l.target as any).id : l.target;
    return filteredNodeIds.has(sId) && filteredNodeIds.has(tId);
  });

  // 3. Handle IP connectivity filtering
  const hasIpFilters = attributeFilters["Internal IP"]?.trim() || attributeFilters["Public IP"]?.trim();
  const connectedNodeIds = new Set<string>();
  if (hasIpFilters) {
    filteredLinks.forEach((l) => {
      const sId = typeof l.source === "object" ? (l.source as any).id : l.source;
      const tId = typeof l.target === "object" ? (l.target as any).id : l.target;
      connectedNodeIds.add(sId);
      connectedNodeIds.add(tId);
    });
  }

  const finalFilteredNodes = hasIpFilters ? filteredNodes.filter((n) => connectedNodeIds.has(n.id)) : filteredNodes;

  // 4. Augment with attribute nodes
  const nodes: Node[] = finalFilteredNodes.map((d) => ({ ...d }));
  const links: Link[] = filteredLinks.map((d) => ({ ...d, type: "traffic" }));
  const attributeNodesMap = new Map<string, Node>();

  finalFilteredNodes.forEach((node) => {
    displayedAttributes.forEach((attr) => {
      if (attr === "service") return;
      const keysToCheck = attr === "country" ? ["country", "country.src", "country.dst"] : attr === "org" ? ["org", "org.src", "org.dst"] : [attr];

      keysToCheck.forEach((key) => {
        if (node.attributes && node.attributes[key]) {
          node.attributes[key].forEach((val) => {
            const subNodeId = `attr-${attr}-${val}`;
            if (!attributeNodesMap.has(subNodeId)) {
              const newAttrNode: Node = {
                id: subNodeId,
                type: "attribute",
                attrType: attr,
                attrValue: val,
              };
              attributeNodesMap.set(subNodeId, newAttrNode);
              nodes.push(newAttrNode);
            }
            links.push({
              source: node.id,
              target: subNodeId,
              type: "attribute",
            });
          });
        }
      });
    });
  });

  // 5. Calculate node degree and adjacency map
  const degreeMap = new Map<string, number>();
  const adjMap = new Map<string, Set<string>>();

  links.forEach((l) => {
    const sId = typeof l.source === "object" ? (l.source as any).id : l.source;
    const tId = typeof l.target === "object" ? (l.target as any).id : l.target;

    degreeMap.set(sId, (degreeMap.get(sId) || 0) + 1);
    degreeMap.set(tId, (degreeMap.get(tId) || 0) + 1);

    if (!adjMap.has(sId)) adjMap.set(sId, new Set());
    if (!adjMap.has(tId)) adjMap.set(tId, new Set());
    adjMap.get(sId)!.add(tId);
    adjMap.get(tId)!.add(sId);
  });

  return { augmentedNodes: nodes, augmentedLinks: links, nodeDegree: degreeMap, adjacencyMap: adjMap };
}
