import { listMeals, createMeal } from './storage';

export const Meal = {
  list: (order, limit) => listMeals(order, limit),
  create: (meal) => createMeal(meal)
};

export const User = {
  async getCurrentUser() {
    throw new Error('User management is not configured for the offline storage demo.');
  }
};
