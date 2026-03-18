import { useMemo } from 'react';
import { GraphData, Node, Link, Session } from '../types';
import { asArray, firstOf } from '../lib/dataProcessor';

export interface AssetService {
  name: string;
  ports: Set<string>;
  sessions: number;
  volume: number;
  outboundVolume: number;
  inboundVolume: number;
  lateralVolume: number;
}

export interface AssetClient {
  name: string;
  sessions: number;
  volume: number;
}

export interface AssetPeer {
  ip: string;
  volume: number;
  sessions: number;
  firstSeen: number;
  inboundVolume: number;
  outboundVolume: number;
  country?: string;
}

export interface Indicator {
  type: 'ioc' | 'boc' | 'eoc';
  value: string;
  time: number;
}

export interface Asset {
  ip: string;
  node: Node;
  role: 'server' | 'client' | 'mixed' | 'unknown';
  networkType: 'internal' | 'public' | 'unknown';
  totalVolume: number;
  totalSessions: number;
  serverServices: Map<string, AssetService>;
  clientServices: Map<string, AssetService>;
  outboundVolume: number;
  inboundVolume: number;
  lateralVolume: number;
  encryptedVolume: number;
  plaintextVolume: number;
  clients: Map<string, AssetClient>;
  tcpPorts: Map<string, number>;
  udpPorts: Map<string, number>;
  tlsVersions: Map<string, number>;
  ja3Fingerprints: Map<string, number>;
  peers: Map<string, AssetPeer>;
  timeSeries: Map<number, number>;
  indicators: Indicator[];
  ciphers: Map<string, number>;
  usernames: Set<string>;
  domains: Set<string>;
  sslCas: Set<string>;
  sslSubjects: Set<string>;
  filetypes: Set<string>;
  filenames: Set<string>;
  actions: Map<string, number>;
  emails: Set<string>;
}

