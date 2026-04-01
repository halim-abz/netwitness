import { useState } from 'react';
import AlertsDashboard from './AlertsDashboard';
import IncidentsDashboard from './IncidentsDashboard';
import { ShieldAlert, AlertOctagon } from 'lucide-react';

interface AlertsIncidentsDashboardProps {
  host: string;
  port: string;
  username: string;
  password?: string;
  isDark: boolean;
  queryTrigger: number;
}

export default function AlertsIncidentsDashboard({
  host,
  port,
  username,
  password,
  isDark,
  queryTrigger
}: AlertsIncidentsDashboardProps) {
  const [activeTab, setActiveTab] = useState<'incidents' | 'alerts'>('incidents');
  const [initialAlertId, setInitialAlertId] = useState<string | null>(null);
  const [initialFilterIP, setInitialFilterIP] = useState<string | null>(null);

  const handleNavigateToAlerts = (filter: { alertId?: string, ip?: string }) => {
    setActiveTab('alerts');
    setInitialAlertId(filter.alertId || null);
    setInitialFilterIP(filter.ip || null);
  };

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <button
          onClick={() => setActiveTab('incidents')}
          className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
            activeTab === 'incidents'
              ? 'border-b-2 border-[#BE3B37] text-[#BE3B37]'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          <AlertOctagon size={16} />
          Incidents
        </button>
        <button
          onClick={() => {
            setActiveTab('alerts');
            setInitialAlertId(null);
            setInitialFilterIP(null);
          }}
          className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
            activeTab === 'alerts'
              ? 'border-b-2 border-[#BE3B37] text-[#BE3B37]'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          <ShieldAlert size={16} />
          Alerts
        </button>
      </div>

      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'alerts' && (
          <AlertsDashboard
            host={host}
            port={port}
            username={username}
            password={password}
            isDark={isDark}
            queryTrigger={queryTrigger}
            initialAlertId={initialAlertId}
            initialFilterIP={initialFilterIP}
          />
        )}
        {activeTab === 'incidents' && (
          <IncidentsDashboard
            host={host}
            port={port}
            username={username}
            password={password}
            isDark={isDark}
            queryTrigger={queryTrigger}
            onNavigateToAlerts={handleNavigateToAlerts}
          />
        )}
      </div>
    </div>
  );
}
