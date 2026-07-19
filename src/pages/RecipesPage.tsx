import { useState } from "react";
import { ViewHeader } from "../components/layout/ViewHeader";
import { RecipeFormModal, type EditingRecipe } from "../components/recipes/RecipeFormModal";
import { useOrganization } from "../context/OrganizationContext";
import { useCostCategories } from "../hooks/useCostCategories";
import { useRealtimeRefresh } from "../hooks/useRealtimeRefresh";
import { useRecipeCosts, type RecipeWithCost } from "../hooks/useRecipeCosts";
import { formatMoney } from "../lib/format";
import { supabase } from "../lib/supabase";

export function RecipesPage() {
  const { organizationId, locationId } = useOrganization();
  const { categories } = useCostCategories(organizationId);
  const foodCategoryId = categories.find((c) => c.code === "food")?.id ?? null;

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<EditingRecipe | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const { recipes, itemNames, priceByItemName } = useRecipeCosts(
    organizationId,
    locationId,
    refreshKey,
  );

  useRealtimeRefresh(
    ["menu_items", "recipe_versions", "recipe_ingredients"],
    `location_id=eq.${locationId}`,
    () => setRefreshKey((k) => k + 1),
    !!locationId,
  );

  function refetch() {
    setRefreshKey((k) => k + 1);
  }

  function openAddModal() {
    setEditingRecipe(null);
    setModalOpen(true);
  }

  function openEditModal(recipe: RecipeWithCost) {
    setEditingRecipe({
      menuItemId: recipe.menuItemId,
      versionId: recipe.versionId,
      name: recipe.name,
      menuPrice: recipe.menuPrice,
      ingredients: recipe.ingredients.map((i) => ({
        itemName: i.itemName,
        quantity: i.quantity,
        unitLabel: i.unitLabel,
      })),
    });
    setModalOpen(true);
  }

  async function handleDelete(menuItemId: string) {
    const { error } = await supabase
      .from("menu_items")
      .delete()
      .eq("id", menuItemId);
    if (error) setBannerError(error.message);
    else refetch();
  }

  return (
    <>
      <ViewHeader
        title="Recipes"
        subtitle="Cost out menu items using the latest invoice prices"
      />

      {bannerError && (
        <p className="form-error" onClick={() => setBannerError(null)}>
          {bannerError}
        </p>
      )}

      <section className="panel">
        <div className="panel-header">
          <h2>Recipes</h2>
          <button className="btn btn-primary" onClick={openAddModal}>
            Add Recipe
          </button>
        </div>
        <div className="recipes-grid">
          {recipes.length === 0 ? (
            <div className="empty-state">No recipes yet.</div>
          ) : (
            recipes.map((recipe) => {
              const costPct =
                recipe.menuPrice > 0 ? (recipe.cost / recipe.menuPrice) * 100 : 0;
              return (
                <div className="recipe-card" key={recipe.menuItemId}>
                  <h3>{recipe.name}</h3>
                  <div className="recipe-row">
                    <span>Menu Price</span>
                    <strong>{formatMoney(recipe.menuPrice)}</strong>
                  </div>
                  <div className="recipe-row">
                    <span>Cost</span>
                    <strong>{formatMoney(recipe.cost)}</strong>
                  </div>
                  <div className="recipe-row">
                    <span>Cost %</span>
                    <strong>{costPct.toFixed(1)}%</strong>
                  </div>
                  <div className="recipe-row">
                    <span>Margin</span>
                    <strong>{formatMoney(recipe.margin)}</strong>
                  </div>
                  {recipe.hasMissingPrice && (
                    <div className="warning-flag">
                      No price data for some ingredients
                    </div>
                  )}
                  <div className="recipe-card-actions">
                    <button
                      className="btn btn-secondary"
                      onClick={() => openEditModal(recipe)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-secondary btn-danger"
                      onClick={() => handleDelete(recipe.menuItemId)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {organizationId && locationId && (
        <RecipeFormModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          organizationId={organizationId}
          locationId={locationId}
          foodCategoryId={foodCategoryId}
          itemNames={itemNames}
          latestPriceByItemName={priceByItemName}
          editingRecipe={editingRecipe}
          onSaved={refetch}
        />
      )}
    </>
  );
}
