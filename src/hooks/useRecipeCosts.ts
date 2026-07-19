import { useEffect, useMemo, useState } from "react";
import { computeRecipeCost, selectCurrentEffective } from "../lib/pnl-calculations";
import { supabase } from "../lib/supabase";

interface MenuItemRow {
  id: string;
  name: string;
  current_price: number;
  recipe_versions: {
    id: string;
    effective_from: string;
    effective_to: string | null;
    recipe_ingredients: {
      id: string;
      item_id: string;
      quantity: number;
      unit_label: string;
      item: { id: string; name: string } | null;
    }[];
  }[];
}

export interface RecipeWithCost {
  menuItemId: string;
  versionId: string | null;
  name: string;
  menuPrice: number;
  cost: number;
  hasMissingPrice: boolean;
  margin: number;
  ingredients: {
    itemId: string;
    itemName: string;
    quantity: number;
    unitLabel: string;
  }[];
}

/** Menu items + their current recipe version's cost, priced from latest_item_costs. */
export function useRecipeCosts(
  organizationId: string | null,
  locationId: string | null,
  refreshKey: unknown,
) {
  const [menuItems, setMenuItems] = useState<MenuItemRow[]>([]);
  const [priceByItemId, setPriceByItemId] = useState<Map<string, number>>(
    new Map(),
  );
  const [itemNames, setItemNames] = useState<string[]>([]);
  const [priceByItemName, setPriceByItemName] = useState<Map<string, number>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organizationId || !locationId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no org/location yet means nothing to load; not a derivation of other state
      setLoading(false);
      return;
    }
    setLoading(true);

    (async () => {
      const [{ data: items }, { data: costs }, { data: menu }] =
        await Promise.all([
          supabase
            .from("items")
            .select("id, name")
            .eq("organization_id", organizationId)
            .is("archived_at", null),
          supabase
            .from("latest_item_costs")
            .select("item_id, unit_price")
            .eq("location_id", locationId),
          supabase
            .from("menu_items")
            .select(
              `id, name, current_price,
               recipe_versions(id, effective_from, effective_to,
                 recipe_ingredients(id, item_id, quantity, unit_label, item:items(id, name)))`,
            )
            .eq("location_id", locationId)
            .is("archived_at", null)
            .order("name", { ascending: true }),
        ]);

      const nameById = new Map((items ?? []).map((i) => [i.id, i.name]));
      const byId = new Map<string, number>();
      const byName = new Map<string, number>();
      for (const row of costs ?? []) {
        if (!row.item_id || row.unit_price === null) continue;
        byId.set(row.item_id, row.unit_price);
        const name = nameById.get(row.item_id);
        if (name) byName.set(name.toLowerCase(), row.unit_price);
      }

      setPriceByItemId(byId);
      setPriceByItemName(byName);
      setItemNames((items ?? []).map((i) => i.name));
      setMenuItems((menu ?? []) as unknown as MenuItemRow[]);
      setLoading(false);
    })();
  }, [organizationId, locationId, refreshKey]);

  const recipes = useMemo<RecipeWithCost[]>(
    () =>
      menuItems.map((menuItem) => {
        const version = selectCurrentEffective(menuItem.recipe_versions);
        const ingredients = version?.recipe_ingredients ?? [];
        const { cost, hasMissingPrice } = computeRecipeCost(
          ingredients.map((i) => ({ itemId: i.item_id, quantity: i.quantity })),
          priceByItemId,
        );
        return {
          menuItemId: menuItem.id,
          versionId: version?.id ?? null,
          name: menuItem.name,
          menuPrice: menuItem.current_price,
          cost,
          hasMissingPrice,
          margin: menuItem.current_price - cost,
          ingredients: ingredients.map((i) => ({
            itemId: i.item_id,
            itemName: i.item?.name ?? "",
            quantity: i.quantity,
            unitLabel: i.unit_label,
          })),
        };
      }),
    [menuItems, priceByItemId],
  );

  return { recipes, itemNames, priceByItemName, loading };
}
