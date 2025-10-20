import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Clock, Camera } from "lucide-react";

export default function RecentMeals({ meals, isLoading, onSelectMeal }) {
  const mealTypeColors = {
    breakfast: "bg-yellow-100 text-yellow-800 border-yellow-200",
    lunch: "bg-blue-100 text-blue-800 border-blue-200",
    dinner: "bg-purple-100 text-purple-800 border-purple-200",
    snack: "bg-green-100 text-green-800 border-green-200"
  };

  return (
    <Card className="border-0 shadow-lg rounded-2xl">
      <CardHeader className="p-6 border-b border-gray-100">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Clock className="w-5 h-5 text-emerald-600" />
          Recent Meals
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-4 p-6">
            {Array(5).fill(0).map((_, i) => (
              <div key={i} className="flex items-center gap-4 animate-pulse">
                <div className="w-12 h-12 bg-gray-200 rounded-xl"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        ) : meals.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {meals.map((meal) => {
              const hasPhoto = typeof meal.photo_url === 'string' && meal.photo_url.length > 0;
              return (
                <button
                  key={meal.id}
                  type="button"
                  onClick={() => onSelectMeal?.(meal)}
                  className="flex w-full items-center gap-4 p-6 text-left transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl border border-gray-100 bg-gray-100">
                    {hasPhoto ? (
                      <img
                        src={meal.photo_url}
                        alt={meal.meal_name || 'Logged meal photo'}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-emerald-50">
                        <Camera className="h-5 w-5 text-emerald-600" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-gray-900 truncate">{meal.meal_name}</h3>
                      <Badge className={mealTypeColors[meal.meal_type] || mealTypeColors.snack}>
                        {meal.meal_type}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-500 mb-1">User: {meal.userId}</p>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span>{format(new Date(meal.meal_date || meal.created_date), 'MMM d')}</span>
                      <span>{meal.calories || 0} cal</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="p-12 text-center text-gray-500">
            <Camera className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>No meals logged yet</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}