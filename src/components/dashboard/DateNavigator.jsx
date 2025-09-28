import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarIcon } from "lucide-react";
import { DayPicker } from 'react-day-picker';
import { format } from "date-fns";

import 'react-day-picker/dist/style.css';

function formatDayKey(date) {
  return format(date, 'yyyy-MM-dd');
}

export default function DateNavigator({ selectedDate, onSelectDate, meals }) {
  const mealDays = useMemo(() => {
    if (!Array.isArray(meals)) {
      return new Set();
    }
    const set = new Set();
    meals.forEach((meal) => {
      if (!meal) return;
      const raw = meal.meal_date || meal.created_date;
      if (!raw) return;
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) {
        set.add(formatDayKey(parsed));
      }
    });
    return set;
  }, [meals]);

  const modifiers = {
    logged: (date) => mealDays.has(formatDayKey(date)),
  };

  const modifiersClassNames = {
    logged: 'rdp-day_logged'
  };

  return (
    <Card className="border-0 shadow-lg rounded-2xl">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <CalendarIcon className="w-5 h-5 text-emerald-600" />
          Review Past Days
        </CardTitle>
        <p className="text-sm text-gray-500">Select a day to view historical nutrition summaries.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <DayPicker
          mode="single"
          selected={selectedDate}
          onSelect={onSelectDate}
          modifiers={modifiers}
          modifiersClassNames={modifiersClassNames}
          showOutsideDays
          weekStartsOn={1}
          captionLayout="dropdown"
          fromYear={selectedDate.getFullYear() - 1}
          toYear={selectedDate.getFullYear() + 1}
          className="rounded-2xl border border-gray-100 p-3"
        />
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3">
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center border border-emerald-100">
            <CalendarIcon className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm text-emerald-600 font-semibold">Selected day</p>
            <p className="text-base font-medium text-emerald-800">{format(selectedDate, 'EEEE, MMMM d, yyyy')}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
