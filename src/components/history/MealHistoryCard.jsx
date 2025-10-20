import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ExternalLink } from "lucide-react";

export default function MealHistoryCard({ meal, onSelect }) {
  const mealTypeColors = {
    breakfast: "bg-yellow-100 text-yellow-800 border-yellow-200",
    lunch: "bg-blue-100 text-blue-800 border-blue-200",
    dinner: "bg-purple-100 text-purple-800 border-purple-200",
    snack: "bg-green-100 text-green-800 border-green-200"
  };

  const handleClick = () => {
    if (typeof onSelect === 'function') {
      onSelect(meal);
    }
  };

  const interactiveProps = onSelect
    ? {
        role: 'button',
        tabIndex: 0,
        onClick: handleClick,
        onKeyDown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleClick();
          }
        }
      }
    : {};

  return (
    <Card
      className={`border-0 shadow-lg rounded-2xl transition-all duration-300 ${
        onSelect ? 'hover:shadow-xl hover:-translate-y-0.5 cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-500' : ''
      }`}
      {...interactiveProps}
    >
      <CardContent className="p-6">
        <div className="flex gap-6">
          {/* Photo */}
          <div className="flex-shrink-0">
            <div className="w-20 h-20 rounded-xl overflow-hidden bg-gray-100 relative group">
              <img
                src={meal.photo_url}
                alt={meal.meal_name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'flex';
                }}
              />
              <div className="hidden w-full h-full bg-emerald-100 items-center justify-center">
                <span className="text-emerald-600 text-xs font-medium">No Image</span>
              </div>
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors duration-200">
                <ExternalLink className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="font-semibold text-gray-900 text-lg truncate">{meal.meal_name}</h3>
                  <Badge className={mealTypeColors[meal.meal_type] || mealTypeColors.snack}>
                    {meal.meal_type}
                  </Badge>
                </div>
                <p className="text-xs text-gray-500 mb-2">Logged by: {meal.userId}</p>

                <div className="text-sm text-gray-500 mb-3">
                  {format(new Date(meal.meal_date || meal.created_date), 'EEEE, MMMM d, yyyy')}
                </div>

                {meal.notes && (
                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">{meal.notes}</p>
                )}

                {/* Nutrition Summary */}
                <div className="flex flex-wrap gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <span className="text-gray-500">Calories:</span>
                    <span className="font-medium text-emerald-600">{meal.calories || 0}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-500">Protein:</span>
                    <span className="font-medium text-blue-600">{meal.protein || 0}g</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-500">Carbs:</span>
                    <span className="font-medium text-orange-600">{meal.carbs || 0}g</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-500">Fat:</span>
                    <span className="font-medium text-red-600">{meal.fat || 0}g</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
