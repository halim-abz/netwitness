import { useState, useRef, useCallback } from 'react';
import { NetWitnessResponse } from '../types';
import { QueryConfig } from '../components/Sidebar';

interface UseNetWitnessQueryResult {
  rawData: NetWitnessResponse | null;
  isLoading: boolean;
  error: string | null;
  queriedAttributes: string[];
  navigateUrl: string;
  handleQuery: (config: QueryConfig) => Promise<void>;
  handleCancel: () => void;
  setError: (error: string | null) => void;
  setNavigateUrl: (url: string) => void;
  setQueriedAttributes: (attrs: string[]) => void;
}

/**
 * Custom hook to manage NetWitness query state and execution.
 * Handles aborting ongoing requests to prevent race conditions.
 */
export const useNetWitnessQuery = (onNewQuery: () => void): UseNetWitnessQueryResult => {
  const [rawData, setRawData] = useState<NetWitnessResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queriedAttributes, setQueriedAttributes] = useState<string[]>([]);
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
    onNewQuery(); // Callback to reset UI state (e.g., selected item, displayed attributes)

    const optionalKeys = config.metakeys.filter(
      (k) => !["ip.src", "ip.dst", "size", "latdec.src", "latdec.dst", "longdec.src", "longdec.dst", "direction", "time"].includes(k)
    );
    setQueriedAttributes(optionalKeys);
    if (config.navigateUrl) {
      setNavigateUrl(config.navigateUrl);
    }

    try {
      // Construct the query string for NetWitness
      const queryKeys = Array.from(new Set([
        ...config.metakeys.flatMap(k => k === 'country' ? ['country.src', 'country.dst'] : k === 'org' ? ['org.src', 'org.dst'] : [k]),
        'latdec.src', 'latdec.dst', 'longdec.src', 'longdec.dst', 'time'
      ]));
      const selectClause = queryKeys.join(",");
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

      const data = await response.json();

      if (!response.ok) {
        let errorMessage = data.error || `HTTP error ${response.status}`;
        if (data.details) {
          errorMessage += `: ${data.details}`;
        }
        throw new Error(errorMessage);
      }

      if (!data.results || !data.results.fields) {
        if (data.message) {
          throw new Error(`NetWitness API Error: ${data.message}`);
        }
        throw new Error("No data returned from NetWitness. Check your query or connection.");
      }

      setRawData(data);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log("Query cancelled");
        return;
      }
      console.error("Query failed:", err);
      setError(err.message || "An unknown error occurred");
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
    handleQuery,
    handleCancel,
    setError,
    setNavigateUrl,
    setQueriedAttributes
  };
};
