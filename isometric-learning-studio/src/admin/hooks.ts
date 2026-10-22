import { useCallback, useEffect, useState } from 'react';
/** Loads async data with loading and error state. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; error: string | null; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(true); const [n, setN] = useState(0);
  useEffect(() => {
    let on = true; setLoading(true); setError(null);
    fn().then(d => on && setData(d)).catch(e => on && setError(e instanceof Error ? e.message : String(e))).finally(() => on && setLoading(false));
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  const reload = useCallback(() => setN(x => x + 1), []);
  return { data, error, loading, reload };
}
