import {
  listMeals,
  createMeal,
  getMealById,
  updateMeal,
  subscribeToMealChanges,
  listDietPlans,
  createDietPlan,
  updateDietPlan,
  setActiveDietPlan,
  getActiveDietPlan,
  getDietPlanById,
} from './storage';
import { get, post } from './client.js';

export const Meal = {
  list: (order, limit) => listMeals(order, limit),
  create: (meal) => createMeal(meal),
  get: (id) => getMealById(id),
  update: (id, updates) => updateMeal(id, updates),
  subscribe: (listener, options) => subscribeToMealChanges(listener, options)
};

export const User = {
  async getCurrentUser() {
    const { user } = await get('/auth/session');
    return user;
  },
  async register(credentials) {
    const { user } = await post('/auth/register', credentials);
    return user;
  },
  async login(credentials) {
    const { user } = await post('/auth/login', credentials);
    return user;
  },
  async logout() {
    await post('/auth/logout', {});
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
