import { useMemo } from 'react';
import { format, isSameDay, startOfDay, subDays } from 'date-fns';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/card';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

const MACRO_LABELS = {
  calories: 'Calories',
  protein: 'Protein',
  carbs: 'Carbs',
  fat: 'Fat',
};

const MACRO_UNITS = {
  calories: 'kcal',
  protein: 'g',
  carbs: 'g',
  fat: 'g',
};

const MACRO_COLORS = {
  calories: '#fb923c',
  protein: '#10b981',
  carbs: '#3b82f6',
  fat: '#facc15',
};

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function parseMealDate(meal) {
  if (!meal) {
    return null;
  }

  const candidates = [meal.meal_date, meal.created_date];
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    if (candidate instanceof Date) {
      if (!Number.isNaN(candidate.getTime())) {
        return startOfDay(candidate);
      }
      continue;
    }

    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime())) {
      return startOfDay(parsed);
    }
  }

  return null;
}

function TrendDot({ cx, cy, value, payload, macro }) {
  if (typeof cx !== 'number' || typeof cy !== 'number') {
    return null;
  }

  const target = payload?.[`${macro}Target`] ?? 0;
  const isAbove = value >= target && target > 0;
  const isBelow = value < target && target > 0;

  const fill = isAbove ? '#f97316' : isBelow ? '#ef4444' : MACRO_COLORS[macro] || '#0ea5e9';

  return (
    <g>
      <circle cx={cx} cy={cy} r={5} fill={fill} stroke="white" strokeWidth={1.5} />
    </g>
  );
}

export default function MacroTrendCharts({ meals = [], plan, referenceDate = new Date() }) {
  const macroTargets = plan?.macroTargets || {};
  const macros = Object.keys(MACRO_LABELS).filter(
    (key) => toNumber(macroTargets[key]) > 0,
  );

  const parsedMeals = useMemo(
    () =>
      (Array.isArray(meals) ? meals : [])
        .map((meal) => ({
          meal,
          date: parseMealDate(meal),
        }))
        .filter((entry) => entry.date !== null),
    [meals],
  );

  const chartData = useMemo(() => {
    const endDate = startOfDay(referenceDate || new Date());
    const dataPoints = [];

    for (let i = 9; i >= 0; i -= 1) {
      const date = startOfDay(subDays(endDate, i));
      const label = format(date, 'MMM d');

      const dayEntries = parsedMeals.filter((entry) => isSameDay(entry.date, date));
      const totals = macros.reduce((acc, macro) => {
        acc[`${macro}Actual`] = dayEntries.reduce(
          (sum, entry) => sum + toNumber(entry.meal?.[macro]),
          0,
        );
        acc[`${macro}Target`] = toNumber(macroTargets[macro]);
        return acc;
      }, {});

      dataPoints.push({
        date,
        label,
        ...totals,
      });
    }

    return dataPoints;
  }, [macros, macroTargets, parsedMeals, referenceDate]);

  const summaries = useMemo(() => {
    return macros.reduce((acc, macro) => {
      const target = toNumber(macroTargets[macro]);
      if (chartData.length === 0) {
        acc[macro] = { target, average: 0, difference: 0 };
        return acc;
      }

      const totalActual = chartData.reduce(
        (sum, day) => sum + toNumber(day[`${macro}Actual`]),
        0,
      );

      const average = chartData.length > 0 ? totalActual / chartData.length : 0;
      const difference = average - target;

      acc[macro] = { target, average, difference };
      return acc;
    }, {});
  }, [chartData, macroTargets, macros]);

  if (macros.length === 0) {
    return null;
  }

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="border-b border-gray-100">
        <CardTitle className="text-lg">
          10-day macro trends
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 p-6">
        <p className="text-sm text-gray-500">
          Compare your intake over the last 10 days against the selected plan&apos;s targets. Dots turn orange when you
          exceed the target and red when you fall short.
        </p>
        <div className="space-y-8">
          {macros.map((macro) => {
            const label = MACRO_LABELS[macro] || macro;
            const unit = MACRO_UNITS[macro] || '';
            const summary = summaries[macro] || { target: 0, average: 0, difference: 0 };
            const differenceRounded = Math.round(summary.difference);
            const differenceLabel = differenceRounded === 0
              ? 'on target on average'
              : differenceRounded > 0
                ? `${Math.abs(differenceRounded)} ${unit} above target`
                : `${Math.abs(differenceRounded)} ${unit} below target`;

            return (
              <div key={macro} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-700">{label}</p>
                    <p className="text-xs text-gray-500">Daily target: {Math.round(summary.target)} {unit}</p>
                  </div>
                  <span className="text-xs font-medium text-gray-600">{differenceLabel}</span>
                </div>
                <div className="h-48 w-full">
                  <ResponsiveContainer>
                    <LineChart data={chartData} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="4 4" stroke="#e5e7eb" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} width={60} />
                      <Tooltip
                        formatter={(value, name) => {
                          if (name.endsWith('Target')) {
                            return [`${Math.round(value)} ${unit}`, 'Target'];
                          }
                          return [`${Math.round(value)} ${unit}`, 'Actual'];
                        }}
                        labelFormatter={(value) => `Date: ${value}`}
                      />
                      <Legend formatter={(value) => (value.endsWith('Target') ? 'Target' : 'Actual')} />
                      <Line
                        type="monotone"
                        dataKey={`${macro}Target`}
                        stroke="#94a3b8"
                        strokeWidth={2}
                        dot={false}
                        strokeDasharray="5 5"
                        name={`${label} target`}
                      />
                      <Line
                        type="monotone"
                        dataKey={`${macro}Actual`}
                        stroke={MACRO_COLORS[macro] || '#0ea5e9'}
                        strokeWidth={2}
                        dot={(props) => <TrendDot {...props} macro={macro} />}
                        activeDot={{ r: 6 }}
                        name={`${label} actual`}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
