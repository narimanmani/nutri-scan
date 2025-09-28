import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Activity } from "lucide-react";

export default function NutritionChart({ meals, isLoading }) {
  if (isLoading) {
    return (
      <Card className="border-0 shadow-lg rounded-2xl animate-pulse">
        <CardHeader className="p-6">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="h-64 bg-gray-200 rounded"></div>
        </CardContent>
      </Card>
    );
  }

  const totalNutrition = meals.reduce(
    (acc, meal) => ({
      protein: acc.protein + (meal.protein || 0),
      carbs: acc.carbs + (meal.carbs || 0),
      fat: acc.fat + (meal.fat || 0),
    }),
    { protein: 0, carbs: 0, fat: 0 }
  );

  const macroData = [
    { name: 'Protein', value: totalNutrition.protein, color: '#10b981' },
    { name: 'Carbs', value: totalNutrition.carbs, color: '#3b82f6' },
    { name: 'Fat', value: totalNutrition.fat, color: '#f59e0b' },
  ].filter(item => item.value > 0);

  const micronutrients = meals.reduce(
    (acc, meal) => ({
      fiber: acc.fiber + (meal.fiber || 0),
      sodium: acc.sodium + (meal.sodium || 0),
      calcium: acc.calcium + (meal.calcium || 0),
      iron: acc.iron + (meal.iron || 0),
      vitamin_c: acc.vitamin_c + (meal.vitamin_c || 0),
    }),
    { fiber: 0, sodium: 0, calcium: 0, iron: 0, vitamin_c: 0 }
  );

  const microData = [
    { name: 'Fiber (g)', value: micronutrients.fiber },
    { name: 'Sodium (mg)', value: micronutrients.sodium },
    { name: 'Calcium (mg)', value: micronutrients.calcium },
    { name: 'Iron (mg)', value: micronutrients.iron },
    { name: 'Vitamin C (mg)', value: micronutrients.vitamin_c },
  ].filter(item => item.value > 0);

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* Macronutrients Pie Chart */}
      <Card className="border-0 shadow-lg rounded-2xl">
        <CardHeader className="p-6">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="w-5 h-5 text-emerald-600" />
            Macronutrients
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          {macroData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={macroData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {macroData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `${value}g`} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-500">
              No nutrition data for today
            </div>
          )}
        </CardContent>
      </Card>

      {/* Micronutrients Bar Chart */}
      <Card className="border-0 shadow-lg rounded-2xl">
        <CardHeader className="p-6">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="w-5 h-5 text-emerald-600" />
            Micronutrients
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          {microData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={microData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-500">
              No micronutrient data for today
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}