import { useEffect, useMemo, useState } from 'react';
import { format, isSameDay, startOfDay } from 'date-fns';
import { ClipboardList, CheckCircle2, AlertTriangle, XOctagon, Droplet, Flame, CalendarDays } from 'lucide-react';

import { DietPlan, Meal } from '@/api/entities';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/components/ui/use-toast';

import DateNavigator from '@/components/dashboard/DateNavigator';
import AddDietPlanDialog from '@/components/diet/AddDietPlanDialog';
import MacroTrendCharts from '@/components/diet/MacroTrendCharts';

import dietPlanTemplates from '@/data/dietPlans.json';
import { buildDashboardStats } from '@/utils/stats';
import { buildDietPlanEvaluation, formatMacroDifference } from '@/utils/dietPlan';

const STATUS_STYLES = {
  on_track: {
    label: 'On track',
    icon: CheckCircle2,
    text: 'text-emerald-700',
    chip: 'bg-emerald-50 border border-emerald-100 text-emerald-700',
  },
  slightly_off: {
    label: 'Slightly off',
    icon: AlertTriangle,
    text: 'text-amber-700',
    chip: 'bg-amber-50 border border-amber-100 text-amber-700',
  },
  off_plan: {
    label: 'Off plan',
    icon: XOctagon,
    text: 'text-red-600',
    chip: 'bg-red-50 border border-red-100 text-red-700',
  },
};

function getStatusStyles(status) {
  return STATUS_STYLES[status] || STATUS_STYLES.on_track;
}

