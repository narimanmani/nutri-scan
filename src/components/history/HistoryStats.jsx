import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Calendar, TrendingUp, Target } from "lucide-react";
import { format, startOfWeek, endOfWeek, isWithinInterval, startOfMonth, endOfMonth } from "date-fns";

export default function HistoryStats({ meals, isLoading }) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Array(4).fill(0).map((_, i) => (
          <Card key={i} className="border-0 shadow-lg rounded-2xl animate-pulse">
            <CardHeader className="p-6">
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </CardHeader>
            <CardContent className="p-6 pt-0">
              <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const weekMeals = meals.filter(meal =>
    isWithinInterval(new Date(meal.meal_date || meal.created_date), {
      start: weekStart,
      end: weekEnd
    })
  );

  const monthMeals = meals.filter(meal =>
    isWithinInterval(new Date(meal.meal_date || meal.created_date), {
      start: monthStart,
      end: monthEnd
    })
  );

  const weekCalories = weekMeals.reduce((sum, meal) => sum + (meal.calories || 0), 0);
  const monthCalories = monthMeals.reduce((sum, meal) => sum + (meal.calories || 0), 0);
  const avgDailyCalories = Math.round(monthCalories / 30);

  const topMealType = meals.reduce((acc, meal) => {
    acc[meal.meal_type] = (acc[meal.meal_type] || 0) + 1;
    return acc;
  }, {});
  
  const mostFrequentMealType = Object.entries(topMealType)
    .sort(([,a], [,b]) => b - a)[0]?.[0] || 'N/A';

  const statsData = [
    {
      title: "This Week",
      value: weekCalories.toLocaleString(),
      subtitle: "calories consumed",
      icon: Calendar,
      color: "bg-emerald-500"
    },
    {
      title: "This Month", 
      value: monthCalories.toLocaleString(),
      subtitle: "total calories",
      icon: BarChart,
      color: "bg-blue-500"
    },
    {
      title: "Daily Average",
      value: avgDailyCalories.toLocaleString(),
      subtitle: "calories per day",
      icon: TrendingUp,
      color: "bg-purple-500"
    },
    {
      title: "Most Common",
      value: mostFrequentMealType.charAt(0).toUpperCase() + mostFrequentMealType.slice(1),
      subtitle: "meal type",
      icon: Target,
      color: "bg-orange-500"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {statsData.map((stat, index) => (
        <Card key={index} className="border-0 shadow-lg rounded-2xl hover:shadow-xl transition-all duration-300 overflow-hidden">
          <div className={`h-2 ${stat.color}`}></div>
          <CardHeader className="p-6 pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-gray-600">{stat.title}</CardTitle>
              <div className={`p-2 rounded-lg bg-opacity-20 ${stat.color.replace('bg-', 'bg-')}`}>
                <stat.icon className={`w-4 h-4 ${stat.color.replace('bg-', 'text-')}`} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6 pt-0">
            <div className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">{stat.value}</div>
            <p className="text-sm text-gray-500">{stat.subtitle}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}