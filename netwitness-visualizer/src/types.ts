export interface NetWitnessField {
  id1: number;
  id2: number;
  count: number;
  format: number;
  type: string;
  flags: number;
  group: number;
  value: string;
}

export interface NetWitnessResponse {
  flags: number;
  results: {
    id1: number;
    id2: number;
    fields: NetWitnessField[];
  };
}

export interface Session {
  group: number;
  [key: string]: any;
}

export interface Node {
  id: string;
  type: string;
  attributes?: Record<string, string[]>;
  attrType?: string;
  attrValue?: string;
  parentId?: string;
  networkType?: 'internal' | 'public' | 'unknown';
  country?: string;
  org?: string;
  netname?: string;
  lat?: number;
  lng?: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

export interface Link {
  source: string | Node;
  target: string | Node;
  sessions?: Session[];
  size?: number;
  count?: number;
  type?: string;
}

export interface GraphData {
  nodes: Node[];
  links: Link[];
}
