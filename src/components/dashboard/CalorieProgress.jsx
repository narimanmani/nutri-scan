import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Target, TrendingUp } from "lucide-react";

export default function CalorieProgress({ current, target, meals }) {
  const percentage = Math.min((current / target) * 100, 100);
  const remaining = Math.max(target - current, 0);
  
  const mealTypeColors = {
    breakfast: "bg-yellow-100 text-yellow-800 border-yellow-200",
    lunch: "bg-blue-100 text-blue-800 border-blue-200", 
    dinner: "bg-purple-100 text-purple-800 border-purple-200",
    snack: "bg-green-100 text-green-800 border-green-200"
  };

  return (
    <Card className="border-0 shadow-lg rounded-2xl overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white p-6">
        <CardTitle className="flex items-center gap-3 text-xl">
          <Target className="w-6 h-6" />
          Today's Progress
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        {/* Progress Bar */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-medium text-gray-700">Calories Consumed</span>
            <span className="text-sm text-gray-500">{current} / {target}</span>
          </div>
          <Progress value={percentage} className="h-3 rounded-full" />
          <div className="flex justify-between items-center mt-2 text-sm">
            <span className="text-emerald-600 font-medium">{percentage.toFixed(0)}% of goal</span>
            <span className="text-gray-500">{remaining} calories remaining</span>
          </div>
        </div>

        {/* Meals Breakdown */}
        {meals.length > 0 && (
          <div>
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Today's Meals
            </h3>
            <div className="space-y-3">
              {meals.map((meal, index) => (
                <div key={meal.id || index} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <Badge className={mealTypeColors[meal.meal_type] || mealTypeColors.snack}>
                      {meal.meal_type}
                    </Badge>
                    <span className="font-medium text-gray-900">{meal.meal_name}</span>
                  </div>
                  <span className="text-emerald-600 font-semibold">{meal.calories || 0} cal</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}