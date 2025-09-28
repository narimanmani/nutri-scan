import React, { useState, useEffect } from "react";
import { Meal } from "@/api/entities";
import { format, isToday, startOfDay, endOfDay } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Camera, TrendingUp, Target, Activity, Plus } from "lucide-react";

import DailyStats from "../components/dashboard/DailyStats";
import NutritionChart from "../components/dashboard/NutritionChart";
import RecentMeals from "../components/dashboard/RecentMeals";
import CalorieProgress from "../components/dashboard/CalorieProgress";

export default function Dashboard() {
  const [meals, setMeals] = useState([]);
  const [todayMeals, setTodayMeals] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadMeals();
  }, []);

  const loadMeals = async () => {
    setIsLoading(true);
    try {
      const allMeals = await Meal.list("-created_date", 50);
      setMeals(allMeals);
      
      const today = allMeals.filter(meal => 
        isToday(new Date(meal.meal_date || meal.created_date))
      );
      setTodayMeals(today);
    } catch (error) {
      console.error("Error loading meals:", error);
    }
    setIsLoading(false);
  };

  const todayCalories = todayMeals.reduce((sum, meal) => sum + (meal.calories || 0), 0);
  const weeklyCalories = meals
    .filter(meal => {
      const mealDate = new Date(meal.meal_date || meal.created_date);
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return mealDate >= weekAgo;
    })
    .reduce((sum, meal) => sum + (meal.calories || 0), 0);

  const avgDailyCalories = Math.round(weeklyCalories / 7);

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
              Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 18 ? 'Afternoon' : 'Evening'}!
            </h1>
            <p className="text-gray-600 text-lg">
              {format(new Date(), 'EEEE, MMMM d, yyyy')}
            </p>
          </div>
          <Link to={createPageUrl("Upload")}>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105">
              <Camera className="w-5 h-5 mr-2" />
              Log New Meal
            </Button>
          </Link>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="bg-white border-0 shadow-lg hover:shadow-xl transition-all duration-300">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-gray-600">Today's Calories</CardTitle>
                <div className="p-2 bg-emerald-100 rounded-lg">
                  <Activity className="w-4 h-4 text-emerald-600" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900 mb-2">{todayCalories}</div>
              <p className="text-sm text-gray-500">
                {todayMeals.length} meals logged
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white border-0 shadow-lg hover:shadow-xl transition-all duration-300">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-gray-600">Weekly Average</CardTitle>
                <div className="p-2 bg-blue-100 rounded-lg">
                  <TrendingUp className="w-4 h-4 text-blue-600" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900 mb-2">{avgDailyCalories}</div>
              <p className="text-sm text-gray-500">
                calories per day
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white border-0 shadow-lg hover:shadow-xl transition-all duration-300">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-gray-600">Total Meals</CardTitle>
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Target className="w-4 h-4 text-purple-600" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900 mb-2">{meals.length}</div>
              <p className="text-sm text-gray-500">
                meals tracked
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-emerald-100">Daily Goal</CardTitle>
                <div className="p-2 bg-white/20 rounded-lg">
                  <Plus className="w-4 h-4 text-white" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold mb-2">2000</div>
              <p className="text-sm text-emerald-100">
                calories target
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <CalorieProgress 
              current={todayCalories}
              target={2000}
              meals={todayMeals}
            />
            <NutritionChart meals={todayMeals} isLoading={isLoading} />
          </div>
          <div>
            <RecentMeals meals={meals.slice(0, 8)} isLoading={isLoading} />
          </div>
        </div>
      </div>
    </div>
  );
}