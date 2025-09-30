import { useCallback, useEffect, useMemo, useState } from "react";
import { Meal } from "@/api/entities";
import { format, isSameDay, startOfDay } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Camera, TrendingUp, Target, Activity, Flame } from "lucide-react";
import { buildDashboardStats } from "@/utils/stats";

import DailyStats from "../components/dashboard/DailyStats";
import NutritionChart from "../components/dashboard/NutritionChart";
import RecentMeals from "../components/dashboard/RecentMeals";
import CalorieProgress from "../components/dashboard/CalorieProgress";
import DateNavigator from "../components/dashboard/DateNavigator";
import MealDetailsDialog from "@/components/meals/MealDetailsDialog";

export default function Dashboard() {
  const [meals, setMeals] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;

    const handleSnapshot = (snapshot) => {
      if (!isMounted || !Array.isArray(snapshot)) {
        return;
      }

      const sorted = Array.from(snapshot).sort((a, b) => {
        const aTime = new Date(a.meal_date || a.created_date || 0).getTime();
        const bTime = new Date(b.meal_date || b.created_date || 0).getTime();
        return bTime - aTime;
      });

      setMeals((previous) => {
        if (previous.length === sorted.length && previous.every((meal, index) => meal === sorted[index])) {
          return previous;
        }
        return sorted;
      });
      setIsLoading(false);
    };

    const unsubscribe = Meal.subscribe(handleSnapshot, { immediate: true });

    return () => {
      isMounted = false;
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  const dashboardStats = useMemo(() => buildDashboardStats(meals, selectedDate), [meals, selectedDate]);

  const selectedDayTotals = dashboardStats.totals.today;
  const weeklyCalories = dashboardStats.totals.week.calories;
  const avgDailyCalories = dashboardStats.averages.weekDailyCalories;
  const averageMealCalories = dashboardStats.averages.mealCalories;
  const totalMeals = dashboardStats.counts.total;
  const selectedDayMeals = dashboardStats.todayMeals;

  const isSelectedToday = isSameDay(selectedDate, new Date());
  const selectedDayLabel = isSelectedToday ? 'Today' : format(selectedDate, 'MMM d, yyyy');

  const handleDateSelect = (date) => {
    if (!date) return;
    setSelectedDate(startOfDay(date));
  };

  const handleMealSelect = useCallback((meal) => {
    if (!meal) {
      return;
    }

    setSelectedMeal(meal);
    setIsDetailsOpen(true);
  }, []);

  const handleDetailsChange = useCallback((nextOpen) => {
    setIsDetailsOpen(nextOpen);
    if (!nextOpen) {
      setSelectedMeal(null);
    }
  }, []);

  const handleEditMeal = useCallback(
    (meal) => {
      if (!meal?.id) return;
      navigate(`${createPageUrl("History")}/${meal.id}`);
    },
    [navigate],
  );

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
                <CardTitle className="text-sm font-medium text-gray-600">Calories on {selectedDayLabel}</CardTitle>
                <div className="p-2 bg-emerald-100 rounded-lg">
                  <Activity className="w-4 h-4 text-emerald-600" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900 mb-2">{selectedDayTotals.calories}</div>
              <p className="text-sm text-gray-500">
                {dashboardStats.counts.today} meals logged
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white border-0 shadow-lg hover:shadow-xl transition-all duration-300">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-gray-600">Last 7 Days</CardTitle>
                <div className="p-2 bg-blue-100 rounded-lg">
                  <TrendingUp className="w-4 h-4 text-blue-600" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900 mb-2">{weeklyCalories}</div>
              <p className="text-sm text-gray-500">
                Avg {avgDailyCalories} cal/day · {dashboardStats.counts.weekActiveDays || 0} active days
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
              <div className="text-3xl font-bold text-gray-900 mb-2">{totalMeals}</div>
              <p className="text-sm text-gray-500">
                Last meal {dashboardStats.lastMealDate ? format(dashboardStats.lastMealDate, 'MMM d, yyyy') : '—'}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-emerald-100">Avg Calories / Meal</CardTitle>
                <div className="p-2 bg-white/20 rounded-lg">
                  <Flame className="w-4 h-4 text-white" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold mb-2">{averageMealCalories}</div>
              <p className="text-sm text-emerald-100">
                based on {totalMeals} meals logged
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-900">
            Nutrition snapshot for {isSelectedToday ? 'today' : format(selectedDate, 'MMMM d, yyyy')}
          </h2>
          <DailyStats
            calories={selectedDayTotals.calories}
            protein={selectedDayTotals.protein}
            carbs={selectedDayTotals.carbs}
            fat={selectedDayTotals.fat}
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <CalorieProgress
              current={selectedDayTotals.calories}
              target={2000}
              meals={selectedDayMeals}
              dateLabel={selectedDayLabel}
              onSelectMeal={handleMealSelect}
            />
            <NutritionChart meals={selectedDayMeals} isLoading={isLoading} dateLabel={selectedDayLabel} />
          </div>
          <div>
            <div className="space-y-6">
              <DateNavigator
                selectedDate={selectedDate}
                onSelectDate={handleDateSelect}
                meals={meals}
              />
              <RecentMeals
                meals={meals.slice(0, 8)}
                isLoading={isLoading}
                onSelectMeal={handleMealSelect}
              />
            </div>
          </div>
        </div>
      </div>
      <MealDetailsDialog
        meal={selectedMeal}
        open={isDetailsOpen}
        onOpenChange={handleDetailsChange}
        onEdit={handleEditMeal}
      />
    </div>
  );
}
