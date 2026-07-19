import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { formatMoney } from "../../lib/format";
import { findOrCreateItem } from "../../lib/resolve-entities";
import { supabase } from "../../lib/supabase";
import { Modal } from "../ui/Modal";

const ingredientSchema = z.object({
  itemName: z.string().min(1, "Item name is required"),
  quantity: z.number().min(0),
  unitLabel: z.string().min(1, "Unit is required"),
});

const recipeSchema = z.object({
  name: z.string().min(1, "Recipe name is required"),
  menuPrice: z.number().min(0),
  ingredients: z.array(ingredientSchema).min(1, "Add at least one ingredient"),
});

export type RecipeFormValues = z.infer<typeof recipeSchema>;

export interface EditingRecipe {
  menuItemId: string;
  versionId: string | null;
  name: string;
  menuPrice: number;
  ingredients: RecipeFormValues["ingredients"];
}

const emptyIngredient: RecipeFormValues["ingredients"][number] = {
  itemName: "",
  quantity: 1,
  unitLabel: "case",
};

export function RecipeFormModal({
  open,
  onClose,
  organizationId,
  locationId,
  foodCategoryId,
  itemNames,
  latestPriceByItemName,
  editingRecipe,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  locationId: string;
  foodCategoryId: string | null;
  itemNames: string[];
  latestPriceByItemName: Map<string, number>;
  editingRecipe: EditingRecipe | null;
  onSaved: () => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RecipeFormValues>({
    resolver: zodResolver(recipeSchema),
    defaultValues: editingRecipe ?? {
      name: "",
      menuPrice: 0,
      ingredients: [emptyIngredient],
    },
  });

  useEffect(() => {
    if (!open) return;
    reset(
      editingRecipe ?? { name: "", menuPrice: 0, ingredients: [emptyIngredient] },
    );
    setFormError(null);
  }, [open, editingRecipe, reset]);

  const { fields, append, remove } = useFieldArray({
    control,
    name: "ingredients",
  });

  const ingredients = watch("ingredients");
  // Best-effort live cost preview using known prices; unresolved new item names
  // simply won't have a price yet until saved, same as the legacy app's
  // "no price data for some ingredients" flag.
  const previewCost = ingredients.reduce((sum, ingredient) => {
    const price = latestPriceByItemName.get(
      ingredient.itemName.trim().toLowerCase(),
    );
    return sum + (price ?? 0) * (ingredient.quantity || 0);
  }, 0);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      let menuItemId: string;
      let versionId: string;

      if (editingRecipe) {
        menuItemId = editingRecipe.menuItemId;
        const { error } = await supabase
          .from("menu_items")
          .update({ name: values.name, current_price: values.menuPrice })
          .eq("id", menuItemId);
        if (error) throw error;

        if (editingRecipe.versionId) {
          versionId = editingRecipe.versionId;
          const { error: deleteError } = await supabase
            .from("recipe_ingredients")
            .delete()
            .eq("recipe_version_id", versionId);
          if (deleteError) throw deleteError;
        } else {
          const { data, error: versionError } = await supabase
            .from("recipe_versions")
            .insert({
              menu_item_id: menuItemId,
              version_number: 1,
              effective_from: "1970-01-01",
            })
            .select("id")
            .single();
          if (versionError) throw versionError;
          versionId = data.id;
        }
      } else {
        const { data: menuItem, error } = await supabase
          .from("menu_items")
          .insert({
            location_id: locationId,
            name: values.name,
            current_price: values.menuPrice,
          })
          .select("id")
          .single();
        if (error) throw error;
        menuItemId = menuItem.id;

        const { data: version, error: versionError } = await supabase
          .from("recipe_versions")
          .insert({
            menu_item_id: menuItemId,
            version_number: 1,
            effective_from: "1970-01-01",
          })
          .select("id")
          .single();
        if (versionError) throw versionError;
        versionId = version.id;
      }

      const rows = [];
      for (const ingredient of values.ingredients) {
        const itemId = await findOrCreateItem(
          organizationId,
          ingredient.itemName,
          foodCategoryId,
          ingredient.unitLabel,
        );
        rows.push({
          recipe_version_id: versionId,
          item_id: itemId,
          quantity: ingredient.quantity,
          unit_label: ingredient.unitLabel,
        });
      }
      const { error: insertError } = await supabase
        .from("recipe_ingredients")
        .insert(rows);
      if (insertError) throw insertError;

      onSaved();
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save recipe");
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editingRecipe ? "Edit Recipe" : "Add Recipe"}
    >
      <datalist id="recipe-item-names">
        {itemNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {formError && <p className="form-error">{formError}</p>}

      <form onSubmit={onSubmit} noValidate>
        <div className="form-row">
          <label>
            Recipe Name
            <input type="text" {...register("name")} />
            {errors.name && <span className="form-error">{errors.name.message}</span>}
          </label>
          <label>
            Menu Price
            <input
              type="number"
              min={0}
              step="any"
              {...register("menuPrice", { valueAsNumber: true })}
            />
          </label>
        </div>

        <h3>Ingredients</h3>
        <div>
          {fields.map((field, index) => (
            <div className="ingredient-row" key={field.id}>
              <label>
                Item Name
                <input
                  type="text"
                  list="recipe-item-names"
                  placeholder="Matches an invoice item name"
                  {...register(`ingredients.${index}.itemName` as const)}
                />
              </label>
              <label>
                Quantity
                <input
                  type="number"
                  min={0}
                  step="any"
                  {...register(`ingredients.${index}.quantity` as const, {
                    valueAsNumber: true,
                  })}
                />
              </label>
              <label>
                Unit
                <input
                  type="text"
                  {...register(`ingredients.${index}.unitLabel` as const)}
                />
              </label>
              <button
                type="button"
                className="icon-btn"
                title="Remove"
                onClick={() => remove(index)}
                disabled={fields.length <= 1}
              >
                &times;
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => append(emptyIngredient)}
        >
          Add Ingredient
        </button>

        <div className="modal-footer">
          <div className="modal-total">Cost: {formatMoney(previewCost)}</div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save Recipe"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
