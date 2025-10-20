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
import {
  getCurrentUser,
  listUsers,
  loginUser,
  logoutUser,
  registerUser,
  USER_ROLES,
} from './auth';

export const Meal = {
  list: (order, limit) => listMeals(order, limit),
  create: (meal) => createMeal(meal),
  get: (id) => getMealById(id),
  update: (id, updates) => updateMeal(id, updates),
  subscribe: (listener, options) => subscribeToMealChanges(listener, options)
};

export const User = {
  getCurrent: () => getCurrentUser(),
  login: (credentials) => loginUser(credentials),
  register: (payload) => registerUser(payload),
  logout: () => logoutUser(),
  list: () => listUsers(),
  roles: USER_ROLES,
};

export const DietPlan = {
  list: () => listDietPlans(),
  get: (id) => getDietPlanById(id),
  create: (plan) => createDietPlan(plan),
  update: (id, updates) => updateDietPlan(id, updates),
  setActive: (id) => setActiveDietPlan(id),
  getActive: () => getActiveDietPlan(),
};