function sumMacroFromMeals(meals, key) {
  return meals.reduce((total, meal) => total + Number(meal?.[key] || 0), 0);
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

export default function DietPlans() {
  const { toast } = useToast();
  const [plans, setPlans] = useState([]);
  const [activePlan, setActivePlan] = useState(null);
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [meals, setMeals] = useState([]);
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function initialize() {
      setIsLoading(true);
      try {
        const [planList, mealList] = await Promise.all([
          DietPlan.list(),
          Meal.list('-created_date', 200),
        ]);

        if (!isMounted) {
          return;
        }

        const active = planList.find((plan) => plan.isActive) || planList[0] || null;
        setPlans(planList);
        setActivePlan(active);
        setSelectedPlanId((current) => {
          if (current && planList.some((plan) => plan.id === current)) {
            return current;
          }
          return active?.id || null;
        });
        setMeals(mealList);
      } catch (error) {
        console.error('Failed to load plans or meals', error);
        toast({
          title: 'Unable to load diet data',
          description: error.message || 'Please refresh to try again.',
          variant: 'destructive',
        });
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    initialize();

    return () => {
      isMounted = false;
    };
  }, [toast]);

  const selectedPlan = useMemo(() => {
    if (!selectedPlanId) {
      return activePlan || plans[0] || null;
    }
    return plans.find((plan) => plan.id === selectedPlanId) || activePlan || plans[0] || null;
  }, [plans, selectedPlanId, activePlan]);

  const dashboardStats = useMemo(
    () => buildDashboardStats(meals, selectedDate),
    [meals, selectedDate],
  );

  const selectedMeals = useMemo(() => dashboardStats.todayMeals || [], [dashboardStats]);

  const actualTotals = useMemo(() => {
    if (!selectedPlan) {
      return {};
    }

    const keys = Object.keys(selectedPlan.macroTargets || {});
    return keys.reduce((acc, key) => {
      acc[key] = sumMacroFromMeals(selectedMeals, key);
      return acc;
    }, {});
  }, [selectedMeals, selectedPlan]);

  const evaluation = useMemo(
    () => (selectedPlan ? buildDietPlanEvaluation(selectedPlan, actualTotals) : null),
    [selectedPlan, actualTotals],
  );

  const comparisonDateLabel = useMemo(() => {
    const isToday = isSameDay(selectedDate, startOfDay(new Date()));
    return isToday ? 'today' : format(selectedDate, 'MMMM d, yyyy');
  }, [selectedDate]);

  const totalCalories = actualTotals.calories || 0;

  const handlePlanCreated = async (newPlan) => {
    try {
      const saved = await DietPlan.create(newPlan);
      const planList = await DietPlan.list();
      const active = planList.find((plan) => plan.isActive) || null;
      setPlans(planList);
      setActivePlan(active);
      setSelectedPlanId(saved?.id || active?.id || planList[0]?.id || null);
      toast({
        title: 'Plan saved',
        description: `${saved?.name || newPlan.name} was added to your plans.`,
      });
    } catch (error) {
      console.error('Failed to save plan', error);
      toast({
        title: 'Unable to save plan',
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleSetActivePlan = async (planId) => {
    try {
      const updated = await DietPlan.setActive(planId);
      const planList = await DietPlan.list();
      setPlans(planList);
      setActivePlan(updated);
      setSelectedPlanId(updated?.id || planId);
      toast({
        title: 'Active plan updated',
        description: `${updated?.name || 'Selected plan'} is now active.`,
      });
    } catch (error) {
      console.error('Unable to set active plan', error);
      toast({
        title: 'Unable to set active plan',
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const statusStyles = getStatusStyles(evaluation?.overallStatus);
  const StatusIcon = statusStyles.icon;

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="flex items-center gap-3 text-3xl font-bold text-gray-900">
              <ClipboardList className="h-8 w-8 text-emerald-600" />
              Diet plans
            </h1>
            <p className="text-gray-600">
              Save multiple plans, choose an active one, and compare the targets to your daily meal logs.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {activePlan && (
              <div className="flex items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                <Flame className="h-4 w-4" />
                <span>Active: {activePlan.name}</span>
              </div>
            )}
            <Button onClick={() => setIsDialogOpen(true)}>
              Create plan
            </Button>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card className="border-0 shadow-lg">
              <CardHeader className="flex flex-col gap-3 border-b border-gray-100 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-xl">Your plans</CardTitle>
                  <p className="text-sm text-gray-500">Select a plan to review its guidance or set it as active.</p>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="max-h-[360px] px-6 py-4">
                  <div className="space-y-3">
                    {plans.map((plan) => {
                      const isSelected = selectedPlan?.id === plan.id;
                      return (
                        <button
                          key={plan.id}
                          type="button"
                          onClick={() => setSelectedPlanId(plan.id)}
                          className={`w-full rounded-2xl border px-4 py-3 text-left transition-all ${
                            isSelected
                              ? 'border-emerald-200 bg-emerald-50 shadow-sm'
                              : 'border-gray-100 bg-white hover:border-emerald-200 hover:bg-emerald-50/60'
                          }`}
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-base font-semibold text-gray-900">{plan.name}</p>
                              {plan.goal && <p className="text-sm text-gray-500">{plan.goal}</p>}
                            </div>
                            <div className="flex items-center gap-2">
                              {plan.isActive && (
                                <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-200">Active</Badge>
                              )}
                              <span className="text-xs text-gray-400">Targets: {Object.keys(plan.macroTargets || {}).length}</span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                    {plans.length === 0 && !isLoading && (
                      <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500">
                        No plans yet. Create one to get started.
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardHeader className="flex flex-col gap-3 border-b border-gray-100 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-xl">Plan overview</CardTitle>
                  <p className="text-sm text-gray-500">
                    Key targets, focus areas, and suggested meals for the selected plan.
                  </p>
                </div>
                {selectedPlan && !selectedPlan.isActive && (
                  <Button variant="outline" onClick={() => handleSetActivePlan(selectedPlan.id)}>
                    Set as active
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-6 p-6">
                {selectedPlan ? (
                  <>
                    <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <h2 className="text-lg font-semibold text-gray-900">{selectedPlan.name}</h2>
                          {selectedPlan.goal && <p className="text-sm text-gray-500">{selectedPlan.goal}</p>}
                        </div>
                        <div className="flex items-center gap-3 text-sm text-gray-600">
                          <Droplet className="h-4 w-4 text-emerald-600" />
                          Hydration goal: {selectedPlan.hydrationTarget || 8} cups
                        </div>
                      </div>
                      {selectedPlan.description && (
                        <p className="mt-3 text-sm text-gray-600">{selectedPlan.description}</p>
                      )}
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      {Object.entries(selectedPlan.macroTargets || {}).map(([key, value]) => (
                        <div key={key} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                          <p className="text-sm font-medium text-gray-500">{key.charAt(0).toUpperCase() + key.slice(1)}</p>
                          <p className="text-2xl font-semibold text-gray-900">{value}</p>
                          <p className="text-xs text-gray-400">Daily target</p>
                        </div>
                      ))}
                    </div>

                    {ensureArray(selectedPlan.focus).length > 0 && (
                      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                        <h3 className="text-sm font-semibold text-gray-700">Focus areas</h3>
                        <ul className="mt-2 space-y-1 text-sm text-gray-600">
                          {selectedPlan.focus.map((item, index) => (
                            <li key={`${item}-${index}`} className="flex items-start gap-2">
                              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {ensureArray(selectedPlan.mealGuidance).length > 0 && (
                      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                        <h3 className="text-sm font-semibold text-gray-700">Meal guidance</h3>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          {selectedPlan.mealGuidance.map((meal, index) => (
                            <div key={`${meal.name}-${index}`} className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
                              <p className="text-sm font-semibold text-emerald-700">{meal.name}</p>
                              <p className="text-xs text-emerald-600">{meal.description}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-gray-500">Create or select a plan to see its details.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b border-gray-100">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CalendarDays className="h-5 w-5 text-emerald-600" /> Daily comparison
                </CardTitle>
                <p className="text-sm text-gray-500">
                  Comparing meal logs for {comparisonDateLabel} with the selected plan targets.
                </p>
              </CardHeader>
              <CardContent className="space-y-5 p-6">
                {selectedPlan ? (
                  <>
                    <div className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${statusStyles.chip}`}>
                      <StatusIcon className="h-5 w-5" />
                      <div>
                        <p className={`text-sm font-semibold ${statusStyles.text}`}>{statusStyles.label}</p>
                        <p className="text-xs text-gray-500">{evaluation?.overallMessage || 'Log meals to see feedback.'}</p>
                      </div>
                    </div>

                    {Object.entries(selectedPlan.macroTargets || {}).map(([key, target]) => {
                      const macro = evaluation?.macros.find((item) => item.key === key);
                      const actualValue = Math.round(actualTotals[key] || 0);
                      const differenceText = macro ? formatMacroDifference(macro) : '—';
                      const differenceColor = macro?.status === 'on_track'
                        ? 'text-emerald-600'
                        : macro?.status === 'slightly_off'
                          ? 'text-amber-600'
                          : 'text-red-600';
                      const progressValue = target > 0 ? Math.min(100, (actualValue / target) * 100) : 0;

                      return (
                        <div key={key} className="space-y-2">
                          <div className="flex items-center justify-between text-sm font-medium text-gray-600">
                            <span>{macro?.label || key}</span>
                            <span className="text-gray-900">{actualValue} / {target} {macro?.unit || (key === 'calories' ? 'kcal' : 'g')}</span>
                          </div>
                          <Progress value={progressValue} />
                          <p className={`text-xs ${differenceColor}`}>{differenceText}</p>
                          {macro && macro.difference !== 0 && (
                            <p className="text-xs text-gray-500">{macro.suggestion}</p>
                          )}
                        </div>
                      );
                    })}

                    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                      <p className="text-sm font-semibold text-gray-700">Action steps</p>
                      <ul className="mt-2 space-y-2 text-sm text-gray-600">
                        {evaluation?.actionableTips?.map((tip, index) => (
                          <li key={`${tip}-${index}`} className="flex items-start gap-2">
                            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            <span>{tip}</span>
                          </li>
                        ))}
                        {(evaluation?.actionableTips?.length ?? 0) === 0 && (
                          <li className="text-xs text-gray-500">You&apos;re aligned with the plan—keep the momentum going!</li>
                        )}
                      </ul>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-gray-500">Select a plan to generate comparisons.</p>
                )}
              </CardContent>
            </Card>

            {selectedPlan && (
              <MacroTrendCharts
                plan={selectedPlan}
                meals={meals}
                referenceDate={selectedDate}
              />
            )}

            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b border-gray-100">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Flame className="h-5 w-5 text-emerald-600" /> Meals logged
                </CardTitle>
                <p className="text-sm text-gray-500">
                  {selectedMeals.length} meals logged for {comparisonDateLabel}. Total {Math.round(totalCalories)} kcal.
                </p>
              </CardHeader>
              <CardContent className="space-y-4 p-6">
                {selectedMeals.length > 0 ? (
                  <div className="space-y-4">
                    {selectedMeals.map((meal) => {
                      const mealDate = meal.meal_date || meal.created_date;
                      let timeLabel = '';
                      if (mealDate) {
                        const dateInstance = new Date(mealDate);
                        if (!Number.isNaN(dateInstance.getTime())) {
                          timeLabel = format(dateInstance, 'p');
                        }
                      }
                      return (
                        <div key={meal.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-semibold text-gray-800">{meal.meal_name || 'Logged meal'}</p>
                              <p className="text-xs text-gray-500 capitalize">
                                {meal.meal_type || 'meal'} {timeLabel && `· ${timeLabel}`}
                              </p>
                            </div>
                            <p className="text-sm font-semibold text-emerald-700">{Math.round(meal.calories || 0)} kcal</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/70 p-4 text-sm text-gray-500">
                    No meals logged for this date. Upload a meal photo to start tracking.
                  </div>
                )}
              </CardContent>
            </Card>

            <DateNavigator selectedDate={selectedDate} onSelectDate={(date) => date && setSelectedDate(startOfDay(date))} meals={meals} />
          </div>
        </div>
      </div>

      <AddDietPlanDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        templates={dietPlanTemplates}
        onSubmit={handlePlanCreated}
      />
    </div>
  );
}
