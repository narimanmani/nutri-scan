import React, { useMemo } from 'react';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

const mealTypeColors = {
  breakfast: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  lunch: 'bg-blue-100 text-blue-800 border-blue-200',
  dinner: 'bg-purple-100 text-purple-800 border-purple-200',
  snack: 'bg-green-100 text-green-800 border-green-200'
};

const nutrientLabels = {
  calories: 'Calories',
  protein: 'Protein',
  carbs: 'Carbs',
  fat: 'Fat',
  fiber: 'Fiber',
  sugar: 'Sugar',
  sodium: 'Sodium',
  potassium: 'Potassium',
  calcium: 'Calcium',
  iron: 'Iron',
  vitamin_c: 'Vitamin C',
  vitamin_a: 'Vitamin A'
};

function formatDate(dateLike) {
  if (!dateLike) {
    return null;
  }

  const parsed = new Date(dateLike);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return format(parsed, 'EEEE, MMMM d, yyyy');
}

function NutrientGrid({ meal }) {
  const primary = ['calories', 'protein', 'carbs', 'fat'];
  const secondary = Object.keys(nutrientLabels).filter((key) => !primary.includes(key));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {primary.map((key) => (
          <div key={key} className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
            <p className="text-xs uppercase tracking-wide text-emerald-700 font-semibold">
              {nutrientLabels[key]}
            </p>
            <p className="mt-2 text-2xl font-bold text-emerald-900">
              {Math.round(Number(meal?.[key]) || 0)}{key === 'calories' ? '' : 'g'}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {secondary.map((key) => (
          <div key={key} className="flex items-center justify-between rounded-lg border border-gray-100 bg-white/80 px-3 py-2">
            <span className="text-sm text-gray-600">{nutrientLabels[key]}</span>
            <span className="text-sm font-semibold text-gray-900">
              {Math.round(Number(meal?.[key]) || 0)}{key === 'calories' ? '' : 'g'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function IngredientsList({ ingredients }) {
  if (!ingredients?.length) {
    return null;
  }

  return (
    <div className="space-y-4">
      {ingredients.map((ingredient) => (
        <div
          key={ingredient.id || `${ingredient.name}-${ingredient.amount}`}
          className="rounded-xl border border-gray-100 bg-white/70 p-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-gray-900">{ingredient.name || 'Ingredient'}</p>
            <p className="text-sm text-gray-600">
              {ingredient.amount || 0} {ingredient.unit || ''}
            </p>
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
            {['calories', 'protein', 'carbs', 'fat'].map((field) => (
              <span key={field} className="font-medium text-gray-700">
                {nutrientLabels[field]}: {Math.round(Number(ingredient?.[field]) || 0)}{field === 'calories' ? '' : 'g'}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function MealDetailsDialog({ meal, open, onOpenChange, onEdit }) {
  const formattedDate = useMemo(() => formatDate(meal?.meal_date || meal?.created_date), [meal]);
  const typeBadgeClass = meal?.meal_type ? mealTypeColors[meal.meal_type] || mealTypeColors.snack : mealTypeColors.snack;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl gap-0 p-0 overflow-x-hidden overflow-y-auto sm:max-h-[90vh] sm:overflow-hidden max-h-[calc(100vh-2rem)]">
        {meal ? (
          <div className="grid h-full max-h-[calc(100vh-2rem)] grid-rows-[auto_1fr] md:max-h-[90vh] md:grid-cols-[320px_1fr] md:grid-rows-1">
            <div className="relative h-60 w-full md:h-full">
              {meal.photo_url ? (
                <img
                  src={meal.photo_url}
                  alt={meal.meal_name || 'Logged meal photo'}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-emerald-50">
                  <p className="text-sm font-medium text-emerald-600">No photo uploaded</p>
                </div>
              )}
            </div>

            <div className="flex min-h-0 flex-1">
              <div className="h-full w-full overflow-y-auto p-6 pb-8 space-y-6 [-webkit-overflow-scrolling:touch] md:max-h-[90vh]">
                <DialogHeader className="space-y-4">
                  <DialogTitle className="text-2xl font-semibold text-gray-900">
                    {meal.meal_name || 'Logged meal'}
                  </DialogTitle>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
                    <Badge className={cn('capitalize', typeBadgeClass)}>{meal.meal_type || 'meal'}</Badge>
                    {formattedDate && <span>{formattedDate}</span>}
                  </div>
                </DialogHeader>

                {meal.notes && (
                  <div className="rounded-xl bg-emerald-50/60 p-4 text-sm text-emerald-900">
                    {meal.notes}
                  </div>
                )}

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">Nutrition breakdown</h3>
                  <NutrientGrid meal={meal} />
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">Ingredients</h3>
                  <IngredientsList ingredients={meal.ingredients} />
                </div>

                {meal.analysis_notes && (
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-gray-900">Analysis notes</h3>
                    <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">{meal.analysis_notes}</p>
                  </div>
                )}

                <div className="flex flex-wrap justify-end gap-3 pt-2">
                  <Button variant="outline" onClick={() => onOpenChange?.(false)}>
                    Close
                  </Button>
                  {typeof onEdit === 'function' && (
                    <Button onClick={() => onEdit(meal)}>Edit log</Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-10 text-center">
            <p className="text-sm text-gray-500">Select a meal to view its details.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

