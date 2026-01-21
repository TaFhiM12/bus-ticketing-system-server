import { POPULAR_ROUTES } from "./popularRoutes.js";

export const ALL_CITIES = [...new Set([
  ...POPULAR_ROUTES.map(r => r.from),
  ...POPULAR_ROUTES.map(r => r.to)
])];

export function getTerminals(city) {
  const terminals = {
    "Dhaka": ["Gabtoli", "Sayedabad", "Mohakhali", "Arambagh"],
    "Chittagong": ["Dampara", "GEC Circle", "Oxygen", "Bahaddarhat"],
    "Cox's Bazar": ["Bus Terminal", "Kolatali", "Hotel Sea Crown"],
    "Sylhet": ["Kadamtali", "Subidbazar", "Ambarkhana"],
    "Khulna": ["Sonadanga", "Gollamari", "Rupsha"],
    "Rajshahi": ["Shaheb Bazar", "New Market", "Terminal"],
    "Barisal": ["Natun Bazar", "Rupatali", "Nobogram"]
  };
  
  return terminals[city] || ["Main Terminal"];
}