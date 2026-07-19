import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Database } from "../types/database";

type CostCategoryRow = Database["public"]["Tables"]["cost_categories"]["Row"];

const CATEGORY_CODES = ["food", "inventory", "labor"] as const;

/** The three controllable cost categories the legacy app tracked (food/inventory/labor). */
export function useCostCategories(organizationId: string | null) {
  const [categories, setCategories] = useState<CostCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no org yet means nothing to load; not a derivation of other state
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("cost_categories")
      .select("*")
      .eq("organization_id", organizationId)
      .in("code", CATEGORY_CODES)
      .then(({ data, error }) => {
        if (!error) setCategories(data ?? []);
        setLoading(false);
      });
  }, [organizationId]);

  const ordered = CATEGORY_CODES.map((code) =>
    categories.find((c) => c.code === code),
  ).filter((c): c is CostCategoryRow => !!c);

  return { categories: ordered, loading };
}
