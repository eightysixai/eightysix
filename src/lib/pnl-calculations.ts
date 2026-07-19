export type Quadrant = "star" | "puzzle" | "plowhorse" | "dog";

export const QUADRANTS: Record<Quadrant, { label: string; color: string }> = {
  star: { label: "Top Performer", color: "var(--quad-star)" },
  puzzle: { label: "High Margin, Low Sales", color: "var(--quad-puzzle)" },
  plowhorse: { label: "Popular, Low Margin", color: "var(--quad-plowhorse)" },
  dog: { label: "Underperformer", color: "var(--quad-dog)" },
};

export interface RecipeIngredientInput {
  itemId: string;
  quantity: number;
}

export function computeRecipeCost(
  ingredients: RecipeIngredientInput[],
  latestPriceByItemId: Map<string, number>,
): { cost: number; hasMissingPrice: boolean } {
  let cost = 0;
  let hasMissingPrice = false;
  for (const ingredient of ingredients) {
    const price = latestPriceByItemId.get(ingredient.itemId);
    if (price === undefined) {
      hasMissingPrice = true;
    } else {
      cost += ingredient.quantity * price;
    }
  }
  return { cost, hasMissingPrice };
}

export interface RecipeStatsInput {
  id: string;
  name: string;
  unitsSold: number;
  margin: number;
}

export interface ClassifiedRecipe extends RecipeStatsInput {
  quadrant: Quadrant;
}

export function classifyRecipes(recipes: RecipeStatsInput[]): {
  stats: ClassifiedRecipe[];
  avgPopularity: number;
  avgMargin: number;
} {
  const count = recipes.length;
  const avgPopularity =
    count > 0 ? recipes.reduce((sum, r) => sum + r.unitsSold, 0) / count : 0;
  const avgMargin =
    count > 0 ? recipes.reduce((sum, r) => sum + r.margin, 0) / count : 0;

  const stats = recipes.map((recipe) => {
    const highPopularity = recipe.unitsSold >= avgPopularity;
    const highMargin = recipe.margin >= avgMargin;
    let quadrant: Quadrant;
    if (highPopularity && highMargin) quadrant = "star";
    else if (highPopularity && !highMargin) quadrant = "plowhorse";
    else if (!highPopularity && highMargin) quadrant = "puzzle";
    else quadrant = "dog";
    return { ...recipe, quadrant };
  });

  return { stats, avgPopularity, avgMargin };
}

export interface VarianceResult {
  theoreticalRemaining: number;
  variance: number | null;
  varianceClass: "positive" | "negative" | "";
}

export function computeVariance(
  purchased: number,
  theoreticalUsage: number,
  actualOnHand: number | null,
): VarianceResult {
  const theoreticalRemaining = purchased - theoreticalUsage;
  if (actualOnHand === null) {
    return { theoreticalRemaining, variance: null, varianceClass: "" };
  }
  const variance = theoreticalRemaining - actualOnHand;
  const varianceClass =
    variance > 0.01 ? "negative" : variance < -0.01 ? "positive" : "";
  return { theoreticalRemaining, variance, varianceClass };
}

export interface EffectiveDated {
  effective_from: string;
  effective_to: string | null;
}

/** The currently-effective row: latest effective_from with no end date (or the latest overall if none is open-ended). */
export function selectCurrentEffective<T extends EffectiveDated>(
  rows: T[],
): T | null {
  if (rows.length === 0) return null;
  const open = rows.filter((r) => r.effective_to === null);
  const pool = open.length > 0 ? open : rows;
  return pool.reduce((latest, r) =>
    r.effective_from > latest.effective_from ? r : latest,
  );
}

export interface BudgetTargetLike extends EffectiveDated {
  cost_category_id: string;
  target_type: string;
  target_value: number;
}

/** The currently-effective target for a category. */
export function selectCurrentBudgetTarget<T extends BudgetTargetLike>(
  targets: T[],
  costCategoryId: string,
): T | null {
  return selectCurrentEffective(
    targets.filter((t) => t.cost_category_id === costCategoryId),
  );
}

export interface PriceHistoryEntry {
  date: string;
  price: number;
}

export interface PriceHistoryStats {
  entries: PriceHistoryEntry[];
  first: PriceHistoryEntry;
  latest: PriceHistoryEntry;
  pctChange: number;
  isCreeping: boolean;
}

export function computePriceHistoryStats(
  entries: PriceHistoryEntry[],
): PriceHistoryStats | null {
  if (entries.length === 0) return null;
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0];
  const latest = sorted[sorted.length - 1];
  const pctChange =
    first.price > 0 ? ((latest.price - first.price) / first.price) * 100 : 0;
  return {
    entries: sorted,
    first,
    latest,
    pctChange,
    isCreeping: pctChange > 5,
  };
}
