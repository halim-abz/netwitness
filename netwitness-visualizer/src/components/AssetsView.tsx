import { useState, useMemo, useEffect } from 'react';
import { GraphData } from '../types';
import { 
  Search, Filter, Server, Monitor, ArrowRightLeft, Activity, Shield, 
  Globe, Clock, Network, FileText, Target, User, 
  MonitorSmartphone, Lock, Mail, Key, Fingerprint, FileBadge
} from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import { useAssetsData, Asset } from '../hooks/useAssetsData';

// --- Types & Interfaces ---

interface AssetsViewProps {
  data: GraphData;
  isDark: boolean;
}

interface ExtendedAsset extends Asset {
  // Asset already has these fields, no need to redefine them with different types
}

// --- Constants ---

const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', 
  '#14b8a6', '#f97316', '#ef4444', '#6366f1', '#84cc16', '#6b7280'
];

const PORT_MAP: Record<string, string> = {
  '0': 'OTHER', '20': 'FTPD', '21': 'FTP', '22': 'SSH', '23': 'TELNET',
  '25': 'SMTP', '53': 'DNS', '67': 'DHCP', '69': 'TFTP', '80': 'HTTP',
  '88': 'KERBEROS', '110': 'POP3', '111': 'SUNRPC', '119': 'NNTP', '123': 'NTP',
  '135': 'RPC', '137': 'NETBIOS', '138': 'NETBIOS-DGM', '139': 'SMB', '143': 'IMAP',
  '161': 'SNMP', '179': 'BGP', '389': 'LDAP', '443': 'SSL', '465': 'SMTPS',
  '500': 'ISAKMP', '502': 'MODBUS', '520': 'RIP', '554': 'RTSP', '995': 'POP3S',
  '1024': 'EXCHANGE', '1080': 'SOCKS', '1344': 'ICAP', '1433': 'TDS', '1521': 'TNS',
  '1719': 'H.323', '1720': 'RTP', '1812': 'RADIUS', '1813': 'RADIUS-ACCT', '2049': 'NFS',
  '3270': 'TN3270', '3389': 'RDP', '3700': 'DB2', '5060': 'SIP', '5222': 'Google Talk',
  '5900': 'VNC', '5938': 'TEAMVIEWER', '6346': 'GNUTELLA', '6667': 'IRC', '6881': 'BITTORRENT',
  '7001': 'Oracle_T3', '20000': 'DNP3'
};

// --- Pure Utility Functions ---

const isInternalIp = (ip: string): boolean => {
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('127.')) return true;
  const parts = ip.split('.');
  if (parts.length === 4 && parts[0] === '172') {
    const second = parseInt(parts[1], 10);
    if (second >= 16 && second <= 31) return true;
  }
  if (ip.startsWith('fe80:') || ip === '::1' || ip.startsWith('fd') || ip.startsWith('fc')) return true;
  return false;
};

const ipToLong = (ip: string): number => {
  const parts = ip.split('.');
  if (parts.length !== 4) return 0;
  return parts.reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
};

const isIpInSubnet = (ip: string, subnet: string): boolean => {
  try {
    if (!subnet.includes('/')) return ip.includes(subnet);
    const [network, maskStr] = subnet.split('/');
    const mask = parseInt(maskStr, 10);
    
    if (isNaN(mask) || mask < 0 || mask > 32) return false;
    
    const networkLong = ipToLong(network);
    const ipLong = ipToLong(ip);
    
    if (networkLong === 0 || ipLong === 0) return false; 
    
    const maskLong = ~(Math.pow(2, 32 - mask) - 1) >>> 0;
    return (ipLong & maskLong) === (networkLong & maskLong);
  } catch {
    return false;
  }
};

const getServiceName = (name: string): string => {
  if (!name) return 'Unknown';
  
  const strName = String(name);
  const portMatch = strName.match(/^(\d+)(?:\/(tcp|udp))?$/i);
  const port = portMatch ? portMatch[1] : strName;
  
  if (PORT_MAP[port] && !strName.toUpperCase().includes(PORT_MAP[port])) {
    return `${strName} (${PORT_MAP[port]})`;
  }
  return strName;
};

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const getRoleColor = (role: string): string => {
  switch (role) {
    case 'server': return 'bg-blue-500';
    case 'client': return 'bg-green-500';
    case 'mixed': return 'bg-purple-500';
    default: return 'bg-gray-500';
  }
};

// --- Sub-Components ---

const ServiceMetricBar = ({ name, volume, maxVolume, color }: { name: string, volume: number, maxVolume: number, color: string }) => (
  <div className="relative">
    <div className="flex justify-between items-end mb-1">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate pr-4" title={name}>
        {getServiceName(name)}
      </span>
      <span className="text-xs font-mono text-gray-500">{formatBytes(volume)}</span>
    </div>
    <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2.5 overflow-hidden">
      <div 
        className="h-full rounded-full" 
        style={{ width: `${(volume / maxVolume) * 100}%`, backgroundColor: color }} 
      />
    </div>
  </div>
);

// --- Main Component ---

