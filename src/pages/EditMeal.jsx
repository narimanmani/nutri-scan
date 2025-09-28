import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { Meal } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import NutritionTable from "@/components/upload/NutritionTable";
import { ArrowLeft, Loader2, AlertCircle } from "lucide-react";
import { createPageUrl } from "@/utils";

function normalizeMealForEditing(meal) {
  if (!meal) {
    return null;
  }

  const baseDate = meal.meal_date || meal.created_date;
  let formattedDate = "";
  if (baseDate) {
    const parsed = new Date(baseDate);
    if (!Number.isNaN(parsed.getTime())) {
      formattedDate = format(parsed, "yyyy-MM-dd");
    }
  }

  return {
    ...meal,
    meal_date: formattedDate,
  };
}

export default function EditMealPage() {
  const navigate = useNavigate();
  const { mealId } = useParams();
  const [meal, setMeal] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadMeal() {
      setIsLoading(true);
      setError(null);
      try {
        const existing = await Meal.get(mealId);
        if (!existing) {
          setError("We couldn't find this meal. It may have been removed.");
          setMeal(null);
        } else {
          setMeal(normalizeMealForEditing(existing));
        }
      } catch (loadError) {
        console.error("Failed to load meal for editing:", loadError);
        setError("Failed to load the meal. Please try again.");
      }
      setIsLoading(false);
    }

    loadMeal();
  }, [mealId]);

  const handleSave = async (updatedData) => {
    if (!mealId) return;

    setIsSaving(true);
    setError(null);

    try {
      await Meal.update(mealId, updatedData);
      navigate(createPageUrl("History"));
    } catch (saveError) {
      console.error("Failed to update meal:", saveError);
      setError("Failed to update the meal. Please try again.");
    }

    setIsSaving(false);
  };

  const goBack = () => {
    navigate(createPageUrl("History"));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-emerald-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="outline"
            size="icon"
            onClick={goBack}
            className="rounded-xl border-gray-200 hover:bg-gray-50"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Edit Meal</h1>
            <p className="text-gray-600 mt-1">Update your nutrition log entry</p>
          </div>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6 rounded-xl border-red-200 bg-red-50">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-red-800">{error}</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <Card className="border-0 shadow-xl rounded-2xl animate-pulse">
            <CardHeader className="p-6">
              <CardTitle className="text-lg font-semibold text-gray-300">Loading meal...</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="h-48 bg-gray-200 rounded-2xl" />
              <div className="space-y-3">
                <div className="h-4 bg-gray-200 rounded" />
                <div className="h-4 bg-gray-200 rounded w-1/2" />
                <div className="h-4 bg-gray-200 rounded w-1/3" />
              </div>
            </CardContent>
          </Card>
        ) : meal ? (
          <NutritionTable
            key={meal.id}
            initialData={meal}
            onSave={handleSave}
            onCancel={goBack}
            isSaving={isSaving}
            allowPhotoChange
          />
        ) : (
          <Card className="border-0 shadow-xl rounded-2xl">
            <CardContent className="p-12 text-center space-y-4">
              <AlertCircle className="w-12 h-12 mx-auto text-emerald-500" />
              <h2 className="text-xl font-semibold text-gray-900">Meal not found</h2>
              <p className="text-gray-600">
                We couldn't find the meal you were looking for. It may have been removed or reset.
              </p>
              <Button onClick={goBack} className="bg-emerald-600 hover:bg-emerald-700">
                Back to history
              </Button>
            </CardContent>
          </Card>
        )}

        {isSaving && (
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-20">
            <div className="bg-white rounded-2xl shadow-lg px-6 py-4 flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
              <span className="text-gray-700 font-medium">Saving your changes...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
