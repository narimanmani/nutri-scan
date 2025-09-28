import { endOfDay, format, isWithinInterval, parseISO, startOfDay, subDays } from "date-fns";

const NUTRIENT_KEYS = ["calories", "protein", "carbs", "fat", "fiber", "sugar", "sodium", "potassium", "calcium", "iron", "vitamin_c", "vitamin_a"];

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function ensureDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number") {
    const dateFromNumber = new Date(value);
    return Number.isNaN(dateFromNumber.getTime()) ? null : dateFromNumber;
  }

  if (typeof value === "string") {
    const parsed = parseISO(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }

    const fallback = new Date(value);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  return null;
}

function getMealDate(meal) {
  return ensureDate(meal.meal_date) || ensureDate(meal.created_date) || null;
}

function sumNutrient(meals, key) {
  return meals.reduce((total, meal) => total + toNumber(meal?.[key]), 0);
}

function uniqueDayCount(entries) {
  const days = new Set();
  entries.forEach((entry) => {
    days.add(format(entry.date, "yyyy-MM-dd"));
  });
  return days.size;
}

export function buildDashboardStats(meals, referenceDate = new Date()) {
  const safeMeals = Array.isArray(meals) ? meals : [];
  const entries = safeMeals
    .map((meal) => ({ meal, date: getMealDate(meal) }))
    .filter((entry) => entry.date !== null);

  const todayStart = startOfDay(referenceDate);
  const todayEnd = endOfDay(referenceDate);
  const weekStart = startOfDay(subDays(referenceDate, 6));
  const monthStart = startOfDay(subDays(referenceDate, 29));

  const filterByRange = (start, end) =>
    entries.filter((entry) =>
      isWithinInterval(entry.date, { start, end })
    );

  const todayEntries = filterByRange(todayStart, todayEnd);
  const weekEntries = filterByRange(weekStart, todayEnd);
  const monthEntries = filterByRange(monthStart, todayEnd);

  const toMeals = (list) => list.map((entry) => entry.meal);

  const todayMeals = toMeals(todayEntries);
  const weekMeals = toMeals(weekEntries);
  const monthMeals = toMeals(monthEntries);

  const totalsToday = {
    calories: sumNutrient(todayMeals, "calories"),
    protein: sumNutrient(todayMeals, "protein"),
    carbs: sumNutrient(todayMeals, "carbs"),
    fat: sumNutrient(todayMeals, "fat"),
  };

  const totalsWeek = {
    calories: sumNutrient(weekMeals, "calories"),
    protein: sumNutrient(weekMeals, "protein"),
    carbs: sumNutrient(weekMeals, "carbs"),
    fat: sumNutrient(weekMeals, "fat"),
  };

  const totalsMonth = {
    calories: sumNutrient(monthMeals, "calories"),
  };

  const totalsAllTime = NUTRIENT_KEYS.reduce((acc, key) => {
    acc[key] = sumNutrient(safeMeals, key);
    return acc;
  }, {});

  const weekActiveDays = weekEntries.length > 0 ? uniqueDayCount(weekEntries) : 0;
  const averageWeekCalories = weekActiveDays > 0
    ? Math.round(totalsWeek.calories / weekActiveDays)
    : 0;

  const totalMeals = safeMeals.length;
  const averageMealCalories = totalMeals > 0
    ? Math.round(totalsAllTime.calories / totalMeals)
    : 0;

  let lastLoggedEntry = null;
  for (const entry of entries) {
    if (!lastLoggedEntry || entry.date > lastLoggedEntry.date) {
      lastLoggedEntry = entry;
    }
  }

  return {
    todayMeals,
    weekMeals,
    monthMeals,
    totals: {
      today: totalsToday,
      week: totalsWeek,
      month: totalsMonth,
      allTime: totalsAllTime,
    },
    counts: {
      total: totalMeals,
      today: todayMeals.length,
      week: weekMeals.length,
      month: monthMeals.length,
      weekActiveDays,
    },
    averages: {
      weekDailyCalories: averageWeekCalories,
      mealCalories: averageMealCalories,
    },
    lastMeal: lastLoggedEntry ? lastLoggedEntry.meal : null,
    lastMealDate: lastLoggedEntry ? lastLoggedEntry.date : null,
  };
}
