import {
  listMeals,
  createMeal,
  getMealById,
  updateMeal,
  listDietPlans,
  createDietPlan,
  updateDietPlan,
  setActiveDietPlan,
  getActiveDietPlan,
  getDietPlanById,
} from './storage';

export const Meal = {
  list: (order, limit) => listMeals(order, limit),
  create: (meal) => createMeal(meal),
  get: (id) => getMealById(id),
  update: (id, updates) => updateMeal(id, updates)
};

export const User = {
  async getCurrentUser() {
    throw new Error('User management is not configured for the offline storage demo.');
  }
};

export const DietPlan = {
  list: () => listDietPlans(),
  get: (id) => getDietPlanById(id),
  create: (plan) => createDietPlan(plan),
  update: (id, updates) => updateDietPlan(id, updates),
  setActive: (id) => setActiveDietPlan(id),
  getActive: () => getActiveDietPlan(),
};
