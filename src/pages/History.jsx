import React, { useState, useEffect, useCallback } from "react";
import { Meal } from "@/api/entities";
import { format, startOfWeek, endOfWeek, isWithinInterval } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter, Calendar } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

import MealHistoryCard from "../components/history/MealHistoryCard";
import HistoryStats from "../components/history/HistoryStats";
import MealDetailsDialog from "@/components/meals/MealDetailsDialog";

export default function HistoryPage() {
  const [meals, setMeals] = useState([]);
  const [filteredMeals, setFilteredMeals] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterPeriod, setFilterPeriod] = useState("all");
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;

    const handleSnapshot = (snapshot) => {
      if (!isMounted || !Array.isArray(snapshot)) {
        return;
      }

      const sorted = [...snapshot].sort((a, b) => {
        const aTime = new Date(a.created_date || a.meal_date || 0).getTime();
        const bTime = new Date(b.created_date || b.meal_date || 0).getTime();
        return bTime - aTime;
      });

      setMeals(sorted);
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

  const applyFilters = useCallback(() => {
    let filtered = [...meals];

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(meal =>
        meal.meal_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        meal.notes?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Meal type filter
    if (filterType !== "all") {
      filtered = filtered.filter(meal => meal.meal_type === filterType);
    }

    // Time period filter
    if (filterPeriod !== "all") {
      const now = new Date();
      if (filterPeriod === "today") {
        const today = format(now, 'yyyy-MM-dd');
        filtered = filtered.filter(meal => 
          format(new Date(meal.meal_date || meal.created_date), 'yyyy-MM-dd') === today
        );
      } else if (filterPeriod === "week") {
        const weekStart = startOfWeek(now, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
        filtered = filtered.filter(meal =>
          isWithinInterval(new Date(meal.meal_date || meal.created_date), {
            start: weekStart,
            end: weekEnd
          })
        );
      } else if (filterPeriod === "month") {
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        filtered = filtered.filter(meal => {
          const mealDate = new Date(meal.meal_date || meal.created_date);
          return mealDate.getMonth() === currentMonth && mealDate.getFullYear() === currentYear;
        });
      }
    }

    setFilteredMeals(filtered);
  }, [filterPeriod, filterType, meals, searchTerm]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  const handleMealSelect = useCallback((meal) => {
    if (!meal) {
      return;
    }

    setSelectedMeal(meal);
    setIsDetailsOpen(true);
  }, []);

  const handleCloseDetails = useCallback((nextOpen) => {
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
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">Meal History</h1>
          <p className="text-gray-600 text-lg">Track your nutrition journey over time</p>
        </div>

        {/* Stats Overview */}
        <HistoryStats meals={meals} isLoading={isLoading} />

        {/* Filters */}
        <Card className="border-0 shadow-lg rounded-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Filter className="w-5 h-5 text-emerald-600" />
              Filter & Search
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search meals or notes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 rounded-xl border-gray-200 focus:border-emerald-300 focus:ring-emerald-200"
                />
              </div>
              
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-full md:w-40 rounded-xl border-gray-200">
                  <SelectValue placeholder="Meal Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="breakfast">Breakfast</SelectItem>
                  <SelectItem value="lunch">Lunch</SelectItem>
                  <SelectItem value="dinner">Dinner</SelectItem>
                  <SelectItem value="snack">Snack</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterPeriod} onValueChange={setFilterPeriod}>
                <SelectTrigger className="w-full md:w-40 rounded-xl border-gray-200">
                  <Calendar className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Time Period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Meals List */}
        <div>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-900">
              {filteredMeals.length} meal{filteredMeals.length !== 1 ? 's' : ''} found
            </h2>
          </div>
          
          <div className="grid gap-6">
            {isLoading ? (
              Array(6).fill(0).map((_, i) => (
                <Card key={i} className="border-0 shadow-lg rounded-2xl animate-pulse">
                  <CardContent className="p-6">
                    <div className="flex gap-4">
                      <div className="w-20 h-20 bg-gray-200 rounded-xl"></div>
                      <div className="flex-1 space-y-3">
                        <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                        <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                        <div className="h-3 bg-gray-200 rounded w-1/4"></div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              filteredMeals.map((meal) => (
                <MealHistoryCard
                  key={meal.id}
                  meal={meal}
                  onSelect={handleMealSelect}
                />
              ))
            )}
          </div>

          {!isLoading && filteredMeals.length === 0 && (
            <Card className="border-0 shadow-lg rounded-2xl">
              <CardContent className="p-12 text-center">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No meals found</h3>
                <p className="text-gray-600">Try adjusting your search terms or filters</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      <MealDetailsDialog
        meal={selectedMeal}
        open={isDetailsOpen}
        onOpenChange={handleCloseDetails}
        onEdit={handleEditMeal}
      />
    </div>
  );
}
