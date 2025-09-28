const NUTRIENT_LABELS = {
  calories: 'Calories',
  protein: 'Protein',
  carbs: 'Carbohydrates',
  fat: 'Fat',
  fiber: 'Fiber',
};

const NUTRIENT_UNITS = {
  calories: 'kcal',
};

const DEFAULT_TOLERANCE = 8;
const NUTRIENT_TOLERANCE = {
  calories: 150,
  protein: 12,
  carbs: 30,
  fat: 12,
  fiber: 6,
};

const SUGGESTIONS = {
  calories: {
    over: 'Dial back portion sizes at dinner or swap a calorie-dense snack for fruit or vegetables.',
    under: 'Layer in a nutrient-dense snack such as Greek yogurt with nuts or a smoothie with oats.',
  },
  protein: {
    over: 'Balance higher protein days with extra vegetables and hydration to support digestion.',
    under: 'Add lean protein to breakfast or include legumes/seeds with midday meals.',
  },
  carbs: {
    over: 'Choose slower-digesting carbohydrates and trim added sugars from snacks.',
    under: 'Add a serving of whole grains or starchy vegetables around your workouts.',
  },
  fat: {
    over: 'Limit added oils and dressings; emphasize grilled or baked preparations.',
    under: 'Include healthy fats such as avocado, nuts, or olive oil to support satiety.',
  },
  fiber: {
    over: 'Stay hydrated and space fiber across meals to support digestion.',
    under: 'Increase vegetables, legumes, or chia seeds to close the fiber gap.',
  },
};

function getLabel(key) {
  return NUTRIENT_LABELS[key] || key;
}

function getUnit(key) {
  return NUTRIENT_UNITS[key] || 'g';
}

function getTolerance(key, target) {
  const base = NUTRIENT_TOLERANCE[key];
  if (typeof base === 'number') {
    return base;
  }
  const derived = typeof target === 'number' && target > 0 ? Math.max(DEFAULT_TOLERANCE, target * 0.1) : DEFAULT_TOLERANCE;
  return Math.round(derived);
}

function getSuggestion(key, difference) {
  if (difference === 0) {
    return 'You matched this target exactly—keep the same habits tomorrow.';
  }

  const direction = difference > 0 ? 'over' : 'under';
  const suggestionsForKey = SUGGESTIONS[key];
  if (suggestionsForKey && suggestionsForKey[direction]) {
    return suggestionsForKey[direction];
  }

  if (direction === 'over') {
    return 'Consider trimming portion sizes slightly or balancing the meal with more vegetables.';
  }

  return 'Add a modest portion to meals or schedule a snack that fits the plan guidelines.';
}

export function buildDietPlanEvaluation(plan, actualTotals = {}) {
  if (!plan || typeof plan !== 'object') {
    return null;
  }

  const targets = plan.macroTargets || {};
  const macros = [];

  Object.entries(targets).forEach(([key, targetValue]) => {
    const numericTarget = Number(targetValue) || 0;
    const actual = Number(actualTotals[key]) || 0;
    const difference = actual - numericTarget;
    const tolerance = getTolerance(key, numericTarget);
    const severity = Math.abs(difference);
    let status = 'on_track';

    if (severity > tolerance * 1.75) {
      status = 'off_plan';
    } else if (severity > tolerance) {
      status = 'slightly_off';
    }

    const percent = numericTarget > 0 ? (difference / numericTarget) * 100 : 0;

    macros.push({
      key,
      label: getLabel(key),
      unit: getUnit(key),
      actual: Math.round(actual),
      target: Math.round(numericTarget),
      difference: Math.round(difference),
      percentDifference: Math.round(percent),
      direction: difference === 0 ? 'aligned' : difference > 0 ? 'over' : 'under',
      status,
      suggestion: getSuggestion(key, difference),
      tolerance,
    });
  });

  const offPlanCount = macros.filter((macro) => macro.status === 'off_plan').length;
  const slightlyOffCount = macros.filter((macro) => macro.status === 'slightly_off').length;

  let overallStatus = 'on_track';
  if (offPlanCount > 0) {
    overallStatus = 'off_plan';
  } else if (slightlyOffCount > 0) {
    overallStatus = 'slightly_off';
  }

  const sortedByDeviation = [...macros].sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
  const priorityMacros = sortedByDeviation.filter((macro) => macro.difference !== 0).slice(0, 2);

  let overallMessage = '';
  switch (overallStatus) {
    case 'on_track':
      overallMessage = `You are on track with the ${plan.name} plan—nice consistency!`;
      break;
    case 'slightly_off':
      overallMessage = 'A few small adjustments will bring you right back to the plan targets.';
      break;
    default:
      overallMessage = 'Today drifted from the plan. Focus on the biggest gaps to realign tomorrow.';
      break;
  }

  const actionableTips = [];
  priorityMacros.forEach((macro) => {
    actionableTips.push(`${macro.label}: ${macro.suggestion}`);
  });

  if (Array.isArray(plan.tips)) {
    plan.tips.forEach((tip) => {
      if (typeof tip === 'string' && tip.trim().length > 0) {
        actionableTips.push(tip.trim());
      }
    });
  }

  return {
    overallStatus,
    overallMessage,
    macros,
    priorityMacros,
    actionableTips,
  };
}

export function formatMacroDifference(macro) {
  if (!macro) {
    return '';
  }

  const { difference, unit, direction } = macro;
  if (difference === 0) {
    return 'On target';
  }

  const amount = Math.abs(difference);
  const suffix = unit ? ` ${unit}` : '';
  const directionLabel = direction === 'over' ? 'over' : 'under';
  return `${amount}${suffix} ${directionLabel}`;
}
