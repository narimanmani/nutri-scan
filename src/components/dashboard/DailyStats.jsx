import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DailyStats({ calories, protein, carbs, fat }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card className="bg-white border-0 shadow-md rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-600">Calories</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-gray-900">{calories || 0}</div>
        </CardContent>
      </Card>
      
      <Card className="bg-white border-0 shadow-md rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-600">Protein</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-emerald-600">{protein || 0}g</div>
        </CardContent>
      </Card>
      
      <Card className="bg-white border-0 shadow-md rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-600">Carbs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-blue-600">{carbs || 0}g</div>
        </CardContent>
      </Card>
      
      <Card className="bg-white border-0 shadow-md rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-600">Fat</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-orange-600">{fat || 0}g</div>
        </CardContent>
      </Card>
    </div>
  );
}