import { useEffect } from "react";
import { supabase } from "../lib/supabase";

/** Subscribes to changes on the given tables and invokes onChange — for pages whose data comes from a custom fetch (not useRealtimeList) but still want live refresh. */
export function useRealtimeRefresh(
  tables: string[],
  filter: string,
  onChange: () => void,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;
    const channel = supabase.channel(`refresh:${tables.join(",")}:${filter}`);
    for (const table of tables) {
      channel.on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table, filter },
        () => onChange(),
      );
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, tables.join(","), filter]);
}