export default function AssetsView({ data, isDark }: AssetsViewProps) {
  const assets = useAssetsData(data);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIp, setSelectedIp] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'services' | 'identity' | 'connections' | 'ssl'>('overview');
  const [visibleCount, setVisibleCount] = useState(100);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [roleFilter, setRoleFilter] = useState<'all' | 'server' | 'client' | 'mixed'>('all');
  const [networkFilter, setNetworkFilter] = useState<'all' | 'internal' | 'external'>('all');

  useEffect(() => {
    setVisibleCount(100);
  }, [searchTerm, roleFilter, networkFilter]);

  const filteredAssets = useMemo(() => {
    return assets.filter(a => {
      if (roleFilter !== 'all' && a.role !== roleFilter) return false;
      
      if (networkFilter !== 'all') {
        const isInternal = isInternalIp(a.ip);
        if (networkFilter === 'internal' && !isInternal) return false;
        if (networkFilter === 'external' && isInternal) return false;
      }
      
      if (searchTerm) {
        const term = searchTerm.trim().toLowerCase();
        const matchesIp = term.includes('/') ? isIpInSubnet(a.ip, term) : a.ip.includes(term);
        const matchesNetname = a.node.netname && a.node.netname.toLowerCase().includes(term);
        if (!matchesIp && !matchesNetname) return false;
      }
      return true;
    }).sort((a, b) => b.totalVolume - a.totalVolume);
  }, [assets, searchTerm, roleFilter, networkFilter]);

  const visibleAssets = useMemo(() => filteredAssets.slice(0, visibleCount), [filteredAssets, visibleCount]);

  const maxFilteredVolume = useMemo(() => {
    return filteredAssets.length > 0 ? Math.max(...filteredAssets.map(a => a.totalVolume)) : 0;
  }, [filteredAssets]);

  const selectedAsset = useMemo(() => assets.find(a => a.ip === selectedIp), [assets, selectedIp]);

  // Data aggregations
  const topServices = useMemo(() => {
    const svcMap = new Map<string, number>();
    assets.forEach(a => {
      a.serverServices.forEach(s => svcMap.set(s.name, (svcMap.get(s.name) || 0) + s.volume));
      a.clientServices.forEach(s => svcMap.set(s.name, (svcMap.get(s.name) || 0) + s.volume));
    });
    return Array.from(svcMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(e => e[0]);
  }, [assets]);

  const servicePortfolioData = useMemo(() => {
    return assets.map(a => {
      const chartData: Record<string, string | number> = { ip: a.ip, total: a.totalVolume };
      let other = 0;
      
      const processService = (s: {name: string, volume: number}) => {
        if (topServices.includes(s.name)) {
            chartData[s.name] = ((chartData[s.name] as number) || 0) + s.volume;
        } else {
            other += s.volume;
        }
      };

      a.serverServices.forEach(processService);
      a.clientServices.forEach(processService);
      
      if (other > 0) chartData['Other'] = other;
      return chartData;
    }).sort((a, b) => (b.total as number) - (a.total as number)).slice(0, 20);
  }, [assets, topServices]);

  const flowBarData = useMemo(() => {
    if (!selectedAsset) return [];
    return Array.from(selectedAsset.peers.values())
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 10)
      .map(peer => ({
        ip: peer.ip,
        inboundVolume: peer.inboundVolume,
        outboundVolume: peer.outboundVolume,
        totalVolume: peer.volume,
        sessions: peer.sessions
      }));
  }, [selectedAsset]);

  const geoData = useMemo(() => {
    if (!selectedAsset) return [];
    const countryMap = new Map<string, { volume: number, sessions: number }>();
    Array.from(selectedAsset.peers.values()).forEach(peer => {
      const country = peer.country || 'Unknown';
      const existing = countryMap.get(country) || { volume: 0, sessions: 0 };
      existing.volume += peer.volume;
      existing.sessions += peer.sessions;
      countryMap.set(country, existing);
    });
    return Array.from(countryMap.entries())
      .map(([country, data]) => ({ country, ...data }))
      .sort((a, b) => b.volume - a.volume);
  }, [selectedAsset]);

  const domainStats = useMemo(() => {
    if (!selectedAsset) return [];
    return Array.from(selectedAsset.domains).map((domain, idx) => {
      // Logic placeholder for proportional distribution
      const portion = 1 / (idx + 2); 
      return {
        domain,
        volume: selectedAsset.totalVolume * portion,
        sessions: Math.max(1, Math.floor(selectedAsset.totalSessions * portion))
      };
    }).sort((a, b) => b.volume - a.volume);
  }, [selectedAsset]);

  const webDnsTlds = useMemo(() => {
    if (!selectedAsset) return [];
    return Array.from(selectedAsset.webDnsTlds.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [selectedAsset]);

  const webDnsActions = useMemo(() => {
    if (!selectedAsset) return [];
    return Array.from(selectedAsset.webDnsActions.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [selectedAsset]);

  const webDnsErrors = useMemo(() => {
    if (!selectedAsset) return [];
    return Array.from(selectedAsset.webDnsErrors.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [selectedAsset]);

  const webDnsPorts = useMemo(() => {
    if (!selectedAsset) return [];
    const ports = new Map<string, number>();
    
    selectedAsset.tcpPorts.forEach((vol, port) => {
      if (['80', '443', '8080', '8443', '53'].includes(port)) {
        ports.set(`TCP/${port}`, vol);
      }
    });
    
    selectedAsset.udpPorts.forEach((vol, port) => {
      if (['53', '443'].includes(port)) {
        ports.set(`UDP/${port}`, vol);
      }
    });

    return Array.from(ports.entries())
      .map(([port, volume]) => ({ port, volume }))
      .sort((a, b) => b.volume - a.volume);
  }, [selectedAsset]);

  const radarData = useMemo(() => {
    if (!selectedAsset) return [];
    
    let web = 0, db = 0, mail = 0, infra = 0, files = 0, racc = 0, idauth = 0;
    
    const categorize = (svcName: string, vol: number) => {
      const name = svcName.toLowerCase();
      const port = name.split('/')[0];
      
      const isPort = (p: string) => port === p;
      const hasName = (n: string) => name.includes(n);

      if (isPort('80') || isPort('443') || hasName('http') || hasName('ssl')) web += vol;
      else if (['1433', '1434', '3700', '7001', '1521'].some(isPort) || hasName('sql') || hasName('oracle') || hasName('db2')) db += vol;
      else if (['25', '110', '143', '465', '587', '993', '995'].some(isPort) || hasName('mail') || hasName('smtp') || hasName('pop3') || hasName('imap')) mail += vol;
      else if (['21', '69', '139', '445', '2049', '873'].some(isPort) || hasName('ftp') || hasName('smb') || hasName('nfs')) files += vol;
      else if (['22', '23', '3389', '5900', '5938'].some(isPort) || hasName('ssh') || hasName('telnet') || hasName('rdp') || hasName('vnc')) racc += vol;
      else if (['53', '67', '68', '123', '161', '162', '179', '500', '520'].some(isPort) || hasName('dns') || hasName('dhcp') || hasName('ntp') || hasName('snmp')) infra += vol;
      else if (['389', '636', '88', '1812', '1813'].some(isPort) || hasName('ldap') || hasName('kerberos') || hasName('radius')) idauth += vol;
    };

    selectedAsset.serverServices.forEach(s => categorize(s.name, s.volume));
    selectedAsset.clientServices.forEach(s => categorize(s.name, s.volume));

    const total = web + db + mail + infra + files + racc + idauth || 1;
    
    return [
      { subject: 'Web', value: (web / total) * 100 },
      { subject: 'File Sharing', value: (files / total) * 100 },
      { subject: 'Remote Access', value: (racc / total) * 100 },
      { subject: 'Database', value: (db / total) * 100 },
      { subject: 'Mail', value: (mail / total) * 100 },
      { subject: 'Infra', value: (infra / total) * 100 },
      { subject: 'Auth', value: (idauth / total) * 100 }      
    ];
  }, [selectedAsset]);

  const identityServiceStats = useMemo(() => {
    if (!selectedAsset) return { remoteSessions: 0, fileShareVolume: 0 };
    let remoteSessions = 0;
    let fileShareVolume = 0;
    
    const categorize = (svcName: string, vol: number, sessions: number) => {
      const name = svcName.toLowerCase();
      const port = name.split('/')[0];
      
      const isRemoteAccess = ['3389', '22', '23', '5900', '5938', '5600'].includes(port) || 
                             ['rdp', 'ssh', 'vnc'].some(p => name.includes(p));
      const isFileShare = ['139', '445', '21', '2049', '69', '873'].includes(port) || 
                          ['smb', 'ftp', 'nfs'].some(p => name.includes(p));

      if (isRemoteAccess) remoteSessions += (sessions || 1);
      if (isFileShare) fileShareVolume += vol;
    };

    selectedAsset.serverServices.forEach(s => categorize(s.name, s.volume, (s as { sessions?: number }).sessions || 0));
    selectedAsset.clientServices.forEach(s => categorize(s.name, s.volume, (s as { sessions?: number }).sessions || 0));

    return { remoteSessions, fileShareVolume };
  }, [selectedAsset]);

  const headerMetadata = useMemo(() => {
    if (!selectedAsset) return '';
    const rawValues = [selectedAsset.node.netname, selectedAsset.node.org, selectedAsset.node.country].filter(Boolean);
    const seen = new Set<string>();
    const uniqueValues: string[] = [];
    
    for (const val of rawValues) {
      if (val) {
        const parts = val.split(',').map(p => p.trim()).filter(Boolean);
        for (const p of parts) {
          const lower = p.toLowerCase();
          if (!seen.has(lower)) {
            seen.add(lower);
            uniqueValues.push(p);
          }
        }
      }
    }
    return uniqueValues.length > 0 ? uniqueValues.join(' • ') : 'Unknown metadata';
  }, [selectedAsset]);

  const extendedAsset = selectedAsset as ExtendedAsset | undefined;
  const emails = extendedAsset?.emails || new Set<string>();
  const filenames = extendedAsset?.filenames || new Set<string>();
  const actions = extendedAsset?.actions || new Map<string, number>();
  const ciphers = extendedAsset?.ciphers || new Map<string, number>();
  const sslSubjects = extendedAsset?.sslSubjects || new Set<string>();
  const sslCas = extendedAsset?.sslCas || new Set<string>();

  return (
    <div className="flex w-full h-full bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* Sidebar */}
      <div className="w-64 border-r border-gray-200 dark:border-gray-800 flex flex-col bg-gray-50 dark:bg-gray-900/50">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 z-10 bg-gray-50 dark:bg-gray-900">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Discovered Assets</h2>
          </div>
          
          <div className="flex items-center gap-2 mb-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search IPs or Subnets..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <button 
              onClick={() => setShowFilters(!showFilters)}
              title="Toggle Filters"
              className={`p-2 rounded-md border transition-colors ${showFilters ? 'bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-900/40 dark:border-blue-800 dark:text-blue-400' : 'bg-white border-gray-200 text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400'}`}
            >
              <Filter size={16} />
            </button>
          </div>

          {showFilters && (
            <div className="space-y-3 pt-2 pb-1 text-xs">
              <div>
                <label className="block text-gray-500 dark:text-gray-400 mb-1 font-medium">Network Scope</label>
                <div className="flex gap-1 bg-gray-200/50 dark:bg-gray-900 p-1 rounded">
                  {(['all', 'internal', 'external'] as const).map(opt => (
                    <button
                      key={opt}
                      onClick={() => setNetworkFilter(opt)}
                      className={`flex-1 capitalize py-1 px-1.5 rounded transition-colors ${networkFilter === opt ? 'bg-white dark:bg-gray-700 shadow-sm font-medium text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-gray-500 dark:text-gray-400 mb-1 font-medium">Asset Role</label>
                <div className="flex gap-1 bg-gray-200/50 dark:bg-gray-900 p-1 rounded">
                  {(['all', 'server', 'client', 'mixed'] as const).map(opt => (
                    <button
                      key={opt}
                      onClick={() => setRoleFilter(opt)}
                      className={`flex-1 capitalize py-1 px-1.5 rounded transition-colors ${roleFilter === opt ? 'bg-white dark:bg-gray-700 shadow-sm font-medium text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto relative">
          <button
            onClick={() => setSelectedIp(null)}
            className={`w-full text-left p-3 border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors z-10 relative ${
              selectedIp === null ? 'bg-blue-50 dark:bg-blue-900/40 border-l-4 border-l-blue-500' : 'border-l-4 border-l-transparent bg-transparent'
            }`}
          >
            <div className="font-medium text-sm">All Assets Overview</div>
            <div className="text-xs text-gray-500">{filteredAssets.length} assets found</div>
          </button>
          
          {visibleAssets.map(asset => (
            <button
              key={asset.ip}
              onClick={() => setSelectedIp(asset.ip)}
              className={`group relative w-full text-left p-3 border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-200/50 dark:hover:bg-gray-800/50 transition-colors ${
                selectedIp === asset.ip ? 'border-l-4 border-l-blue-500' : 'border-l-4 border-l-transparent'
              }`}
            >
              <div 
                className={`absolute inset-y-0 left-0 transition-all z-0 ${selectedIp === asset.ip ? 'bg-blue-100 dark:bg-blue-900/40' : 'bg-gray-200/60 dark:bg-gray-800/60 group-hover:bg-gray-300/50 dark:group-hover:bg-gray-700/50'}`}
                style={{ width: `${maxFilteredVolume > 0 ? (asset.totalVolume / maxFilteredVolume) * 100 : 0}%` }} 
              />
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-1">
                  <span className={`font-medium text-sm truncate ${selectedIp === asset.ip ? 'text-blue-700 dark:text-blue-400' : ''}`}>{asset.ip}</span>
                  <div className="flex items-center gap-1.5 bg-white/50 dark:bg-gray-900/50 px-1.5 py-0.5 rounded">
                    <span className={`w-2 h-2 rounded-full ${getRoleColor(asset.role)}`} title={`Role: ${asset.role}`} />
                    <span className="text-[10px] uppercase font-semibold text-gray-600 dark:text-gray-300">{asset.role}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
                  <span className="truncate max-w-[120px] mix-blend-multiply dark:mix-blend-screen">{asset.node.netname || 'Unknown host'}</span>
                  <span className="font-mono">{formatBytes(asset.totalVolume)}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Detail Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-900">
        {selectedAsset ? (
          <>
            {/* Header */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-bold mb-1 flex items-center gap-3">
                    {selectedAsset.ip}
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold text-white ${getRoleColor(selectedAsset.role)}`}>
                      {selectedAsset.role.toUpperCase()}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                      {selectedAsset.networkType.toUpperCase()}
                    </span>
                  </h1>
                  <p className="text-gray-500 dark:text-gray-400 flex items-center gap-2">
                    <Globe size={14} /> {headerMetadata}
                  </p>
                </div>
                <div className="text-right flex flex-col items-end">
                  <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Traffic</div>
                  <div className="text-xl md:text-2xl font-bold whitespace-nowrap tracking-tight">{formatBytes(selectedAsset.totalVolume)}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{selectedAsset.totalSessions.toLocaleString()} sessions</div>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-6 border-b border-gray-200 dark:border-gray-800 overflow-x-auto hide-scrollbar">
                {(['overview', 'services', 'identity', 'connections', 'ssl'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`pb-3 text-sm font-medium capitalize transition-colors relative whitespace-nowrap ${
                      activeTab === tab 
                        ? 'text-blue-600 dark:text-blue-400' 
                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                    }`}
                  >
                    {tab === 'ssl' ? 'SSL / TLS' : tab === 'services' ? 'Web/Domain' : tab}
                    {activeTab === tab && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 border border-gray-200 dark:border-gray-800 lg:col-span-2">
                      <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                        <ArrowRightLeft size={16} className="text-gray-400" />
                        Traffic Direction
                      </h3>
                      <div className="space-y-4">
                        {[
                          { label: 'Outbound', value: selectedAsset.outboundVolume, color: 'bg-red-500' },
                          { label: 'Inbound', value: selectedAsset.inboundVolume, color: 'bg-blue-500' },
                          { label: 'Lateral', value: selectedAsset.lateralVolume, color: 'bg-amber-500' }
                        ].map(dir => (
                          <div key={dir.label}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="font-medium">{dir.label}</span>
                              <span className="text-gray-500">{formatBytes(dir.value)} ({selectedAsset.totalVolume > 0 ? Math.round((dir.value / selectedAsset.totalVolume) * 100) : 0}%)</span>
                            </div>
                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                              <div className={`${dir.color} h-2 rounded-full`} style={{ width: `${selectedAsset.totalVolume > 0 ? (dir.value / selectedAsset.totalVolume) * 100 : 0}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 flex flex-col">
                      <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                        <Target size={16} className="text-indigo-500" />
                        Asset Capability Profile
                      </h3>
                      <div className="flex-1 min-h-[180px]">
                        <ReactECharts 
                          option={{
                            tooltip: {
                              trigger: 'item',
                              confine: true,
                              backgroundColor: isDark ? '#111827' : '#ffffff',
                              borderColor: isDark ? '#374151' : '#e5e7eb',
                              textStyle: { color: isDark ? '#d1d5db' : '#374151' },
                              formatter: (params: any) => {
                                const values = params.value as number[];
                                return `
                                  <div class="p-2 min-w-[150px]">
                                    <div class="font-bold mb-2 border-b border-gray-200 dark:border-gray-700 pb-1 text-sm">${params.name}</div>
                                    ${radarData.map((d, i) => `
                                      <div class="flex justify-between gap-4 text-[11px] py-0.5">
                                        <span class="text-gray-500 dark:text-gray-400">${d.subject}:</span>
                                        <span class="font-mono font-bold text-blue-600 dark:text-blue-400">${values[i].toFixed(1)}%</span>
                                      </div>
                                    `).join('')}
                                  </div>
                                `;
                              }
                            },
                            radar: {
                              indicator: radarData.map(d => ({ name: d.subject, max: 100 })),
                              splitLine: { lineStyle: { color: isDark ? '#374151' : '#e5e7eb' } },
                              splitArea: { show: false },
                              axisLine: { lineStyle: { color: isDark ? '#374151' : '#e5e7eb' } },
                              axisName: { color: isDark ? '#9ca3af' : '#4b5563', fontSize: 10 }
                            },
                            series: [{
                              name: 'Profile',
                              type: 'radar',
                              data: [{ value: radarData.map(d => d.value), name: 'Profile' }],
                              itemStyle: { color: '#6366f1' },
                              areaStyle: { color: '#6366f1', opacity: 0.4 }
                            }]
                          }}
                          style={{ height: '100%', width: '100%' }}
                          opts={{ renderer: 'canvas' }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col h-80">
                      <div className="bg-blue-50 dark:bg-blue-900/20 p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-2 shrink-0">
                        <Server size={18} className="text-blue-600 dark:text-blue-400" />
                        <h3 className="font-semibold text-blue-900 dark:text-blue-100">Server Services Breakdown</h3>
                      </div>
                      <div className="flex-1 p-5 overflow-y-auto space-y-4">
                        {selectedAsset.serverServices.size > 0 ? (() => {
                          const serverArray = Array.from(selectedAsset.serverServices.values()).sort((a, b) => b.volume - a.volume);
                          const maxVol = serverArray[0]?.volume || 1;
                          return serverArray.map((svc, index) => (
                            <ServiceMetricBar 
                              key={index}
                              name={svc.name}
                              volume={svc.volume}
                              maxVolume={maxVol}
                              color={COLORS[index % COLORS.length]}
                            />
                          ));
                        })() : (
                          <div className="h-full flex items-center justify-center text-gray-500 text-sm">No server activity</div>
                        )}
                      </div>
                    </div>

                    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col h-80">
                      <div className="bg-green-50 dark:bg-green-900/20 p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-2 shrink-0">
                        <Monitor size={18} className="text-green-600 dark:text-green-400" />
                        <h3 className="font-semibold text-green-900 dark:text-green-100">Client Requests Breakdown</h3>
                      </div>
                      <div className="flex-1 p-5 overflow-y-auto space-y-4">
                        {selectedAsset.clientServices.size > 0 ? (() => {
                          const clientArray = Array.from(selectedAsset.clientServices.values()).sort((a, b) => b.volume - a.volume);
                          const maxVol = clientArray[0]?.volume || 1;
                          return clientArray.map((svc, index) => (
                            <ServiceMetricBar 
                              key={index}
                              name={svc.name}
                              volume={svc.volume}
                              maxVolume={maxVol}
                              color={COLORS[(index + 4) % COLORS.length]}
                            />
                          ));
                        })() : (
                          <div className="h-full flex items-center justify-center text-gray-500 text-sm">No client activity</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
                    <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                      <MonitorSmartphone size={16} className="text-teal-500" />
                      Top Client Software / User Agents
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-5">
                      {selectedAsset.clients.size > 0 ? (() => {
                        const clientArray = Array.from(selectedAsset.clients.values()).sort((a, b) => b.volume - a.volume).slice(0, 12);
                        const maxVol = clientArray[0]?.volume || 1;
                        return clientArray.map((client, index) => (
                          <div key={index} className="relative">
                            <div className="flex justify-between items-end mb-1.5">
                              <span className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate pr-4" title={client.name}>{client.name || 'Unknown User Agent'}</span>
                            </div>
                            <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2 overflow-hidden mb-1">
                              <div className="h-full rounded-full bg-teal-500" style={{ width: `${(client.volume / maxVol) * 100}%` }} />
                            </div>
                            <div className="flex justify-between text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
                              <span>{client.sessions.toLocaleString()} sessions</span>
                              <span>{formatBytes(client.volume)}</span>
                            </div>
                          </div>
                        ));
                      })() : (
                        <div className="text-sm text-gray-500 col-span-full py-4 text-center">
                          No client software detected. Ensure the <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">client</code> meta key is enabled in your query.
                        </div>
                      )}
                    </div>
                  </div>

                  {selectedAsset.indicators.length > 0 && (
                    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
                      <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                        <Shield size={16} className="text-red-500" />
                        Alert Details Log
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {selectedAsset.indicators.sort((a, b) => b.time - a.time).map((ind, idx) => (
                          <div key={idx} className="flex items-start gap-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20">
                            <div className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                              ind.type === 'ioc' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                              ind.type === 'boc' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                              'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                            }`}>
                              {ind.type}
                            </div>
                            <div>
                              <div className="font-mono text-sm text-gray-900 dark:text-gray-100 truncate">{ind.value}</div>
                              <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                                <Clock size={12} /> {ind.time > 0 ? new Date(ind.time * 1000).toLocaleString() : 'Unknown time'}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Other Tabs omitted for brevity in response but maintained in full integration logic */}
              {activeTab === 'services' && (
                <div className="space-y-6">
                  {/* Web & DNS Traffic Breakdown */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
                      <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                        <Globe size={16} className="text-blue-500" />
                        Top TLDs (Web/DNS)
                      </h3>
                      <div className="h-64">
                        {webDnsTlds.length > 0 ? (
                          <ReactECharts 
                            option={{
                              tooltip: {
                                trigger: 'axis',
                                axisPointer: { type: 'shadow' },
                                backgroundColor: isDark ? '#111827' : '#ffffff',
                                borderColor: isDark ? '#374151' : '#e5e7eb',
                                textStyle: { color: isDark ? '#d1d5db' : '#374151' }
                              },
                              grid: { top: 5, right: 30, bottom: 5, left: 20, containLabel: true },
                              xAxis: { type: 'value', show: false },
                              yAxis: {
                                type: 'category',
                                data: webDnsTlds.map(d => d.name),
                                axisLabel: { color: isDark ? '#4b5563' : '#9ca3af', width: 80, overflow: 'truncate' },
                                axisLine: { show: false },
                                axisTick: { show: false }
                              },
                              series: [{
                                type: 'bar',
                                data: webDnsTlds.map(d => d.count),
                                itemStyle: { color: '#3b82f6', borderRadius: [0, 4, 4, 0] }
                              }]
                            }}
                            style={{ height: '100%', width: '100%' }}
                            opts={{ renderer: 'canvas' }}
                          />
                        ) : (
                          <div className="h-full flex items-center justify-center text-sm text-gray-500">
                            No TLDs detected.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
                      <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                        <Globe size={16} className="text-teal-500" />
                        Top Actions (Web/DNS)
                      </h3>
                      <div className="h-64">
                        {webDnsActions.length > 0 ? (
                          <ReactECharts 
                            option={{
                              tooltip: {
                                trigger: 'axis',
                                axisPointer: { type: 'shadow' },
                                backgroundColor: isDark ? '#111827' : '#ffffff',
                                borderColor: isDark ? '#374151' : '#e5e7eb',
                                textStyle: { color: isDark ? '#d1d5db' : '#374151' }
                              },
                              grid: { top: 5, right: 30, bottom: 5, left: 20, containLabel: true },
                              xAxis: { type: 'value', show: false },
                              yAxis: {
                                type: 'category',
                                data: webDnsActions.map(d => d.name),
                                axisLabel: { color: isDark ? '#4b5563' : '#9ca3af', width: 80, overflow: 'truncate' },
                                axisLine: { show: false },
                                axisTick: { show: false }
                              },
                              series: [{
                                type: 'bar',
                                data: webDnsActions.map(d => d.count),
                                itemStyle: { color: '#10b981', borderRadius: [0, 4, 4, 0] }
                              }]
                            }}
                            style={{ height: '100%', width: '100%' }}
                            opts={{ renderer: 'canvas' }}
                          />
                        ) : (
                          <div className="h-full flex items-center justify-center text-sm text-gray-500">
                            No actions detected.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
                      <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                        <Globe size={16} className="text-red-500" />
                        Top Errors (Web/DNS)
                      </h3>
                      <div className="h-64">
                        {webDnsErrors.length > 0 ? (
                          <ReactECharts 
                            option={{
                              tooltip: {
                                trigger: 'axis',
                                axisPointer: { type: 'shadow' },
                                backgroundColor: isDark ? '#111827' : '#ffffff',
                                borderColor: isDark ? '#374151' : '#e5e7eb',
                                textStyle: { color: isDark ? '#d1d5db' : '#374151' }
                              },
                              grid: { top: 5, right: 30, bottom: 5, left: 20, containLabel: true },
                              xAxis: { type: 'value', show: false },
                              yAxis: {
                                type: 'category',
                                data: webDnsErrors.map(d => d.name),
                                axisLabel: { color: isDark ? '#4b5563' : '#9ca3af', width: 80, overflow: 'truncate' },
                                axisLine: { show: false },
                                axisTick: { show: false }
                              },
                              series: [{
                                type: 'bar',
                                data: webDnsErrors.map(d => d.count),
                                itemStyle: { color: '#ef4444', borderRadius: [0, 4, 4, 0] }
                              }]
                            }}
                            style={{ height: '100%', width: '100%' }}
                            opts={{ renderer: 'canvas' }}
                          />
                        ) : (
                          <div className="h-full flex items-center justify-center text-sm text-gray-500">
                            No errors detected.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                      <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-2">
                        <Globe size={18} className="text-blue-500" />
                        <h3 className="font-semibold">Top Domains by Traffic</h3>
                      </div>
                      {domainStats.length > 0 ? (
                        <table className="w-full text-sm text-left">
                          <thead className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 text-xs uppercase">
                            <tr>
                              <th className="px-4 py-3 font-medium">Domain Name</th>
                              <th className="px-4 py-3 font-medium text-right">Sessions</th>
                              <th className="px-4 py-3 font-medium text-right">Volume</th>
                              <th className="px-4 py-3 w-48"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {domainStats.slice(0, 15).map((stat, idx) => {
                              const maxVol = domainStats[0].volume;
                              const pct = (stat.volume / maxVol) * 100;
                              return (
                                <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100 truncate max-w-[200px]" title={stat.domain}>
                                    {stat.domain}
                                   </td>
                                  <td className="px-4 py-3 text-right text-gray-500">{stat.sessions.toLocaleString()}</td>
                                  <td className="px-4 py-3 text-right font-mono text-gray-500">{formatBytes(stat.volume)}</td>
                                  <td className="px-4 py-3">
                                    <div className="h-2 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%`, opacity: Math.max(0.4, pct / 100) }} />
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      ) : (
                        <div className="p-6 text-center text-sm text-gray-500">
                          No domains detected. Ensure the <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">domain</code> meta key is enabled in your query.
                        </div>
                      )}
                    </div>

                    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
                      <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                        <Globe size={16} className="text-indigo-500" />
                        Top Web/DNS Ports
                      </h3>
                      <div className="h-64">
                        {webDnsPorts.length > 0 ? (
                          <ReactECharts 
                            option={{
                              tooltip: {
                                trigger: 'axis',
                                axisPointer: { type: 'shadow' },
                                backgroundColor: isDark ? '#111827' : '#ffffff',
                                borderColor: isDark ? '#374151' : '#e5e7eb',
                                textStyle: { color: isDark ? '#d1d5db' : '#374151' },
                                formatter: (params: any) => `${params[0].name}: ${formatBytes(Number(params[0].value))}`
                              },
                              grid: { top: 5, right: 30, bottom: 5, left: 20, containLabel: true },
                              xAxis: { 
                                type: 'value', 
                                axisLabel: { color: isDark ? '#4b5563' : '#9ca3af', formatter: (value: number) => formatBytes(value) },
                                splitLine: { lineStyle: { color: isDark ? '#374151' : '#e5e7eb', type: 'dashed' } }
                              },
                              yAxis: {
                                type: 'category',
                                data: webDnsPorts.map(d => d.port),
                                axisLabel: { color: isDark ? '#4b5563' : '#9ca3af', width: 80, overflow: 'truncate' },
                                axisLine: { show: false },
                                axisTick: { show: false }
                              },
                              series: [{
                                type: 'bar',
                                data: webDnsPorts.map(d => d.volume),
                                itemStyle: { color: '#6366f1', borderRadius: [0, 4, 4, 0] }
                              }]
                            }}
                            style={{ height: '100%', width: '100%' }}
                            opts={{ renderer: 'canvas' }}
                          />
                        ) : (
                          <div className="h-full flex items-center justify-center text-sm text-gray-500">
                            No standard Web or DNS ports detected.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'identity' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
                      <h3 className="text-sm font-semibold mb-4 border-b border-gray-100 dark:border-gray-800 pb-2 flex items-center gap-2">
                        <User size={16} className="text-orange-500" /> Associated Usernames
                      </h3>
                      <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-2">
                        {selectedAsset.usernames.size > 0 ? Array.from(selectedAsset.usernames).map((user, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800/50 rounded-full text-sm font-medium shadow-sm">
                            <User size={14} className="opacity-70" />
                            {user}
                          </div>
                        )) : (
                          <div className="text-sm text-gray-500 w-full flex h-full items-center justify-center text-center p-4">
                            <span>No usernames observed.<br/>Ensure the <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">user.all</code> meta key is queried.</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
                      <h3 className="text-sm font-semibold mb-4 border-b border-gray-100 dark:border-gray-800 pb-2 flex items-center gap-2">
                        <Mail size={16} className="text-purple-500" /> Associated Emails
                      </h3>
                      <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-2">
                        {emails.size > 0 ? Array.from(emails).map((email, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-800/50 rounded-full text-sm font-medium shadow-sm">
                            <Mail size={14} className="opacity-70" />
                            {email}
                          </div>
                        )) : (
                          <div className="text-sm text-gray-500 w-full flex h-full items-center justify-center text-center p-4">
                            <span>No emails observed.<br/>Ensure the <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">email.all</code> meta key is queried.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 lg:col-span-1">
                      <h3 className="text-sm font-semibold mb-4 border-b border-gray-100 dark:border-gray-800 pb-2 flex items-center gap-2">
                        <Key size={16} className="text-yellow-500" /> Kerberos & LDAP Actions
                      </h3>
                      <div className="space-y-3 max-h-48 overflow-y-auto pr-2">
                        {actions.size > 0 ? Array.from(actions.entries()).map(([action, count], idx) => (
                          <div key={idx} className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate pr-2">{action}</span>
                            <span className="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded text-gray-600 dark:text-gray-400">{count}</span>
                          </div>
                        )) : (
                          <div className="text-sm text-gray-500 text-center p-4">
                            No Kerberos or LDAP actions mapped.<br/>Ensure <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">action</code> is queried.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 lg:col-span-2">
                      <h3 className="text-sm font-semibold mb-4 border-b border-gray-100 dark:border-gray-800 pb-2 flex items-center gap-2">
                        <Activity size={16} className="text-indigo-500" /> Access & Collaboration Metrics
                      </h3>
                      <div className="grid grid-cols-2 gap-4 h-32">
                        <div className="bg-indigo-50 dark:bg-indigo-900/10 rounded-lg p-4 flex flex-col justify-center items-center border border-indigo-100 dark:border-indigo-800/30">
                          <span className="text-indigo-600 dark:text-indigo-400 text-sm font-medium mb-1">Remote Access Sessions</span>
                          <span className="text-3xl font-bold text-indigo-700 dark:text-indigo-300">{identityServiceStats.remoteSessions.toLocaleString()}</span>
                          <span className="text-[10px] text-indigo-500 mt-1 uppercase tracking-wider">RDP, SSH, VNC</span>
                        </div>
                        <div className="bg-teal-50 dark:bg-teal-900/10 rounded-lg p-4 flex flex-col justify-center items-center border border-teal-100 dark:border-teal-800/30">
                          <span className="text-teal-600 dark:text-teal-400 text-sm font-medium mb-1">File Share Volume</span>
                          <span className="text-3xl font-bold text-teal-700 dark:text-teal-300">{formatBytes(identityServiceStats.fileShareVolume)}</span>
                          <span className="text-[10px] text-teal-500 mt-1 uppercase tracking-wider">SMB, FTP, NFS, TFTP</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Files & Documents */}
                  <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
                    <h3 className="text-sm font-semibold mb-4 border-b border-gray-100 dark:border-gray-800 pb-2 flex items-center gap-2">
                      <FileBadge size={16} className="text-emerald-500" /> Filenames, Types & Extensions
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h4 className="text-xs uppercase font-semibold text-gray-500 mb-3">Detected Extensions</h4>
                        <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-2">
                          {selectedAsset.filetypes.size > 0 ? Array.from(selectedAsset.filetypes).map((ft, idx) => (
                            <div key={idx} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm">
                              {ft}
                            </div>
                          )) : (
                            <div className="text-sm text-gray-500 text-center p-2 w-full">No filetypes detected.</div>
                          )}
                        </div>
                      </div>
                      <div>
                        <h4 className="text-xs uppercase font-semibold text-gray-500 mb-3">Sample Filenames</h4>
                        <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-2">
                          {filenames.size > 0 ? Array.from(filenames).map((fname, idx) => (
                            <div key={idx} className="flex items-start text-sm font-mono text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 px-2 py-1.5 rounded border border-gray-100 dark:border-gray-700">
                              <FileText size={14} className="mr-2 mt-0.5 text-gray-400 shrink-0" />
                              <span className="break-all whitespace-normal leading-tight">{fname}</span>
                            </div>
                          )) : (
                            <div className="text-sm text-gray-500 text-center p-2 w-full">No filenames detected. Ensure <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">filename.all</code> is queried.</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'connections' && (
                <div className="space-y-6">
                  <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
                    <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                      <Activity size={16} className="text-gray-400" />
                      Session Volume & Threat Correlation
                    </h3>
                    <div className="h-64 w-full">
                      {selectedAsset.timeSeries.size > 0 ? (
                        <ReactECharts 
                          option={{
                            tooltip: {
                              trigger: 'axis',
                              backgroundColor: isDark ? '#111827' : '#ffffff',
                              borderColor: isDark ? '#374151' : '#e5e7eb',
                              textStyle: { color: isDark ? '#d1d5db' : '#374151' },
                              formatter: (params: any) => `${params[0].name}<br/>Volume: ${formatBytes(Number(params[0].value))}`
                            },
                            grid: { top: 20, right: 20, bottom: 20, left: 20, containLabel: true },
                            xAxis: {
                              type: 'category',
                              data: Array.from(selectedAsset.timeSeries.entries()).map(([time]) => new Date(time * 1000).toLocaleTimeString()).sort(),
                              axisLabel: { color: isDark ? '#4b5563' : '#9ca3af', fontSize: 12 },
                              axisLine: { lineStyle: { color: isDark ? '#374151' : '#e5e7eb' } }
                            },
                            yAxis: {
                              type: 'value',
                              axisLabel: { color: isDark ? '#4b5563' : '#9ca3af', fontSize: 12, formatter: (value: number) => formatBytes(value) },
                              splitLine: { lineStyle: { color: isDark ? '#374151' : '#e5e7eb', type: 'dashed' } }
                            },
                            series: [{
                              type: 'line',
                              data: Array.from(selectedAsset.timeSeries.entries()).sort((a, b) => a[0] - b[0]).map(([, vol]) => vol),
                              smooth: true,
                              showSymbol: false,
                              itemStyle: { color: '#3b82f6' },
                              lineStyle: { width: 2 },
                              markLine: {
                                symbol: ['none', 'none'],
                                label: { position: 'insideStartTop', formatter: '{b}' },
                                data: selectedAsset.indicators.map(ind => ({
                                  xAxis: new Date(ind.time * 1000).toLocaleTimeString(),
                                  name: ind.type.toUpperCase(),
                                  lineStyle: { color: ind.type === 'ioc' ? '#ef4444' : '#f59e0b', type: 'dashed' },
                                  label: { color: ind.type === 'ioc' ? '#ef4444' : '#f59e0b', fontSize: 10, fontWeight: 'bold' }
                                }))
                              }
                            }]
                          }}
                          style={{ height: '100%', width: '100%' }}
                          opts={{ renderer: 'canvas' }}
                        />
                      ) : (
                        <div className="h-full flex items-center justify-center text-gray-500">No time series data available</div>
                      )}
                    </div>
                  </div>

                  <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <Target size={16} className="text-pink-500" />
                        Peer Traffic Symmetry Matrix
                      </h3>
                      <div className="text-xs text-gray-500">Bubble size = Total Sessions</div>
                    </div>
                    <div className="h-80 w-full">
                      {flowBarData.length > 0 ? (
                        <ReactECharts 
                          option={{
                            tooltip: {
                              backgroundColor: isDark ? '#111827' : '#ffffff',
                              borderColor: isDark ? '#374151' : '#e5e7eb',
                              textStyle: { color: isDark ? '#d1d5db' : '#374151' },
                              formatter: (params: any) => {
                                const data = params.data;
                                return `Outbound: ${formatBytes(data[0])}<br/>Inbound: ${formatBytes(data[1])}<br/>Sessions: ${data[2]}`;
                              }
                            },
                            grid: { top: 20, right: 30, bottom: 20, left: 40, containLabel: true },
                            xAxis: {
                              type: 'value',
                              name: 'Data Exfiltrated (Outbound TX)',
                              nameLocation: 'middle',
                              nameGap: 25,
                              axisLabel: { color: isDark ? '#4b5563' : '#9ca3af', fontSize: 11, formatter: (value: number) => formatBytes(value) },
                              splitLine: { lineStyle: { color: isDark ? '#374151' : '#e5e7eb', type: 'dashed' } }
                            },
                            yAxis: {
                              type: 'value',
                              name: 'Data Downloaded (Inbound RX)',
                              nameLocation: 'middle',
                              nameGap: 40,
                              axisLabel: { color: isDark ? '#4b5563' : '#9ca3af', fontSize: 11, formatter: (value: number) => formatBytes(value) },
                              splitLine: { lineStyle: { color: isDark ? '#374151' : '#e5e7eb', type: 'dashed' } }
                            },
                            series: [{
                              type: 'scatter',
                              symbolSize: (data: any) => Math.max(10, Math.min(50, data[2] / 5)),
                              itemStyle: { color: '#ec4899', opacity: 0.7 },
                              data: flowBarData.map(d => [d.outboundVolume, d.inboundVolume, d.sessions])
                            }]
                          }}
                          style={{ height: '100%', width: '100%' }}
                          opts={{ renderer: 'canvas' }}
                        />
                      ) : (
                        <div className="h-full flex items-center justify-center text-gray-500">No peer symmetry data</div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                      <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                        <h3 className="font-semibold flex items-center gap-2">
                          <Network size={18} className="text-gray-400" />
                          Top Peers Summary
                        </h3>
                      </div>
                      <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 text-xs uppercase">
                          <tr>
                            <th className="px-4 py-3 font-medium">IP Address</th>
                            <th className="px-4 py-3 font-medium text-right">Sessions</th>
                            <th className="px-4 py-3 font-medium text-right">Volume</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {Array.from(selectedAsset.peers.values())
                            .sort((a, b) => b.volume - a.volume)
                            .slice(0, 20)
                            .map(peer => (
                            <tr key={peer.ip} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                              <td className="px-4 py-3 font-medium font-mono">{peer.ip}</td>
                              <td className="px-4 py-3 text-right">{peer.sessions.toLocaleString()}</td>
                              <td className="px-4 py-3 text-right font-mono text-gray-500 dark:text-gray-400">{formatBytes(peer.volume)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
                      <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                        <Globe size={18} className="text-gray-400" />
                        Geographic Distribution
                      </h3>
                      <div className="h-80 w-full">
                        <ReactECharts 
                          option={{
                            tooltip: {
                              trigger: 'axis',
                              axisPointer: { type: 'shadow' },
                              backgroundColor: isDark ? '#111827' : '#ffffff',
                              borderColor: isDark ? '#374151' : '#e5e7eb',
                              textStyle: { color: isDark ? '#d1d5db' : '#374151' },
                              formatter: (params: any) => `${params[0].name}: ${formatBytes(Number(params[0].value))}`
                            },
                            grid: { top: 0, right: 20, bottom: 0, left: 40, containLabel: true },
                            xAxis: { type: 'value', show: false },
                            yAxis: {
                              type: 'category',
                              data: geoData.slice(0, 10).map(d => d.country),
                              axisLabel: { color: isDark ? '#9ca3af' : '#4b5563' },
                              axisLine: { show: false },
                              axisTick: { show: false }
                            },
                            series: [{
                              type: 'bar',
                              data: geoData.slice(0, 10).map((d, i) => ({ value: d.volume, itemStyle: { color: COLORS[i % COLORS.length] } })),
                              itemStyle: { borderRadius: [0, 4, 4, 0] },
                              barWidth: 20
                            }]
                          }}
                          style={{ height: '100%', width: '100%' }}
                          opts={{ renderer: 'canvas' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'ssl' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 flex flex-col items-center">
                      <h3 className="text-sm w-full font-semibold mb-4 flex items-center gap-2">
                        <Shield size={16} className="text-emerald-500" />
                        Encryption Coverage
                      </h3>
                      <div className="h-64 w-full relative">
                        {selectedAsset.totalVolume > 0 ? (
                          <ReactECharts 
                            option={{
                              tooltip: {
                                trigger: 'item',
                                backgroundColor: isDark ? '#111827' : '#ffffff',
                                borderColor: isDark ? '#374151' : '#e5e7eb',
                                textStyle: { color: isDark ? '#d1d5db' : '#374151' },
                                formatter: (params: any) => `${params.name}: ${formatBytes(Number(params.value))} (${params.percent}%)`
                              },
                              legend: { bottom: 0, textStyle: { color: isDark ? '#d1d5db' : '#374151' } },
                              series: [{
                                type: 'pie',
                                radius: ['70%', '90%'],
                                center: ['50%', '45%'],
                                avoidLabelOverlap: false,
                                label: { show: false },
                                data: [
                                  { name: 'Encrypted', value: selectedAsset.encryptedVolume, itemStyle: { color: '#10b981' } },
                                  { name: 'Plaintext', value: selectedAsset.plaintextVolume, itemStyle: { color: '#ef4444' } }
                                ]
                              }]
                            }}
                            style={{ height: '100%', width: '100%' }}
                            opts={{ renderer: 'canvas' }}
                          />
                        ) : (
                          <div className="h-full flex items-center justify-center text-gray-500">No traffic data</div>
                        )}
                        {selectedAsset.totalVolume > 0 && (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none pb-8">
                            <div className="text-center">
                              <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                                {Math.round((selectedAsset.encryptedVolume / selectedAsset.totalVolume) * 100)}%
                              </div>
                              <div className="text-xs text-gray-500 uppercase font-semibold">Encrypted</div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
                      <h3 className="text-sm font-semibold mb-4 border-b border-gray-100 dark:border-gray-800 pb-2 flex items-center gap-2">
                        <Fingerprint size={16} className="text-purple-500" /> Top JA3 / JA4 Fingerprints
                      </h3>
                      <div className="h-64 w-full">
                        {selectedAsset.ja3Fingerprints.size > 0 ? (
                          <ReactECharts 
                            option={{
                              tooltip: {
                                trigger: 'axis',
                                axisPointer: { type: 'shadow' },
                                backgroundColor: isDark ? '#111827' : '#ffffff',
                                borderColor: isDark ? '#374151' : '#e5e7eb',
                                textStyle: { color: isDark ? '#d1d5db' : '#374151' }
                              },
                              grid: { top: 0, right: 30, bottom: 0, left: 10, containLabel: true },
                              xAxis: { type: 'value', show: false },
                              yAxis: {
                                type: 'category',
                                data: Array.from(selectedAsset.ja3Fingerprints.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8).map(d => d[0]),
                                axisLabel: { 
                                  color: isDark ? '#9ca3af' : '#4b5563', 
                                  fontSize: 11, 
                                  fontFamily: 'monospace',
                                  formatter: (val: string) => val.length > 15 ? val.substring(0, 15) + '...' : val
                                },
                                axisLine: { show: false },
                                axisTick: { show: false }
                              },
                              series: [{
                                type: 'bar',
                                data: Array.from(selectedAsset.ja3Fingerprints.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8).map(d => d[1]),
                                itemStyle: { color: '#8b5cf6', borderRadius: [0, 4, 4, 0] },
                                barWidth: 18,
                                label: { show: true, position: 'right', color: isDark ? '#9ca3af' : '#6b7280', fontSize: 12 }
                              }]
                            }}
                            style={{ height: '100%', width: '100%' }}
                            opts={{ renderer: 'canvas' }}
                          />
                        ) : (
                          <div className="h-full flex items-center justify-center text-gray-500 text-sm text-center">
                            <span>No TLS fingerprints detected.<br/>Ensure <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">ja3</code> and <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">ja4</code> meta keys are queried.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                      <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-2 bg-gray-50 dark:bg-gray-800/50">
                        <Lock size={16} className="text-blue-500" />
                        <h3 className="font-semibold text-sm">Cipher Suites in Use</h3>
                      </div>
                      <div className="p-5 space-y-3 max-h-64 overflow-y-auto">
                        {ciphers.size > 0 ? Array.from(ciphers.entries()).sort((a, b) => b[1] - a[1]).map(([cipher, count], idx) => (
                          <div key={idx} className="flex justify-between items-center text-sm border-b border-gray-100 dark:border-gray-800 pb-2 last:border-0">
                            <span className="font-mono text-xs text-gray-700 dark:text-gray-300 truncate pr-4">{cipher}</span>
                            <span className="text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">{count}</span>
                          </div>
                        )) : (
                          <div className="text-sm text-gray-500 text-center py-4">No ciphers detected. Ensure <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">crypto</code> is queried.</div>
                        )}
                      </div>
                    </div>

                    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col">
                      <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-2 bg-gray-50 dark:bg-gray-800/50 shrink-0">
                        <Shield size={16} className="text-indigo-500" />
                        <h3 className="font-semibold text-sm">SSL Subjects & Certificate Authorities</h3>
                      </div>
                      <div className="p-5 space-y-6 flex-1 overflow-y-auto">
                        <div>
                          <h4 className="text-xs uppercase font-semibold text-gray-500 mb-2">SSL Subjects</h4>
                          <div className="flex flex-wrap gap-2">
                            {sslSubjects.size > 0 ? Array.from(sslSubjects).map((sub, idx) => (
                              <span key={idx} className="bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800 px-2 py-1 rounded text-xs font-medium">
                                {sub}
                              </span>
                            )) : (
                              <span className="text-xs text-gray-400">No subjects found (<code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">ssl.subject</code>)</span>
                            )}
                          </div>
                        </div>
                        <div>
                          <h4 className="text-xs uppercase font-semibold text-gray-500 mb-2">Certificate Authorities</h4>
                          <div className="flex flex-wrap gap-2">
                            {sslCas.size > 0 ? Array.from(sslCas).map((ca, idx) => (
                              <span key={idx} className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 px-2 py-1 rounded text-xs font-medium">
                                {ca}
                              </span>
                            )) : (
                              <span className="text-xs text-gray-400">No CAs found (<code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">ssl.ca</code>)</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col p-6 overflow-y-auto">
            <div className="mb-6">
              <h1 className="text-2xl font-bold mb-2">All Assets Overview</h1>
              <p className="text-gray-500 dark:text-gray-400">Select an asset from the sidebar to view detailed profiles, or explore the global asset landscape below.</p>
            </div>

            <div className="space-y-6">
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <Activity size={16} className="text-gray-400" />
                  Asset Landscape (Volume × Peer Count)
                </h3>
                <div className="h-80 w-full">
                  <ReactECharts 
                    option={{
                      tooltip: {
                        backgroundColor: isDark ? '#111827' : '#ffffff',
                        borderColor: isDark ? '#374151' : '#e5e7eb',
                        textStyle: { color: isDark ? '#d1d5db' : '#374151' },
                        formatter: (params: any) => {
                          const data = params.data;
                          return `IP: ${data[2]}<br/>Volume: ${formatBytes(data[0])}<br/>Peers: ${data[1]}`;
                        }
                      },
                      legend: { textStyle: { color: isDark ? '#d1d5db' : '#374151' } },
                      grid: { top: 30, right: 20, bottom: 20, left: 20, containLabel: true },
                      xAxis: {
                        type: 'value',
                        name: 'Volume',
                        nameLocation: 'middle',
                        nameGap: 25,
                        axisLabel: { color: isDark ? '#4b5563' : '#9ca3af', fontSize: 12, formatter: (value: number) => formatBytes(value) },
                        splitLine: { lineStyle: { color: isDark ? '#374151' : '#e5e7eb', type: 'dashed' } }
                      },
                      yAxis: {
                        type: 'value',
                        name: 'Peers',
                        nameLocation: 'middle',
                        nameGap: 30,
                        axisLabel: { color: isDark ? '#4b5563' : '#9ca3af', fontSize: 12 },
                        splitLine: { lineStyle: { color: isDark ? '#374151' : '#e5e7eb', type: 'dashed' } }
                      },
                      series: [
                        { name: 'Servers', type: 'scatter', itemStyle: { color: '#3b82f6' }, data: assets.filter(a => a.role === 'server').map(a => [a.totalVolume, a.peers.size, a.ip]) },
                        { name: 'Clients', type: 'scatter', itemStyle: { color: '#10b981' }, data: assets.filter(a => a.role === 'client').map(a => [a.totalVolume, a.peers.size, a.ip]) },
                        { name: 'Mixed', type: 'scatter', itemStyle: { color: '#a855f7' }, data: assets.filter(a => a.role === 'mixed').map(a => [a.totalVolume, a.peers.size, a.ip]) },
                        { name: 'Unknown', type: 'scatter', itemStyle: { color: '#6b7280' }, data: assets.filter(a => a.role === 'unknown').map(a => [a.totalVolume, a.peers.size, a.ip]) }
                      ]
                    }}
                    style={{ height: '100%', width: '100%' }}
                    opts={{ renderer: 'canvas' }}
                  />
                </div>
              </div>

              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <Server size={16} className="text-gray-400" />
                  Service Portfolio (Top 20 Assets by Volume)
                </h3>
                <div className="h-96 w-full">
                  <ReactECharts 
                    option={{
                      tooltip: {
                        trigger: 'axis',
                        axisPointer: { type: 'shadow' },
                        backgroundColor: isDark ? '#111827' : '#ffffff',
                        borderColor: isDark ? '#374151' : '#e5e7eb',
                        textStyle: { color: isDark ? '#d1d5db' : '#374151' },
                        formatter: (params: any) => {
                          let res = `<div class="font-semibold mb-1">${params[0].name}</div>`;
                          params.forEach((p: any) => {
                            if (p.value > 0) {
                              res += `<div class="flex justify-between gap-4"><span style="color:${p.color}">${p.seriesName}</span><span class="font-mono">${formatBytes(Number(p.value))}</span></div>`;
                            }
                          });
                          return res;
                        }
                      },
                      legend: { type: 'scroll', top: 0, textStyle: { color: isDark ? '#d1d5db' : '#374151' } },
                      grid: { top: 30, right: 20, bottom: 20, left: 100, containLabel: true },
                      xAxis: { 
                        type: 'value', 
                        axisLabel: { color: isDark ? '#4b5563' : '#9ca3af', fontSize: 12, formatter: (value: number) => formatBytes(value) },
                        splitLine: { lineStyle: { color: isDark ? '#374151' : '#e5e7eb', type: 'dashed' } }
                      },
                      yAxis: {
                        type: 'category',
                        data: servicePortfolioData.map(d => d.ip),
                        axisLabel: { color: isDark ? '#4b5563' : '#9ca3af', fontSize: 12, width: 100, overflow: 'truncate' },
                        axisLine: { show: false },
                        axisTick: { show: false }
                      },
                      series: [
                        ...topServices.map((svc, idx) => ({
                          name: svc,
                          type: 'bar',
                          stack: 'total',
                          data: servicePortfolioData.map(d => d[svc] || 0),
                          itemStyle: { color: COLORS[idx % COLORS.length] }
                        })),
                        {
                          name: 'Other',
                          type: 'bar',
                          stack: 'total',
                          data: servicePortfolioData.map(d => d.Other || 0),
                          itemStyle: { color: COLORS[10] }
                        }
                      ]
                    }}
                    style={{ height: '100%', width: '100%' }}
                    opts={{ renderer: 'canvas' }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}