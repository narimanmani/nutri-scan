import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Edit3, Loader2, ImagePlus, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { getDataUrlFromFile } from "@/api/openaiClient";
import { fetchIngredientSuggestions, estimateIngredientNutrition } from "@/api/ingredientSuggestions";

const NUTRIENT_FIELDS = [
  'calories',
  'protein',
  'carbs',
  'fat',
  'fiber',
  'sugar',
  'sodium',
  'potassium',
  'calcium',
  'iron',
  'vitamin_c',
  'vitamin_a'
];

const PRIMARY_NUTRIENTS = ['calories', 'protein', 'carbs', 'fat'];
const MICRO_NUTRIENTS = NUTRIENT_FIELDS.filter((field) => !PRIMARY_NUTRIENTS.includes(field));

const CANONICAL_UNITS = ['g', 'ml', 'oz', 'cup', 'serving'];

const UNIT_ALIASES = {
  g: 'g',
  gram: 'g',
  grams: 'g',
  "g (grams)": 'g',
  kilogram: 'g',
  kilograms: 'g',
  kg: 'g',
  ml: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  millilitre: 'ml',
  millilitres: 'ml',
  'ml (milliliters)': 'ml',
  liter: 'ml',
  liters: 'ml',
  litre: 'ml',
  litres: 'ml',
  l: 'ml',
  ounce: 'oz',
  ounces: 'oz',
  'fl oz': 'oz',
  oz: 'oz',
  cup: 'cup',
  cups: 'cup',
  serving: 'serving',
  servings: 'serving',
  portion: 'serving',
  portions: 'serving'
};

function canonicalizeUnit(unit) {
  if (typeof unit !== 'string') {
    return 'g';
  }

  const normalized = unit.trim().toLowerCase();
  if (normalized.length === 0) {
    return 'g';
  }

  const mapped = UNIT_ALIASES[normalized];
  if (mapped) {
    return mapped;
  }

  return CANONICAL_UNITS.includes(normalized) ? normalized : 'g';
}

const UNIT_OPTIONS = [
  { value: 'g', label: 'g (grams)' },
  { value: 'ml', label: 'ml (milliliters)' },
  { value: 'oz', label: 'oz (ounces)' },
  { value: 'cup', label: 'cup' },
  { value: 'serving', label: 'serving' }
];