export function useAssetsData(data: GraphData) {
  return useMemo(() => {
    const assets = new Map<string, Asset>();

    // Initialize assets from nodes
    data.nodes.forEach(node => {
      if (node.type === 'ip') {
        assets.set(node.id, {
          ip: node.id,
          node,
          role: 'unknown',
          networkType: node.networkType || 'unknown',
          totalVolume: 0,
          totalSessions: 0,
          serverServices: new Map(),
          clientServices: new Map(),
          outboundVolume: 0,
          inboundVolume: 0,
          lateralVolume: 0,
          encryptedVolume: 0,
          plaintextVolume: 0,
          clients: new Map(),
          tcpPorts: new Map(),
          udpPorts: new Map(),
          tlsVersions: new Map(),
          ja3Fingerprints: new Map(),
          peers: new Map(),
          timeSeries: new Map(),
          indicators: [],
          ciphers: new Map(),
          usernames: new Set(),
          domains: new Set(),
          sslCas: new Set(),
          sslSubjects: new Set(),
          filetypes: new Set(),
          filenames: new Set(),
          actions: new Map(),
          emails: new Set(),
        });
      }
    });

    let hasServer = new Set<string>();
    let hasClient = new Set<string>();

    // Process links and sessions
    data.links.forEach(link => {
      const srcId = typeof link.source === 'string' ? link.source : link.source.id;
      const dstId = typeof link.target === 'string' ? link.target : link.target.id;

      const srcAsset = assets.get(srcId);
      const dstAsset = assets.get(dstId);

      if (srcAsset) hasClient.add(srcId);
      if (dstAsset) hasServer.add(dstId);

      link.sessions?.forEach(session => {
        const sizeVal = firstOf(session['size']);
        const size = sizeVal ? (parseInt(String(sizeVal), 10) || 0) : 0;
        const timeVal = firstOf(session['time']);
        const time = timeVal ? (parseInt(String(timeVal), 10) || 0) : 0;
        
        const services = asArray(session['service']).map(String);
        if (services.includes('0')) return; // Skip sessions with service=0

        const tcpDstPorts = asArray(session['tcp.dstport']).map(String);
        const udpDstPorts = asArray(session['udp.dstport']).map(String);
        const clients = asArray(session['client']).map(String);
        const tlsVersions = asArray(session['crypto']).map(String); // Assuming crypto holds TLS version
        const ja3s = [...asArray(session['ja3']), ...asArray(session['ja4'])].map(String);
        const direction = String(firstOf(session['direction']) || '').toLowerCase();
        const isEncrypted = tlsVersions.length > 0 || services.some(s => ['https', 'tls', 'ssl', 'ssh', 'rdp'].includes(s.toLowerCase()));
        
        const iocs = asArray(session['ioc']).map(String);
        const bocs = asArray(session['boc']).map(String);
        const eocs = asArray(session['eoc']).map(String);

        const ciphers = asArray(session['crypto']).map(String);
        const usernames = asArray(session['user.all']).map(String);
        const domains = [...asArray(session['domain']), ...asArray(session['alias.host'])].map(String);
        const sslCas = asArray(session['ssl.ca']).map(String);
        const sslSubjects = asArray(session['ssl.subject']).map(String);
        const filetypes = [...asArray(session['filetype']), ...asArray(session['extension'])].map(String);
        const filenames = asArray(session['filename.all']).map(String);
        const actions = asArray(session['action']).map(String);
        const emails = asArray(session['email.all']).map(String);

        // Update Source (Client)
        if (srcAsset) {
          srcAsset.totalVolume += size;
          srcAsset.totalSessions += 1;
          
          iocs.forEach(val => srcAsset.indicators.push({ type: 'ioc', value: val, time }));
          bocs.forEach(val => srcAsset.indicators.push({ type: 'boc', value: val, time }));
          eocs.forEach(val => srcAsset.indicators.push({ type: 'eoc', value: val, time }));

          usernames.forEach(val => srcAsset.usernames.add(val));
          domains.forEach(val => srcAsset.domains.add(val));
          sslCas.forEach(val => srcAsset.sslCas.add(val));
          sslSubjects.forEach(val => srcAsset.sslSubjects.add(val));
          filetypes.forEach(val => srcAsset.filetypes.add(val));
          filenames.forEach(val => srcAsset.filenames.add(val));
          emails.forEach(val => srcAsset.emails.add(val));

          if (direction === 'outbound') srcAsset.outboundVolume += size;
          else if (direction === 'inbound') srcAsset.inboundVolume += size;
          else if (direction === 'lateral') srcAsset.lateralVolume += size;

          if (isEncrypted) srcAsset.encryptedVolume += size;
          else srcAsset.plaintextVolume += size;

          services.forEach(svc => {
            let s = srcAsset.clientServices.get(svc);
            if (!s) { s = { name: svc, ports: new Set(), sessions: 0, volume: 0, outboundVolume: 0, inboundVolume: 0, lateralVolume: 0 }; srcAsset.clientServices.set(svc, s); }
            s.sessions += 1;
            s.volume += size;
            if (direction === 'outbound') s.outboundVolume += size;
            else if (direction === 'inbound') s.inboundVolume += size;
            else if (direction === 'lateral') s.lateralVolume += size;
            tcpDstPorts.forEach(p => s.ports.add(p));
            udpDstPorts.forEach(p => s.ports.add(p));
          });

          clients.forEach(c => {
            let cl = srcAsset.clients.get(c);
            if (!cl) { cl = { name: c, sessions: 0, volume: 0 }; srcAsset.clients.set(c, cl); }
            cl.sessions += 1;
            cl.volume += size;
          });

          tcpDstPorts.forEach(p => srcAsset.tcpPorts.set(p, (srcAsset.tcpPorts.get(p) || 0) + 1));
          udpDstPorts.forEach(p => srcAsset.udpPorts.set(p, (srcAsset.udpPorts.get(p) || 0) + 1));
          tlsVersions.forEach(v => srcAsset.tlsVersions.set(v, (srcAsset.tlsVersions.get(v) || 0) + 1));
          ja3s.forEach(j => srcAsset.ja3Fingerprints.set(j, (srcAsset.ja3Fingerprints.get(j) || 0) + 1));
          ciphers.forEach(c => srcAsset.ciphers.set(c, (srcAsset.ciphers.get(c) || 0) + 1));
          actions.forEach(a => srcAsset.actions.set(a, (srcAsset.actions.get(a) || 0) + 1));


          let peer = srcAsset.peers.get(dstId);
          if (!peer) { 
            peer = { 
              ip: dstId, 
              volume: 0, 
              sessions: 0, 
              firstSeen: time,
              inboundVolume: 0,
              outboundVolume: 0,
              country: dstAsset?.node?.country || (typeof link.target !== 'string' ? link.target.country : undefined)
            }; 
            srcAsset.peers.set(dstId, peer); 
          }
          peer.volume += size;
          peer.sessions += 1;
          peer.outboundVolume += size; // src -> dst is outbound for src
          if (time > 0 && (peer.firstSeen === 0 || time < peer.firstSeen)) peer.firstSeen = time;

          if (time > 0) {
            // Bucket by hour
            const hour = Math.floor(time / 3600) * 3600;
            srcAsset.timeSeries.set(hour, (srcAsset.timeSeries.get(hour) || 0) + size);
          }
        }

        // Update Destination (Server)
        if (dstAsset) {
          dstAsset.totalVolume += size;
          dstAsset.totalSessions += 1;

          iocs.forEach(val => dstAsset.indicators.push({ type: 'ioc', value: val, time }));
          bocs.forEach(val => dstAsset.indicators.push({ type: 'boc', value: val, time }));
          eocs.forEach(val => dstAsset.indicators.push({ type: 'eoc', value: val, time }));

          usernames.forEach(val => dstAsset.usernames.add(val));
          domains.forEach(val => dstAsset.domains.add(val));
          sslCas.forEach(val => dstAsset.sslCas.add(val));
          sslSubjects.forEach(val => dstAsset.sslSubjects.add(val));
          filetypes.forEach(val => dstAsset.filetypes.add(val));
          filenames.forEach(val => dstAsset.filenames.add(val));
          emails.forEach(val => dstAsset.emails.add(val));

          if (direction === 'outbound') dstAsset.outboundVolume += size;
          else if (direction === 'inbound') dstAsset.inboundVolume += size;
          else if (direction === 'lateral') dstAsset.lateralVolume += size;

          if (isEncrypted) dstAsset.encryptedVolume += size;
          else dstAsset.plaintextVolume += size;

          services.forEach(svc => {
            let s = dstAsset.serverServices.get(svc);
            if (!s) { s = { name: svc, ports: new Set(), sessions: 0, volume: 0, outboundVolume: 0, inboundVolume: 0, lateralVolume: 0 }; dstAsset.serverServices.set(svc, s); }
            s.sessions += 1;
            s.volume += size;
            if (direction === 'outbound') s.outboundVolume += size;
            else if (direction === 'inbound') s.inboundVolume += size;
            else if (direction === 'lateral') s.lateralVolume += size;
            tcpDstPorts.forEach(p => s.ports.add(p));
            udpDstPorts.forEach(p => s.ports.add(p));
          });

          clients.forEach(c => {
            let cl = dstAsset.clients.get(c);
            if (!cl) { cl = { name: c, sessions: 0, volume: 0 }; dstAsset.clients.set(c, cl); }
            cl.sessions += 1;
            cl.volume += size;
          });

          tcpDstPorts.forEach(p => dstAsset.tcpPorts.set(p, (dstAsset.tcpPorts.get(p) || 0) + 1));
          udpDstPorts.forEach(p => dstAsset.udpPorts.set(p, (dstAsset.udpPorts.get(p) || 0) + 1));
          tlsVersions.forEach(v => dstAsset.tlsVersions.set(v, (dstAsset.tlsVersions.get(v) || 0) + 1));
          ja3s.forEach(j => dstAsset.ja3Fingerprints.set(j, (dstAsset.ja3Fingerprints.get(j) || 0) + 1));
          ciphers.forEach(c => dstAsset.ciphers.set(c, (dstAsset.ciphers.get(c) || 0) + 1));
          actions.forEach(a => dstAsset.actions.set(a, (dstAsset.actions.get(a) || 0) + 1));

          let peer = dstAsset.peers.get(srcId);
          if (!peer) { 
            peer = { 
              ip: srcId, 
              volume: 0, 
              sessions: 0, 
              firstSeen: time,
              inboundVolume: 0,
              outboundVolume: 0,
              country: srcAsset?.node?.country || (typeof link.source !== 'string' ? link.source.country : undefined)
            }; 
            dstAsset.peers.set(srcId, peer); 
          }
          peer.volume += size;
          peer.sessions += 1;
          peer.inboundVolume += size; // src -> dst is inbound for dst
          if (time > 0 && (peer.firstSeen === 0 || time < peer.firstSeen)) peer.firstSeen = time;

          if (time > 0) {
            const hour = Math.floor(time / 3600) * 3600;
            dstAsset.timeSeries.set(hour, (dstAsset.timeSeries.get(hour) || 0) + size);
          }
        }
      });
    });

    assets.forEach(asset => {
      const isServer = hasServer.has(asset.ip);
      const isClient = hasClient.has(asset.ip);
      if (isServer && isClient) asset.role = 'mixed';
      else if (isServer) asset.role = 'server';
      else if (isClient) asset.role = 'client';
    });

    return Array.from(assets.values());
  }, [data]);
}
