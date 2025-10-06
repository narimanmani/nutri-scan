import {
  listMeals,
  createMeal,
  getMealById,
  updateMeal,
  deleteMeal,
  subscribeToMealChanges,
  listDietPlans,
  listDietPlanTemplates,
  createDietPlan,
  updateDietPlan,
  setActiveDietPlan,
  getActiveDietPlan,
  getDietPlanById,
  deleteDietPlan,
} from './storage';

export const Meal = {
  list: (order, limit) => listMeals(order, limit),
  create: (meal) => createMeal(meal),
  get: (id) => getMealById(id),
  update: (id, updates) => updateMeal(id, updates),
  delete: (id) => deleteMeal(id),
  subscribe: (listener, options) => subscribeToMealChanges(listener, options)
};

export const User = {
  async getCurrentUser() {
    throw new Error('User management is not configured for the offline storage demo.');
  }
};

export const DietPlan = {
  list: (options) => listDietPlans(options),
  listTemplates: () => listDietPlanTemplates(),
  get: (id) => getDietPlanById(id),
  create: (plan) => createDietPlan(plan),
  update: (id, updates) => updateDietPlan(id, updates),
  setActive: (id) => setActiveDietPlan(id),
  getActive: () => getActiveDietPlan(),
  delete: (id) => deleteDietPlan(id),
};
