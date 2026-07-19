import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

interface UseRealtimeListOptions<T> {
  /** Tables to subscribe to; any change on any of them triggers a refetch. */
  tables: string[];
  /** Realtime postgres_changes filter, e.g. `location_id=eq.<uuid>` — also doubles as the refetch/resubscribe key, so it must change whenever the query's scope does. */
  filter: string;
  fetcher: () => Promise<T[]>;
  enabled?: boolean;
}

export function useRealtimeList<T>({
  tables,
  filter,
  fetcher,
  enabled = true,
}: UseRealtimeListOptions<T>) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);

  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetcherRef.current();
      setData(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // Data fetching in an effect is an intentional exception to
    // set-state-in-effect here — this is the initial/refetch-on-scope-change load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refetch();
  }, [enabled, filter, refetch]);

  useEffect(() => {
    if (!enabled) return;

    const channel = supabase.channel(`realtime:${tables.join(",")}:${filter}`);
    for (const table of tables) {
      channel.on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table, filter },
        () => refetch(),
      );
    }
    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tables is stable per call site; re-subscribing is keyed by filter
  }, [enabled, filter, refetch]);

  return { data, loading, error, refetch };
}