function generateIngredientId() {
  const globalCrypto = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
  if (globalCrypto?.randomUUID) {
    return globalCrypto.randomUUID();
  }
  return `ingredient_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function createEmptyNutrients() {
  return NUTRIENT_FIELDS.reduce((acc, field) => {
    acc[field] = 0;
    return acc;
  }, {});
}

function computePerUnit(ingredient) {
  const safeAmount = Number(ingredient.amount) > 0 ? Number(ingredient.amount) : 1;
  return NUTRIENT_FIELDS.reduce((acc, field) => {
    acc[field] = safeAmount > 0 ? (Number(ingredient[field]) || 0) / safeAmount : 0;
    return acc;
  }, {});
}

function normalizeIngredient(ingredient, index = 0) {
  const safe = typeof ingredient === 'object' && ingredient !== null ? { ...ingredient } : {};
  const normalized = {
    id: typeof safe.id === 'string' && safe.id.length > 0 ? safe.id : generateIngredientId(),
    name:
      typeof safe.name === 'string' && safe.name.length > 0
        ? safe.name
        : `Ingredient ${index + 1}`,
    unit: canonicalizeUnit(safe.unit),
    amount: Number(safe.amount) || 0,
    ...createEmptyNutrients(),
  };

  NUTRIENT_FIELDS.forEach((field) => {
    const parsed = Number(safe[field]);
    normalized[field] = Number.isFinite(parsed) ? parsed : 0;
  });

  normalized._perUnit = computePerUnit(normalized);

  return normalized;
}

function calculateTotals(ingredients = []) {
  return ingredients.reduce(
    (totals, ingredient) => {
      NUTRIENT_FIELDS.forEach((field) => {
        totals[field] += Number(ingredient[field]) || 0;
      });
      return totals;
    },
    createEmptyNutrients()
  );
}

function createFallbackIngredient(meal) {
  const ingredient = normalizeIngredient(
    {
      id: generateIngredientId(),
      name: meal?.meal_name ? `${meal.meal_name} serving` : 'Meal serving',
      unit: 'serving',
      amount: 1,
      ...NUTRIENT_FIELDS.reduce((acc, field) => {
        acc[field] = Number(meal?.[field]) || 0;
        return acc;
      }, {})
    },
    0
  );
  ingredient._perUnit = computePerUnit(ingredient);
  return ingredient;
}

function normalizeMeal(initialData) {
  const base = {
    meal_name: '',
    meal_type: 'lunch',
    meal_date: '',
    notes: '',
    photo_url: '',
    analysis_notes: '',
    ...initialData
  };

  const normalizedIngredients = Array.isArray(base.ingredients) && base.ingredients.length > 0
    ? base.ingredients.map((ingredient, index) => normalizeIngredient(ingredient, index))
    : [createFallbackIngredient(base)];

  const totals = calculateTotals(normalizedIngredients);

  const normalizedMeal = {
    ...base,
    ingredients: normalizedIngredients
  };

  NUTRIENT_FIELDS.forEach((field) => {
    normalizedMeal[field] = totals[field];
  });

  return normalizedMeal;
}

function sanitizeMealForSave(meal) {
  const cleanedIngredients = (meal.ingredients || []).map(({ _perUnit, ...rest }) => rest);
  const totals = calculateTotals(cleanedIngredients);

  return {
    ...meal,
    ...totals,
    ingredients: cleanedIngredients
  };
}

function formatUnitLabel(unit) {
  return UNIT_OPTIONS.find((option) => option.value === unit)?.label || unit;
}

function formatTotalValue(field, value) {
  const numeric = Number(value) || 0;

  if (field === 'calories') {
    return numeric.toFixed(0);
  }

  if (['sodium', 'potassium', 'calcium', 'vitamin_a'].includes(field)) {
    return Math.round(numeric).toString();
  }

  return numeric.toFixed(1);
}

export default function NutritionTable({ initialData, onSave, onCancel, isSaving, allowPhotoChange = false }) {
  const [editedData, setEditedData] = useState(normalizeMeal(initialData));
  const [expandedIngredientId, setExpandedIngredientId] = useState(null);
  const fileInputRef = useRef(null);
  const [ingredientSuggestions, setIngredientSuggestions] = useState({});
  const [suggestionsLoading, setSuggestionsLoading] = useState({});
  const [selectedSuggestions, setSelectedSuggestions] = useState({});
  const [estimateLoading, setEstimateLoading] = useState({});
  const suggestionTimersRef = useRef({});
  const latestQueryRef = useRef({});
  const lastEstimateSignatureRef = useRef({});

  useEffect(() => {
    setEditedData(normalizeMeal(initialData));
    setExpandedIngredientId(null);
    setIngredientSuggestions({});
    setSuggestionsLoading({});
    setSelectedSuggestions({});
    setEstimateLoading({});
    suggestionTimersRef.current = {};
    latestQueryRef.current = {};
    lastEstimateSignatureRef.current = {};
  }, [initialData]);

  useEffect(() => {
    return () => {
      Object.values(suggestionTimersRef.current || {}).forEach((timerId) => {
        if (timerId) {
          clearTimeout(timerId);
        }
      });
    };
  }, []);

  const clearIngredientAiState = (id) => {
    setIngredientSuggestions((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setSuggestionsLoading((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setSelectedSuggestions((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setEstimateLoading((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    delete suggestionTimersRef.current[id];
    delete latestQueryRef.current[id];
    delete lastEstimateSignatureRef.current[id];
  };

  const scheduleSuggestionFetch = (id, query) => {
    if (suggestionTimersRef.current[id]) {
      clearTimeout(suggestionTimersRef.current[id]);
    }

    if (!query || query.trim().length < 2) {
      latestQueryRef.current[id] = query || '';
      setIngredientSuggestions((prev) => ({ ...prev, [id]: [] }));
      setSuggestionsLoading((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }

    latestQueryRef.current[id] = query;
    suggestionTimersRef.current[id] = setTimeout(async () => {
      setSuggestionsLoading((prev) => ({ ...prev, [id]: true }));
      try {
        const suggestions = await fetchIngredientSuggestions(query);
        if (latestQueryRef.current[id] !== query) {
          return;
        }
        setIngredientSuggestions((prev) => ({ ...prev, [id]: suggestions }));
      } catch (error) {
        console.error('Failed to fetch ingredient suggestions:', error);
        setIngredientSuggestions((prev) => ({ ...prev, [id]: [] }));
      } finally {
        setSuggestionsLoading((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    }, 350);
  };

  const triggerNutritionEstimate = async (id, ingredient, suggestion) => {
    if (!suggestion || !ingredient) {
      return;
    }

    const amount = Number(ingredient.amount);
    if (!ingredient.unit || !Number.isFinite(amount) || amount <= 0) {
      lastEstimateSignatureRef.current[id] = null;
      return;
    }

    const suggestionKey = suggestion.id || suggestion.name;
    const signature = `${suggestionKey}|${amount}|${ingredient.unit}`;
    if (lastEstimateSignatureRef.current[id] === signature) {
      return;
    }

    lastEstimateSignatureRef.current[id] = signature;
    setEstimateLoading((prev) => ({ ...prev, [id]: true }));

    try {
      const estimate = await estimateIngredientNutrition({
        ingredientName: suggestion.name,
        amount,
        unit: ingredient.unit,
        suggestionId: suggestion.id
      });

      if (!estimate) {
        return;
      }

      setEditedData((prev) => {
        const ingredients = prev.ingredients.map((entry) => {
          if (entry.id !== id) {
            return entry;
          }

          const updated = { ...entry };
          NUTRIENT_FIELDS.forEach((field) => {
            if (field === 'amount' || field === 'unit') {
              return;
            }
            const value = Number(estimate[field]);
            if (Number.isFinite(value) && value >= 0) {
              updated[field] = value;
            }
          });

          updated._perUnit = computePerUnit(updated);
          return updated;
        });

        const totals = calculateTotals(ingredients);
        return {
          ...prev,
          ...totals,
          ingredients
        };
      });
    } catch (error) {
      console.error('Failed to estimate ingredient nutrition:', error);
      lastEstimateSignatureRef.current[id] = null;
    } finally {
      setEstimateLoading((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  useEffect(() => {
    (editedData.ingredients || []).forEach((ingredient) => {
      const suggestion = selectedSuggestions[ingredient.id];
      if (!suggestion) {
        return;
      }
      triggerNutritionEstimate(ingredient.id, ingredient, suggestion);
    });
  }, [editedData.ingredients, selectedSuggestions]);

  const handleBasicFieldChange = (field, value) => {
    setEditedData((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const handleIngredientNameInput = (id, value) => {
    const nextValue = value;

    setSelectedSuggestions((prev) => {
      const current = prev[id];
      if (!current) {
        return prev;
      }

      if (nextValue.trim().toLowerCase() !== current.name.toLowerCase()) {
        const next = { ...prev };
        delete next[id];
        lastEstimateSignatureRef.current[id] = null;
        return next;
      }

      return prev;
    });

    handleIngredientChange(id, 'name', nextValue);
    scheduleSuggestionFetch(id, nextValue);
  };

  const handleSuggestionSelect = (id, suggestion) => {
    setIngredientSuggestions((prev) => ({ ...prev, [id]: [] }));
    setSelectedSuggestions((prev) => ({ ...prev, [id]: suggestion }));
    latestQueryRef.current[id] = suggestion.name;
    lastEstimateSignatureRef.current[id] = null;

    setEditedData((prev) => {
      const ingredients = prev.ingredients.map((ingredient) => {
        if (ingredient.id !== id) {
          return ingredient;
        }

        const updated = { ...ingredient, name: suggestion.name };
        if (suggestion.typical_unit) {
          updated.unit = canonicalizeUnit(suggestion.typical_unit);
        }
        updated._perUnit = computePerUnit(updated);
        return updated;
      });

      const totals = calculateTotals(ingredients);
      return {
        ...prev,
        ...totals,
        ingredients
      };
    });
  };

  const handleIngredientChange = (id, field, value) => {
    setEditedData((prev) => {
      const ingredients = prev.ingredients.map((ingredient) => {
        if (ingredient.id !== id) {
          return ingredient;
        }

        if (field === 'name') {
          return { ...ingredient, name: value };
        }

        if (field === 'unit') {
          return { ...ingredient, unit: value };
        }

        if (field === 'amount') {
          const numericAmount = Math.max(0, parseFloat(value) || 0);
          const perUnit = ingredient._perUnit || computePerUnit(ingredient);
          const updated = {
            ...ingredient,
            amount: numericAmount,
          };
          NUTRIENT_FIELDS.forEach((nutrient) => {
            const density = perUnit[nutrient] ?? 0;
            updated[nutrient] = numericAmount > 0 ? Number((density * numericAmount).toFixed(2)) : 0;
          });
          updated._perUnit = perUnit;
          return updated;
        }

        if (NUTRIENT_FIELDS.includes(field)) {
          const numericValue = Math.max(0, parseFloat(value) || 0);
          const safeAmount = Number(ingredient.amount) > 0 ? Number(ingredient.amount) : 1;
          const perUnit = { ...(ingredient._perUnit || computePerUnit(ingredient)) };
          perUnit[field] = safeAmount > 0 ? numericValue / safeAmount : 0;
          return {
            ...ingredient,
            [field]: numericValue,
            _perUnit: perUnit
          };
        }

        return ingredient;
      });

      const totals = calculateTotals(ingredients);

      return {
        ...prev,
        ...totals,
        ingredients
      };
    });
  };

  const handleAddIngredient = () => {
    setEditedData((prev) => {
      const nextIngredient = normalizeIngredient(
        {
          id: generateIngredientId(),
          name: 'New ingredient',
          amount: 100,
          unit: 'g',
          ...createEmptyNutrients()
        },
        prev.ingredients?.length || 0
      );
      nextIngredient._perUnit = computePerUnit(nextIngredient);
      const ingredients = [...(prev.ingredients || []), nextIngredient];
      const totals = calculateTotals(ingredients);

      return {
        ...prev,
        ...totals,
        ingredients
      };
    });
  };

  const handleRemoveIngredient = (id) => {
    clearIngredientAiState(id);
    setExpandedIngredientId((prevExpanded) => (prevExpanded === id ? null : prevExpanded));
    setEditedData((prev) => {
      const remaining = (prev.ingredients || []).filter((ingredient) => ingredient.id !== id);
      const ingredients =
        remaining.length > 0
          ? remaining
          : [
              normalizeIngredient(
                {
                  id: generateIngredientId(),
                  name: 'New ingredient',
                  amount: 0,
                  unit: 'g',
                  ...createEmptyNutrients()
                },
                0
              )
            ];
      const totals = calculateTotals(ingredients);

      return {
        ...prev,
        ...totals,
        ingredients
      };
    });
  };

  const handlePhotoSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const dataUrl = await getDataUrlFromFile(file);
      setEditedData((prev) => ({
        ...prev,
        photo_url: dataUrl
      }));
    } catch (error) {
      console.error('Failed to process the selected photo:', error);
    }
  };

  const handleSaveMeal = () => {
    onSave(sanitizeMealForSave(editedData));
  };

  const nutritionFields = [
    { key: 'calories', label: 'Calories', unit: 'cal' },
    { key: 'protein', label: 'Protein', unit: 'g' },
    { key: 'carbs', label: 'Carbohydrates', unit: 'g' },
    { key: 'fat', label: 'Fat', unit: 'g' },
    { key: 'fiber', label: 'Fiber', unit: 'g' },
    { key: 'sugar', label: 'Sugar', unit: 'g' },
    { key: 'sodium', label: 'Sodium', unit: 'mg' },
    { key: 'potassium', label: 'Potassium', unit: 'mg' },
    { key: 'calcium', label: 'Calcium', unit: 'mg' },
    { key: 'iron', label: 'Iron', unit: 'mg' },
    { key: 'vitamin_c', label: 'Vitamin C', unit: 'mg' },
    { key: 'vitamin_a', label: 'Vitamin A', unit: 'IU' }
  ];

  return (
    <div className="space-y-6">
      {/* Ingredient Breakdown */}
      <Card className="border-0 shadow-lg rounded-2xl">
        <CardHeader className="p-6 pb-4">
          <CardTitle className="text-xl text-gray-900">Ingredient Breakdown</CardTitle>
          <p className="text-sm text-gray-600 mt-2">
            Adjust the detected ingredient portions or add new ones. Nutrient totals update automatically based on your entries.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto overflow-y-visible">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-6 py-3 text-left w-[22rem]">Ingredient</th>
                  <th className="px-4 py-3 text-left w-32">Amount</th>
                  <th className="px-4 py-3 text-left w-36">Unit</th>
                  <th className="px-4 py-3 text-left w-28">Calories</th>
                  <th className="px-4 py-3 text-left w-28">Protein (g)</th>
                  <th className="px-4 py-3 text-left w-28">Carbs (g)</th>
                  <th className="px-4 py-3 text-left w-28">Fat (g)</th>
                  <th className="px-4 py-3 text-right w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {(editedData.ingredients || []).map((ingredient) => {
                  const suggestionsForIngredient = ingredientSuggestions[ingredient.id] || [];
                  const isFetchingSuggestions = Boolean(suggestionsLoading[ingredient.id]);
                  const selectedSuggestion = selectedSuggestions[ingredient.id];

                  return (
                    <React.Fragment key={ingredient.id}>
                      <tr>
                        <td className="px-6 py-4 align-top relative w-[22rem]">
                          <div className="relative">
                            <Input
                              value={ingredient.name}
                              onChange={(event) => handleIngredientNameInput(ingredient.id, event.target.value)}
                              placeholder="e.g. Grilled chicken"
                              className="w-full rounded-xl border-gray-200 pr-10"
                            />
                            {isFetchingSuggestions && (
                              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />
                            )}
                            {(isFetchingSuggestions || suggestionsForIngredient.length > 0) && (
                              <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-64 min-w-[20rem] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl">
                                {suggestionsForIngredient.length === 0 ? (
                                  <div className="flex items-center gap-2 px-4 py-3 text-sm text-gray-500">
                                    {isFetchingSuggestions ? (
                                      <>
                                        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                                        <span>Fetching suggestions…</span>
                                      </>
                                    ) : (
                                      <span>No suggestions found</span>
                                    )}
                                  </div>
                                ) : (
                                  <ul className="divide-y divide-gray-100">
                                    {suggestionsForIngredient.map((suggestion) => (
                                      <li key={`${ingredient.id}-${suggestion.id || suggestion.name}`}>
                                        <button
                                          type="button"
                                          className="block w-full px-4 py-3 text-left hover:bg-gray-50"
                                          onClick={() => handleSuggestionSelect(ingredient.id, suggestion)}
                                        >
                                          <div className="font-medium text-gray-900">{suggestion.name}</div>
                                          {suggestion.description && (
                                            <div className="text-xs text-gray-500 mt-1">{suggestion.description}</div>
                                          )}
                                          {suggestion.example_portion && (
                                            <div className="text-xs text-gray-400 mt-1">
                                              Example: {suggestion.example_portion}
                                            </div>
                                          )}
                                          {suggestion.data_source && (
                                            <div className="text-[10px] uppercase tracking-wide text-gray-300 mt-2">
                                              {suggestion.data_source === 'openai'
                                                ? 'AI suggestion'
                                                : suggestion.data_source === 'fallback'
                                                  ? 'Reference library'
                                                  : 'Suggested value'}
                                            </div>
                                          )}
                                        </button>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-2">
                            {formatUnitLabel(ingredient.unit)} detected
                          </p>
                          {selectedSuggestion && (
                            <p className="text-xs text-emerald-600 mt-1">
                              {selectedSuggestion.data_source === 'openai'
                                ? 'AI suggestion'
                                : 'Suggested value'}: {selectedSuggestion.name}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-4 align-top">
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            value={ingredient.amount}
                            onChange={(event) => handleIngredientChange(ingredient.id, 'amount', event.target.value)}
                            className="rounded-xl border-gray-200"
                          />
                        </td>
                        <td className="px-4 py-4 align-top">
                          <Select
                            value={ingredient.unit}
                            onValueChange={(value) => handleIngredientChange(ingredient.id, 'unit', value)}
                          >
                            <SelectTrigger className="rounded-xl border-gray-200">
                              <SelectValue placeholder="Select unit" />
                            </SelectTrigger>
                            <SelectContent>
                              {UNIT_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min="0"
                              step="1"
                              value={ingredient.calories}
                              onChange={(event) => handleIngredientChange(ingredient.id, 'calories', event.target.value)}
                              className="rounded-xl border-gray-200"
                            />
                            {estimateLoading[ingredient.id] && (
                              <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <Input
                            type="number"
                            min="0"
                            step="0.1"
                            value={ingredient.protein}
                            onChange={(event) => handleIngredientChange(ingredient.id, 'protein', event.target.value)}
                            className="rounded-xl border-gray-200"
                          />
                        </td>
                        <td className="px-4 py-4 align-top">
                          <Input
                            type="number"
                            min="0"
                            step="0.1"
                            value={ingredient.carbs}
                            onChange={(event) => handleIngredientChange(ingredient.id, 'carbs', event.target.value)}
                            className="rounded-xl border-gray-200"
                          />
                        </td>
                        <td className="px-4 py-4 align-top">
                          <Input
                            type="number"
                            min="0"
                            step="0.1"
                            value={ingredient.fat}
                            onChange={(event) => handleIngredientChange(ingredient.id, 'fat', event.target.value)}
                            className="rounded-xl border-gray-200"
                          />
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-9 w-9 rounded-xl border-gray-200"
                              onClick={() =>
                                setExpandedIngredientId((prev) =>
                                  prev === ingredient.id ? null : ingredient.id
                                )
                              }
                            >
                              {expandedIngredientId === ingredient.id ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              className="h-9 w-9 rounded-xl"
                              onClick={() => handleRemoveIngredient(ingredient.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {expandedIngredientId === ingredient.id && (
                        <tr>
                          <td colSpan={8} className="px-6 pb-6">
                            <div className="mt-2 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
                              <p className="text-sm font-medium text-emerald-800">
                                Micronutrients
                              </p>
                              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                {MICRO_NUTRIENTS.map((field) => (
                                  <div key={field} className="space-y-1">
                                    <Label className="text-xs font-medium text-emerald-900">
                                      {nutritionFields.find((item) => item.key === field)?.label}
                                    </Label>
                                    <Input
                                      type="number"
                                      min="0"
                                      step={field === 'sodium' || field === 'potassium' || field === 'calcium' ? '1' : '0.1'}
                                      value={ingredient[field]}
                                      onChange={(event) =>
                                        handleIngredientChange(ingredient.id, field, event.target.value)
                                      }
                                      className="rounded-xl border-emerald-100 bg-white/70 focus:border-emerald-300 focus:ring-emerald-200"
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 p-6 border-t border-gray-100 bg-gray-50/80">
            <Button
              type="button"
              variant="outline"
              onClick={handleAddIngredient}
              className="self-start rounded-xl border-emerald-200 text-emerald-700 hover:bg-emerald-50"
            >
              <Plus className="mr-2 h-4 w-4" /> Add ingredient
            </Button>
            <p className="text-xs text-gray-500">
              Tip: Adjust the portion sizes to match what you actually ate. All nutrient totals below will reflect these changes instantly.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Photo Preview */}
      <Card className="border-0 shadow-lg rounded-2xl overflow-hidden">
        <CardContent className="p-0">
          <img
            src={editedData.photo_url}
            alt="Analyzed meal"
            className="w-full h-48 object-cover"
          />
          {allowPhotoChange && (
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
              <Button
                type="button"
                variant="outline"
                className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus className="w-4 h-4 mr-2" />
                Change photo
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoSelect}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Meal Details */}
      <Card className="border-0 shadow-lg rounded-2xl">
        <CardHeader className="p-6">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Edit3 className="w-6 h-6 text-emerald-600" />
            Review & Edit Details
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          {/* Basic Info */}
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="meal_name" className="text-sm font-medium text-gray-700">Meal Name</Label>
              <Input
                id="meal_name"
                value={editedData.meal_name || ''}
                onChange={(event) => handleBasicFieldChange('meal_name', event.target.value)}
                className="mt-2 rounded-xl border-gray-200 focus:border-emerald-300 focus:ring-emerald-200"
              />
            </div>

            <div>
              <Label htmlFor="meal_type" className="text-sm font-medium text-gray-700">Meal Type</Label>
              <Select
                value={editedData.meal_type || 'lunch'}
                onValueChange={(value) => handleBasicFieldChange('meal_type', value)}
              >
                <SelectTrigger className="mt-2 rounded-xl border-gray-200">
                  <SelectValue placeholder="Select meal type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="breakfast">Breakfast</SelectItem>
                  <SelectItem value="lunch">Lunch</SelectItem>
                  <SelectItem value="dinner">Dinner</SelectItem>
                  <SelectItem value="snack">Snack</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="meal_date" className="text-sm font-medium text-gray-700">Date</Label>
              <Input
                id="meal_date"
                type="date"
                value={editedData.meal_date || ''}
                onChange={(event) => handleBasicFieldChange('meal_date', event.target.value)}
                className="mt-2 rounded-xl border-gray-200 focus:border-emerald-300 focus:ring-emerald-200"
              />
            </div>
          </div>

          {/* Nutrition Grid */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Nutritional Information</h3>
              <span className="text-xs text-gray-500">Totals update from the ingredient table above</span>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {nutritionFields.map((field) => (
                <div key={field.key} className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">
                    {field.label} ({field.unit})
                  </Label>
                  <Input
                    id={field.key}
                    type="number"
                    readOnly
                    value={formatTotalValue(field.key, editedData[field.key])}
                    className="rounded-xl border-gray-200 bg-gray-50 text-gray-700"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="notes" className="text-sm font-medium text-gray-700">Notes (Optional)</Label>
            <Textarea
              id="notes"
              value={editedData.notes || ''}
              onChange={(event) => handleBasicFieldChange('notes', event.target.value)}
              placeholder="Add any additional notes about this meal..."
              className="mt-2 rounded-xl border-gray-200 focus:border-emerald-300 focus:ring-emerald-200"
              rows={3}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 pt-4">
            <Button
              onClick={handleSaveMeal}
              disabled={isSaving}
              className="bg-emerald-600 hover:bg-emerald-700 px-8 py-3 rounded-xl flex items-center gap-2 flex-1 sm:flex-none"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Save Meal
                </>
              )}
            </Button>

            <Button
              variant="outline"
              onClick={onCancel}
              disabled={isSaving}
              className="border-gray-200 hover:bg-gray-50 px-8 py-3 rounded-xl flex-1 sm:flex-none"
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
