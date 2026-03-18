import { useState, useRef, useCallback } from 'react';
import { NetWitnessResponse } from '../types';
import { QueryConfig } from '../components/Sidebar';

// --- TYPES ---

interface ApiErrorResponse {
  error?: string;
  details?: string;
  message?: string;
  results?: { fields?: any[] };
}

interface UseNetWitnessQueryResult {
  rawData: NetWitnessResponse | null;
  isLoading: boolean;
  error: string | null;
  queriedAttributes: string[];
  navigateUrl: string;
  latestConfig: QueryConfig | null;
  handleQuery: (config: QueryConfig) => Promise<void>;
  handleCancel: () => void;
  setError: (error: string | null) => void;
  setNavigateUrl: (url: string) => void;
  setQueriedAttributes: (attrs: string[]) => void;
}

// --- CONSTANTS ---

const BASE_META_KEYS = new Set([
  "ip.src", "ip.dst", "size", "latdec.src", "latdec.dst", 
  "longdec.src", "longdec.dst", "direction", "time"
]);

const REQUIRED_QUERY_KEYS = [
  'latdec.src', 'latdec.dst', 'longdec.src', 'longdec.dst', 'time'
];

// --- UTILITIES ---

/**
 * Expands shorthand keys (like 'country' or 'org') into their source and destination counterparts
 * and combines them with required keys to form the final SELECT clause.
 */
const buildSelectClause = (metakeys: string[]): string => {
  const expandedKeys = metakeys.flatMap((key) => {
    if (key === 'country') return ['country.src', 'country.dst'];
    if (key === 'org') return ['org.src', 'org.dst'];
    return [key];
  });

  return Array.from(new Set([...expandedKeys, ...REQUIRED_QUERY_KEYS])).join(',');
};

/**
 * Custom hook to manage NetWitness query state and execution.
 * Handles aborting ongoing requests to prevent race conditions.
 */
export const useNetWitnessQuery = (onNewQuery: () => void): UseNetWitnessQueryResult => {
  const [rawData, setRawData] = useState<NetWitnessResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queriedAttributes, setQueriedAttributes] = useState<string[]>([]);
  const [latestConfig, setLatestConfig] = useState<QueryConfig | null>(null);
  
  const [navigateUrl, setNavigateUrl] = useState<string>(() => {
    return localStorage.getItem('nw_navigate_url') || "";
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }, []);

  const handleQuery = useCallback(async (config: QueryConfig) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    setError(null);
    onNewQuery(); // Callback to reset UI state

    // Filter out standard keys to identify custom user attributes
    const optionalKeys = config.metakeys.filter((k) => !BASE_META_KEYS.has(k));
    setQueriedAttributes(optionalKeys);
    setLatestConfig(config);
    
    // Sync to state and persist to localStorage
    if (config.navigateUrl) {
      setNavigateUrl(config.navigateUrl);
      localStorage.setItem('nw_navigate_url', config.navigateUrl);
    }

    try {
      // Construct the query string for NetWitness
      const selectClause = buildSelectClause(config.metakeys);
      let fullQuery = `select ${selectClause} where ${config.query}`;
      
      if (config.timeRange !== "all") {
        fullQuery += ` && time=rtp(latest,${config.timeRange})-u`;
      }

      const response = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: config.host,
          port: config.port,
          query: fullQuery, // Note: Ensure backend sanitizes this to prevent injection
          size: config.size,
          username: config.username,
          password: config.password,
        }),
        signal: abortControllerRef.current.signal
      });

      const rawResponse = await response.json();
      const data = rawResponse as ApiErrorResponse & NetWitnessResponse;

      if (!response.ok) {
        let errorMessage = data.error || `HTTP error ${response.status}`;
        if (data.details) {
          errorMessage += `: ${data.details}`;
        }
        throw new Error(errorMessage);
      }

      if (!data.results?.fields) {
        throw new Error(
          data.message 
            ? `NetWitness API Error: ${data.message}` 
            : "No data returned from NetWitness. Check your query or connection."
        );
      }

      setRawData(data);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.info("Query cancelled by user or overridden by a new request.");
        return;
      }
      
      console.error("Query failed:", err);
      
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unknown error occurred while fetching data.");
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [onNewQuery]);

  return {
    rawData,
    isLoading,
    error,
    queriedAttributes,
    navigateUrl,
    latestConfig,
    handleQuery,
    handleCancel,
    setError,
    setNavigateUrl,
    setQueriedAttributes
  };
};